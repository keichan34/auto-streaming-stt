import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// File is in ./data/subscriptions.json
// It is a newline-delimited JSON file of PushSubscription objects

const AUTO_STT_API_URL = process.env.AUTO_STT_API_URL!;
const AUTO_STT_API_KEY = process.env.AUTO_STT_API_KEY!;

const subsFile = path.join(__dirname, '..', 'data', 'subscriptions.json');

// async function sha1(data: string) {
//   const hash = crypto.createHash('sha1');
//   hash.update(data);
//   return hash.digest('hex');
// }

async function main() {
  const json = await fs.readFile(subsFile, 'utf-8');
  const parsedJson = json.split('\n').map((line) => line.trim()).filter((line) => line).map((line) => JSON.parse(line));
  for (const sub of parsedJson) {
    if (!sub.endpoint || !sub.keys) {
      console.error(`Invalid subscription: ${JSON.stringify(sub)}`);
      continue;
    }
    console.log(`Uploading subscription for ${sub.endpoint}`);
    const response = await fetch(`${AUTO_STT_API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sub),
    });
    if (!response.ok) {
      throw new Error(`Failed to upload subscription: ${response.status} ${response.statusText}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
