import Transcription from "./transcription";

const AUTO_STT_API_URL = process.env.AUTO_STT_API_URL!;
const AUTO_STT_API_KEY = process.env.AUTO_STT_API_KEY!;

if (!AUTO_STT_API_URL && !AUTO_STT_API_KEY) {
  throw new Error('Publisher: Missing AUTO_STT_API_URL and AUTO_STT_API_KEY');
}

/**
 * Start the publisher.
 *
 * This will publish transcriptions to the server.
 * @param transcriber Transcription
 */
function startPublisher(transcriber: Transcription) {
  transcriber.on('finished', async (event) => {
    // TODO: retry logic on network errors

    const { streamId, summary, transcription } = event;
    console.log(`Uploading MP3 and transcription for ${streamId}`);

    const r1 = await fetch(`${AUTO_STT_API_URL}/transcriptions/${streamId}/recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mpeg',
        'Authorization': AUTO_STT_API_KEY,
      },
      body: event.mp3Buffer,
    });
    if (!r1.ok) {
      console.error(`Failed to upload MP3 file: ${r1.status} ${r1.statusText}`);
      return;
    }

    const r2 = await fetch(`${AUTO_STT_API_URL}/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTO_STT_API_KEY,
      },
      body: JSON.stringify({
        id: streamId,
        transcription: {
          summary,
          transcription,
        },
      }),
    });
    if (!r2.ok) {
      console.error(`Failed to upload transcription: ${r2.status} ${r2.statusText}`);
    }

    console.log(`Finished upload MP3 and transcription for ${streamId}`);
  });
}

export default startPublisher;
