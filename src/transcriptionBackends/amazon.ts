import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import { AudioStreamEvent, TranscriptionFunc, TranscriptionResult } from ".";

const TranscribeClient = new TranscribeStreamingClient({
  region: 'ap-northeast-1',
});

const runTranscriptionUntilDone: TranscriptionFunc = async function* (audioStream) {
  let done: boolean = false;

  while (!done) {
    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: 'ja-JP',
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 48000,
        AudioStream: audioStream,
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

export default runTranscriptionUntilDone;
