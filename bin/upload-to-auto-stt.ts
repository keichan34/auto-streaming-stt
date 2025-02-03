import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

// Files are in ./out
// They are in the format:
// - <streamId>.mp3 - the MP3 audio recording
// - <streamId>.txt - the transcription of the audio in text form -- this is not uploaded
// - <streamId>.summary.txt - the summary of the transcription
// - <streamId>.json - a newline-delimted JSON file of TranscriptionResult objects
//
// We want to upload the summary, JSON, and MP3 files to the server.
// The server accepts the following requests:
// - POST ${AUTO_STT_API_URL}/transcriptions - uploads JSON and summary. Format: `{"id": "<streamId>", "transcription": {"summary": "<summary>", "transcription": [...contents of the JSON file...]}}`
// - POST ${AUTO_STT_API_URL}/transcriptions/<streamId>/recording - uploads MP3 file

const AUTO_STT_API_URL = process.env.AUTO_STT_API_URL!;
const AUTO_STT_API_KEY = process.env.AUTO_STT_API_KEY!;

const outDir = path.join(__dirname, '..', 'out');

async function main() {
  const files = await fs.readdir(outDir);
  const streamIds = new Set<string>();
  for (const file of files) {
    const streamId = path.basename(file, path.extname(file));
    const summaryPath = path.join(outDir, `${streamId}.summary.txt`);
    if (!existsSync(summaryPath)) {
      continue;
    }
    streamIds.add(streamId);
  }

  for (const streamId of streamIds) {
    const summaryPath = path.join(outDir, `${streamId}.summary.txt`);
    const jsonPath = path.join(outDir, `${streamId}.json`);
    const mp3Path = path.join(outDir, `${streamId}.mp3`);
    console.log(`Uploading ${mp3Path} to ${AUTO_STT_API_URL}/transcriptions/${streamId}/recording`);

    // Upload the MP3 file
    const mp3Data = await fs.readFile(mp3Path);
    const mp3Resp = await fetch(`${AUTO_STT_API_URL}/transcriptions/${streamId}/recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mpeg',
        'Authorization': AUTO_STT_API_KEY,
      },
      body: mp3Data,
    });
    if (!mp3Resp.ok) {
      throw new Error(`Failed to upload MP3 file: ${mp3Resp.status} ${mp3Resp.statusText}`);
    }

    const summary = await fs.readFile(summaryPath, 'utf-8');
    const json = await fs.readFile(jsonPath, 'utf-8');
    const parsedJson = json.split('\n').map((line) => line.trim()).filter((line) => line).map((line) => JSON.parse(line));

    console.log(`Uploading summary and JSON for ${streamId} to ${AUTO_STT_API_URL}/transcriptions`);
    const response = await fetch(`${AUTO_STT_API_URL}/transcriptions?broadcast=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTO_STT_API_KEY,
      },
      body: JSON.stringify({
        id: streamId,
        transcription: {
          summary,
          transcription: parsedJson,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to upload summary and JSON: ${response.status} ${response.statusText}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
