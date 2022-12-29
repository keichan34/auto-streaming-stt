import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";
import { spawn } from 'child_process';

const runSox = (outStream: PassThrough) => new Promise<void>((resolve, reject) => {
  const soxProcess = spawn('/usr/bin/sox', [
    '-t', 'alsa', 'hw:0',
    '-c', '1', '-b', '16', '-r', '48000', '-e', 'signed-integer', '-L',
    '-t', 'raw', '-',
    'silence', '1', '0.5', '0.1%', '1', '0.5', '0.1%',
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
  const audioPayloadStream = new PassThrough({ highWaterMark: 1 * 1024 });
  const audioStarted = new Promise<void>((resolve) => {
    const payloadStreamReadableHandler = () => {
      audioPayloadStream.off('readable', payloadStreamReadableHandler);
      resolve();
    };
    audioPayloadStream.on('readable', payloadStreamReadableHandler);
  });
  const audioStream = async function* () {
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

async function main() {
  const client = new TranscribeStreamingClient({
    region: 'ap-northeast-1',
  });

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

    await audioStarted;
    console.log('Audio detected, starting transcription...');
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
        if (result.IsPartial) { continue; }
        console.log((result.Alternatives || [])[0].Transcript);
      }
    }

    await soxPromise;
    console.log('Transcription finished.');
  }
}

main();
