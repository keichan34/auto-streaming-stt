import fs from "node:fs";
import path from "node:path";
import { queue } from "async";
import webpush, { VapidKeys, PushSubscription } from "web-push";

const dataDir = path.join(__dirname, "..", "data");

const vapidKeys: VapidKeys = JSON.parse(fs.readFileSync(
  path.join(dataDir, "vapid.json"),
  "utf-8"
));

const subscriptionsFilePath = path.join(dataDir, "subscriptions.json");
let subscriptionsFileHandle: fs.promises.FileHandle | null = null;
async function openSubscriptions() {
  if (subscriptionsFileHandle) {
    return subscriptionsFileHandle;
  }

  subscriptionsFileHandle = await fs.promises.open(
    subscriptionsFilePath,
    "a",
  );
  return subscriptionsFileHandle;
}
const subscriptions: PushSubscription[] = [];
if (fs.existsSync(subscriptionsFilePath)) {
  for (const line of fs.readFileSync(subscriptionsFilePath, "utf-8").split("\n")) {
    if (line) {
      subscriptions.push(JSON.parse(line));
    }
  }
}

webpush.setVapidDetails(
  "https://bousai.yakushima.blog/",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

export const publicKey = vapidKeys.publicKey;

export async function subscribe(subscription: PushSubscription) {
  const f = await openSubscriptions();
  subscriptions.push(subscription);
  await f.write(JSON.stringify(subscription) + "\n");
}

export async function broadcast(message: string) {
  console.log("[webpush] broadcasting: ", message)
  const q = queue(async (subscription: PushSubscription) => {
    await webpush.sendNotification(subscription, message);
  }, 10);
  q.push(subscriptions);
  await q.drain();
}
