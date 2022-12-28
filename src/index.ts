import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";
import { spawn } from 'child_process';

const runSox = (outStream: PassThrough) => new Promise<void>((resolve, reject) => {
  const soxProcess = spawn('/usr/bin/sox', [
    '-t', 'alsa', 'hw:0',
    '-c', '1', '-b', '16', '-r', '8000', '-e', 'signed-integer',
    '-t', 'raw', '-',
    'silence', '1', '0.5', '0.1%', '1', '0.5', '0.1%',
  ], {
    stdio: ['pipe', 'pipe', process.stderr],
  });
  
  soxProcess.stdout.pipe(outStream);

  soxProcess.on('close', (code) => {
    if (!code || code > 0) {
      return reject(new Error(`sox exited with ${code || 'undefined'}`));
    }
    resolve();
  });

  soxProcess.on('error', (err) => {
    reject(err);
  })
});

function getAudioStream() {
  const audioPayloadStream = new PassThrough({ highWaterMark: 1 * 1024 });
  const audioStream = async function* () {
    for await (const chunk of audioPayloadStream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  };
  const soxPromise = runSox(audioPayloadStream);
  return {
    audioStream,
    soxPromise,
  };
}

async function main() {
  const client = new TranscribeStreamingClient({
    region: 'ap-northeast-1',
  });

  for (;;) {
    const {
      audioStream,
      soxPromise,
    } = getAudioStream();

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: 'ja-JP',
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 8000,
      AudioStream: audioStream(),
    });
    const response = await client.send(command);
    if (!response.TranscriptResultStream) {
      console.error('AWS Error');
      continue;
    }
    for await (const event of response.TranscriptResultStream) {
      if (!event.TranscriptEvent) { return; }
      const message = event.TranscriptEvent;
      const results = event.TranscriptEvent.Transcript?.Results;
      console.log(message);
      console.log(JSON.stringify(results));
    }

    await soxPromise;
  }
}

main();
