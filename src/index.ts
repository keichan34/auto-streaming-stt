import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import dayjs from 'dayjs';
import { Duplex, PassThrough } from "node:stream";
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { rawToMp3 } from "./mp3";

const OUTPUT_DIR = process.env['OUTPUT_DIR'] || path.join(process.cwd(), 'out');



const runSox = (outStream: PassThrough) => new Promise<void>((resolve, reject) => {
  const soxProcess = spawn('/usr/bin/sox', [
    '-t', 'alsa', 'hw:0',
    '-c', '1', '-b', '16', '-r', '48000', '-e', 'signed-integer', '-L',
    '-t', 'raw', '-',
    'silence', // silence filter
    '1', '0.5', '0.10%', // start recording when 1 period of 0.5s is above 0.10% (0.5s)
    '4', '1.0', '0.15%', // end recording when 4 periods of 1.0s is below 0.15% (4.0s)
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
      resolve(streamId);
    });
  });
  const audioStream = async function* () {
    let mp3Stream: Duplex | undefined = undefined;
    let outStream: fs.WriteStream | undefined = undefined;
    for await (const chunk of audioPayloadStream) {
      if (typeof mp3Stream === 'undefined' || typeof outStream === 'undefined') {
        mp3Stream = rawToMp3();
        const fsStream = fs.createWriteStream(path.join(OUTPUT_DIR, streamId + '.mp3'));
        outStream = mp3Stream.pipe(fsStream);
      }
      mp3Stream.write(chunk);
      yield { AudioEvent: { AudioChunk: chunk } };
    }
    if (typeof outStream !== 'undefined') {
      outStream.close();
    }
  };
  const soxPromise = runSox(audioPayloadStream);
  return {
    audioStream,
    soxPromise,
    audioStarted,
  };
}

async function main() {
  const client = new TranscribeStreamingClient({
    region: 'ap-northeast-1',
  });

  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('Starting...');
  for (;;) {
    const {
      audioStream,
      soxPromise,
      audioStarted,
    } = getAudioStream();

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: 'ja-JP',
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 48000,
      AudioStream: audioStream(),
    });

    const streamId = await audioStarted;
    console.log(`Audio detected, starting transcription... (streamId=${streamId})`);
    const response = await client.send(command);

    if (!response.TranscriptResultStream) {
      console.error('AWS Error');
      continue;
    }

    console.log('Transcription started:');
    for await (const event of response.TranscriptResultStream) {
      if (!event.TranscriptEvent?.Transcript) { continue; }
      const results = event.TranscriptEvent.Transcript.Results || [];
      for (const result of results) {
        if (result.IsPartial) {
          console.log('[Partial]', (result.Alternatives || [])[0].Transcript);
        } else {
          console.log((result.Alternatives || [])[0].Transcript);
        }
      }
    }

    await soxPromise;
    console.log(`Transcription finished.`);
  }
}

main();
