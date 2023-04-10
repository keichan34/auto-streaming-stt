import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { TranscriptionFunc } from '.';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';

const phrases = fs.readFileSync(path.join(__dirname, 'phrases.txt'), 'utf-8').split('\n').map((line) => line.trim()).filter((line) => line !== '');

const subscriptionKey = process.env.AZURE_SPEECH_API_KEY!;
const serviceRegion = "japanwest";

const runTranscriptionUntilDone: TranscriptionFunc = async function* (audioStream) {
  const pushStream = sdk.AudioInputStream.createPushStream();

  const pipelinePromise = pipeline(
    audioStream,
    async function *() {
      for await (const chunk of audioStream) {
        pushStream.write(chunk);
      }
      pushStream.close();
    },
  );

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);

  speechConfig.speechRecognitionLanguage = "ja-JP";
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  // const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer);
  // for (const phrase of phrases) {
  //   phraseList.addPhrase(phrase);
  // }

  const passthroughStream = new PassThrough({ objectMode: true });

  recognizer.recognizing = (_s, e) => {
    if (!e.result.text) return;
    passthroughStream.write({
      partial: true,
      content: e.result.text,
    });
  };
  recognizer.recognized = (_s, e) => {
    if (!e.result.text) return;
    passthroughStream.write({
      partial: false,
      content: e.result.text,
    });
  };
  recognizer.sessionStopped = () => {
    passthroughStream.end();
  };

  const recognizitionPromise = (async () => {
    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          resolve();
        }, (err) => {
          reject(err);
        }
      );
    });
    await pipelinePromise;
    await new Promise<void>((resolve, reject) => {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          resolve();
        }, (err) => {
          reject(err);
        }
      );
    });
  })();

  for await (const data of passthroughStream) {
    yield data;
  }

  await recognizitionPromise;
}

export default runTranscriptionUntilDone;
