import Transcription, { TranscriptionEventFinished } from "./transcription";
import async from 'async';

const AUTO_STT_API_URL = process.env.AUTO_STT_API_URL!;
const AUTO_STT_API_KEY = process.env.AUTO_STT_API_KEY!;

if (!AUTO_STT_API_URL && !AUTO_STT_API_KEY) {
  throw new Error('Publisher: Missing AUTO_STT_API_URL and AUTO_STT_API_KEY');
}

const MAX_RETRY_COUNT = 3;

type UploadEvent = TranscriptionEventFinished & {
  attempt?: number;
};

const uploadQueue = async.queue<UploadEvent>(async (event) => {
  console.log(`Uploading MP3 and transcription for ${event.streamId}, attempt: ${event.attempt ?? 1}`);
  const r1 = await fetch(`${AUTO_STT_API_URL}/transcriptions/${event.streamId}/recording`, {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/mpeg',
      'Authorization': AUTO_STT_API_KEY,
    },
    body: event.mp3Buffer,
  });
  if (!r1.ok) throw new Error(`Failed MP3 upload: ${r1.status} ${r1.statusText}`);

  const r2 = await fetch(`${AUTO_STT_API_URL}/transcriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTO_STT_API_KEY,
    },
    body: JSON.stringify({
      id: event.streamId,
      transcription: {
        summary: event.summary,
        transcription: event.transcription,
      },
    }),
  });
  if (!r2.ok) throw new Error(`Failed transcription upload: ${r2.status} ${r2.statusText}`);
  console.log(`Finished upload MP3 and transcription for ${event.streamId}`);
}, 1);

uploadQueue.error((err, task) => {
  if ((task.attempt ?? 1) < MAX_RETRY_COUNT) {
    uploadQueue.push({ ...task, attempt: (task.attempt ?? 1) + 1 });
  } else {
    console.error(`Upload failed after ${task.attempt ?? 1} attempts:`, err);
  }
});

/**
 * Start the publisher.
 *
 * This will publish transcriptions to the server.
 * @param transcriber Transcription
 */
function startPublisher(transcriber: Transcription) {
  transcriber.on('finished', (event) => {
    uploadQueue.push({ ...event, attempt: 1 });
  });
}

export default startPublisher;
