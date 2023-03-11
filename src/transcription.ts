import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import dayjs from 'dayjs';
import { PassThrough, pipeline as _pipeline } from "node:stream";
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from "node:util";
import { rawToMp3 } from "./mp3";
import EventEmitter from "node:events";

type AudioStreamEvent = {
  AudioEvent: {
    AudioChunk: any;
  };
};

type TranscriptionResult = {
  partial: boolean
  content: string
}

const pipeline = promisify(_pipeline);

const OUTPUT_DIR = process.env['OUTPUT_DIR'] || path.join(process.cwd(), 'out');

const TranscribeClient = new TranscribeStreamingClient({
  region: 'ap-northeast-1',
});

const runSox = (outStream: PassThrough) => new Promise<void>((resolve, reject) => {
  const soxProcess = spawn('/usr/bin/sox', [
    '-t', 'alsa', 'hw:0',
    '-c', '1', '-b', '16', '-r', '48000', '-e', 'signed-integer', '-L',
    '-t', 'raw', '-',
    'silence', // silence filter
    '1', '0.5', '0.10%', // start recording when 1 period of 0.5s is above 0.10% (0.5s)
    '10', '1.0', '0.15%', // end recording when 10 periods of 1.0s is below 0.15% (Amazon Transcribe times out after 15 seconds of silence)
  ], {
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  soxProcess.stdout.pipe(outStream);

  soxProcess.on('close', (code) => {
    if (code !== null && code > 0) {
      return reject(new Error(`sox exited with ${code}`));
    }
    resolve();
  });

  soxProcess.on('error', (err) => {
    reject(err);
  })
});

function getAudioStream() {
  let streamId: string | undefined = undefined;

  const audioPayloadStream = new PassThrough({ highWaterMark: 1 * 1024 });
  const audioStarted = new Promise<string>((resolve) => {
    audioPayloadStream.once('readable', () => {
      streamId = dayjs().format('YYYYMMDDHHmmss');

      // Initialize the MP3 streaming encoder
      const mp3Stream = rawToMp3();
      const fsStream = fs.createWriteStream(path.join(OUTPUT_DIR, streamId + '.mp3'));
      pipeline(audioPayloadStream, mp3Stream, fsStream);

      resolve(streamId);
    });
  });

  const audioStream: () => AsyncGenerator<AudioStreamEvent, void, unknown> = async function* () {
    for await (const chunk of audioPayloadStream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  };

  const soxPromise = runSox(audioPayloadStream);

  return {
    audioStream,
    soxPromise,
    audioStarted,
  };
}

async function *runTranscriptionUntilDone(
  audioStream: () => AsyncGenerator<AudioStreamEvent, void, unknown>
) {
  let done: boolean = false;

  while (!done) {
    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: 'ja-JP',
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 48000,
        AudioStream: audioStream(),
      });
      const response = await TranscribeClient.send(command);

      if (!response.TranscriptResultStream) {
        console.error('AWS Error');
        continue;
      }

      console.log('Transcription started:');
      for await (const event of response.TranscriptResultStream) {
        if (!event.TranscriptEvent?.Transcript) { continue; }
        const results = event.TranscriptEvent.Transcript.Results || [];
        for (const result of results) {
          const out: TranscriptionResult = {
            partial: !!result.IsPartial,
            content: (result.Alternatives || [])[0].Transcript || "",
          }
          yield out;
        }
      }
      done = true;
    } catch (e) {
      console.error(`Error in transcription:`, e, 'Retrying...');
    }
  }
}

export default class Transcription extends EventEmitter {
  async start() {
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    console.log('Starting...');
    for (;;) {
      const {
        audioStream,
        soxPromise,
        audioStarted,
      } = getAudioStream();

      const streamId = await audioStarted;
      console.log(`Audio detected, starting transcription... (streamId=${streamId})`);

      this.emit('streamStarted', { streamId });
      const textOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.txt'), 'w');
      for await (const item of runTranscriptionUntilDone(audioStream)) {
        this.emit('transcript', { streamId, item });

        if (item.partial) {
          console.log('[Partial]', item.content);
        } else {
          console.log(item.content);
          textOut.write(item.content + '\n');
        }
      }

      await soxPromise;
      await textOut.close();
      console.log(`Transcription finished.`);
      this.emit('streamEnded', { streamId });
    }
  }
}
