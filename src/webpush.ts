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
const subscriptionEndpoints = new Set<string>();
const subscriptions: PushSubscription[] = [];
if (fs.existsSync(subscriptionsFilePath)) {
  for (const line of fs.readFileSync(subscriptionsFilePath, "utf-8").split("\n")) {
    if (line) {
      const subscription = JSON.parse(line);
      subscriptions.push(subscription);
      subscriptionEndpoints.add(subscription.endpoint);
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
  if (subscriptionEndpoints.has(subscription.endpoint)) {
    return;
  }

  const f = await openSubscriptions();
  subscriptions.push(subscription);
  subscriptionEndpoints.add(subscription.endpoint);
  await f.write(JSON.stringify(subscription) + "\n");
}

export async function broadcast(message: string) {
  console.log("[webpush] broadcasting: ", message);
  let subscriptionsModified = false;
  const q = queue(async (subscription: PushSubscription) => {
    try {
      await webpush.sendNotification(subscription, message);
    } catch (err) {
      if (err instanceof webpush.WebPushError) {
        if (err.statusCode === 410) {
          // the subscription is no longer valid, so we'll remove it from our list
          subscriptionEndpoints.delete(subscription.endpoint);
          subscriptions.splice(subscriptions.findIndex((v) => v.endpoint === subscription.endpoint), 1);
          subscriptionsModified = true;
          return;
        }
      }
      throw err;
    }
  }, 10);
  q.push(subscriptions);
  await q.drain();

  // if we removed any subscriptions, we need to write the new list to disk
  if (subscriptionsModified) {
    const f = await openSubscriptions();
    await f.truncate(0);
    for (const subscription of subscriptions) {
      await f.write(JSON.stringify(subscription) + "\n");
    }
  }
}
