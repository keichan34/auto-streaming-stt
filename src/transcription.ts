
import dayjs from 'dayjs';
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { rawToMp3 } from "./mp3";
import EventEmitter from "node:events";

import runTranscriptionUntilDoneGoogle from './transcriptionBackends/google';
import { queue, QueueObject } from 'async';
import { createSummary } from './summarizer';
// import runTranscriptionUntilDoneAzure from './transcriptionBackends/azure';
// import { AudioStreamEvent } from './transcriptionBackends';

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
    // the output parameters
      '-c', '1', // one channel
      '-b', '16', // 16 bits
      '-r', '16000', // 16kHz sample rate
      '-e', 'signed-integer', // signed integer encoding
      '-L', // little endian
    '-t', 'raw', '-',
    'silence', // silence filter
    '1', '0.5', '1%', // start recording when 1 period of 0.5s is above 1% (0.5s)
    '1', '0.5', '0.15%', // end recording when 1 periods of 0.5s is below 0.15%
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

export interface TranscriptionEvents {
  streamStarted: { streamId: string };
  transcript: { streamId: string, item: any };
  streamEnded: { streamId: string, contentLength: number };
  summary: { streamId: string, summary: string };
}

declare interface Transcription {
  on<U extends keyof TranscriptionEvents>(
    event: U, listener: (args: TranscriptionEvents[U]) => void
  ): this;

  emit<U extends keyof TranscriptionEvents>(
    event: U, args: TranscriptionEvents[U]
  ): boolean;
}

class Transcription extends EventEmitter {
  summarizerQueue: QueueObject<{streamId: string}>;

  constructor() {
    super();
    this.summarizerQueue = queue(async (task) => {
      const { streamId } = task;
      const text = await fs.promises.readFile(path.join(OUTPUT_DIR, streamId + '.txt'), 'utf-8');
      const summary = await createSummary(text);
      this.emit('summary', { streamId, summary });
      await fs.promises.writeFile(path.join(OUTPUT_DIR, streamId + '.summary.txt'), summary);
    }, 1);
  }

  private async oneLoop() {
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
        let retryCount = 0, done = false;
        while (retryCount < 3 && !done) {
          try {
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
            done = true;
          } catch (err) {
            console.error('error in Google transcription:', err);
            retryCount++;
          }
        }
        await Promise.all([
          textOut.close(),
          jsonOut.close(),
        ]);
      })(),
      // (async () => {
      //   const textOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.azure.txt'), 'w');
      //   const jsonOut = await fs.promises.open(path.join(OUTPUT_DIR, streamId + '.azure.json'), 'w');
      //   let lastContent = '';
      //   for await (const item of runTranscriptionUntilDoneAzure(audioStream)) {
      //     if (item.content === '') { continue; }
      //     if (item.partial && item.content === lastContent) { continue; }
      //     lastContent = item.content;

      //     if (item.partial) {
      //       console.log('[Azure Partial]', item.content);
      //     } else {
      //       console.log('[Azure]', item.content);
      //       textOut.write(item.content + '\n');
      //       jsonOut.write(JSON.stringify(item) + '\n');
      //     }
      //   }
      //   await Promise.all([
      //     textOut.close(),
      //     jsonOut.close(),
      //   ]);
      // })(),
      soxPromise,
    ]);

    console.log(`Transcription finished.`);
    this.emit('streamEnded', {
      streamId,
      contentLength,
    });
    this.summarizerQueue.push({ streamId });
  }

  async start() {
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    console.log('Starting...');
    for (;;) {
      try {
        await this.oneLoop();
      } catch (err) {
        console.error('Unexpected error, restarting...');
        console.error(err);
      }
    }
  }
}

export default Transcription;
