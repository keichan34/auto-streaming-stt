
import dayjs from 'dayjs';
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { rawToMp3 } from "./mp3";
import EventEmitter from "node:events";

import runTranscriptionUntilDoneGoogle from './transcriptionBackends/google';
import runTranscriptionUntilDoneAzure from './transcriptionBackends/azure';
import { AudioStreamEvent } from './transcriptionBackends';

const OUTPUT_DIR = process.env['OUTPUT_DIR'] || path.join(process.cwd(), 'out');

const runSox = (outStream: PassThrough) => new Promise<void>((resolve, reject) => {
  let soxPath = '/usr/bin/sox';
  let inputDef: string[] = ['-t', 'alsa', 'hw:0'];
  if (process.platform === 'darwin') {
    soxPath = '/opt/homebrew/bin/sox';
    inputDef = ['-t', 'coreaudio', 'default'];
  }
  const soxProcess = spawn(soxPath, [
    ...inputDef,
    '-c', '1', '-b', '16', '-r', '16000', '-e', 'signed-integer', '-L',
    '-t', 'raw', '-',
    'silence', // silence filter
    '1', '0.5', '0.10%', // start recording when 1 period of 0.5s is above 0.10% (0.5s)
    '3', '1.0', '0.15%', // end recording when 5 periods of 1.0s is below 0.15% (Amazon Transcribe times out after 15 seconds of silence)
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

  // const audioStream: () => AsyncGenerator<AudioStreamEvent, void, unknown> = async function* () {
  //   for await (const chunk of audioPayloadStream) {
  //     yield { AudioEvent: { AudioChunk: chunk } };
  //   }
  // };

  const soxPromise = runSox(audioPayloadStream);

  return {
    audioStream: audioPayloadStream,
    soxPromise,
    audioStarted,
  };
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

      let contentLength = 0;

      await Promise.all([
        (async () => {
          const textOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.txt'), 'w');
          const jsonOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.json'), 'w');
          let lastContent = '';
          for await (const item of runTranscriptionUntilDoneGoogle(audioStream)) {
            if (item.content === '') { continue; }
            if (item.partial && item.content === lastContent) { continue; }
            lastContent = item.content;

            this.emit('transcript', { streamId, item });

            if (item.partial) {
              console.log('[Partial]', item.content);
            } else {
              contentLength += item.content.trim().length;

              console.log(item.content);
              textOut.write(item.content + '\n');
              jsonOut.write(JSON.stringify(item) + '\n');
            }
          }
          await Promise.all([
            textOut.close(),
            jsonOut.close(),
          ]);
        })(),
        (async () => {
          const textOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.azure.txt'), 'w');
          const jsonOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.azure.json'), 'w');
          let lastContent = '';
          for await (const item of runTranscriptionUntilDoneAzure(audioStream)) {
            if (item.content === '') { continue; }
            if (item.partial && item.content === lastContent) { continue; }
            lastContent = item.content;

            if (item.partial) {
              console.log('[Azure Partial]', item.content);
            } else {
              console.log('[Azure]', item.content);
              textOut.write(item.content + '\n');
              jsonOut.write(JSON.stringify(item) + '\n');
            }
          }
          await Promise.all([
            textOut.close(),
            jsonOut.close(),
          ]);
        })(),
      ]);

      await soxPromise;
      console.log(`Transcription finished.`);
      this.emit('streamEnded', {
        streamId,
        contentLength,
      });
    }
  }
}
