import gcloudSpeech from "@google-cloud/speech";
import { google } from "@google-cloud/speech/build/protos/protos";
import { AudioStreamEvent, TranscriptionFunc, TranscriptionResult } from ".";
import { pipeline } from "node:stream/promises";

const gSpeechClient = new gcloudSpeech.SpeechClient({
  // auth: process.env.GOOGLE_API_KEY!,
});

const runTranscriptionUntilDone: TranscriptionFunc = async function* (audioStream) {
  let done: boolean = false;

  while (!done) {
    const request: google.cloud.speech.v1.IStreamingRecognitionConfig = {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: 'ja-JP',
        model: 'latest_long',
        adaptation: {
          phraseSetReferences: [
            "projects/987120412612/locations/global/phraseSets/yakushima-bosai"
          ],
        },
      },
      interimResults: true,
    };
    const transcriptStream = gSpeechClient.streamingRecognize(request);

    const pipelinePromise = pipeline(
      audioStream,
      transcriptStream,
    );

    for await (const _data of transcriptStream) {
      const data = _data as google.cloud.speech.v1.StreamingRecognizeResponse;
      // console.log(data);
      const result = data.results[0];
      if (!result || !(result.alternatives || [])[0]) {
        // done
        break;
      }
      const out: TranscriptionResult = {
        partial: !result.isFinal,
        content: (result.alternatives || [])[0].transcript || "",
      }
      yield out;
    }

    await pipelinePromise;
    done = true;
  }
}

export default runTranscriptionUntilDone;