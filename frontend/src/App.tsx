/// <reference types="gtag.js" />

import { useCallback, useEffect, useState } from "react";
import { exponentialBackoffMs } from "./lib/utils";
import { askPermissionAndSubscribe } from "./lib/webpush";
import { useSetAtom } from "jotai";
import { focusMessageIdAtom } from "./atoms";
import TranscriptionListView from "./components/TranscriptionListView";
import { useTranscriptionList } from "./lib/dataHooks";
import { useSWRConfig } from "swr";

function App() {
  const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const setFocusMessageId = useSetAtom(focusMessageIdAtom);
  const [reconnect, setReconnect] = useState(0);
  const { mutate: listMutate } = useTranscriptionList();
  const { mutate } = useSWRConfig();

  const [isSubscribed, setIsSubscribed] = useState(localStorage.getItem('isSubscribed') === 'true');

  const subscribeHandler = useCallback<React.MouseEventHandler>(async (event) => {
    event.preventDefault();
    await askPermissionAndSubscribe();
    setIsSubscribed(true);
    localStorage.setItem('isSubscribed', 'true');
    window.gtag('event', 'subscribe');
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const messageHandler = (event: MessageEvent) => {
      console.log('message received', event.data);
      if (event.data.type === 'open-notif') {
        const id = event.data.id;
        setFocusMessageId(id);
        listMutate();
      }
    };
    navigator.serviceWorker.addEventListener('message', messageHandler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
    };
  }, [listMutate, setFocusMessageId]);

  useEffect(() => {
    let cleanup = false;
    let proto = 'ws:'; // http
    if (window.location.protocol === 'https:') {
      proto = 'wss:'; // https
    }
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "streamEnded") {
        if (message.data.contentLength === 0) {
          return;
        }
        listMutate();
      } else if (message.type === "summary") {
        listMutate();
        mutate(
          `/api/streams/${message.data.streamId}.summary.txt`,
          message.data.summary,
        );
      }
    });

    ws.addEventListener('close', () => {
      if (cleanup) {
        // we're already cleaning up, so don't reconnect
        return;
      }
      const delay = exponentialBackoffMs(reconnect, 300);
      setTimeout(() => {
        setReconnect((prev) => prev + 1);
      }, delay);
    });

    let pingTimeout: number;
    const pingFunc = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
      pingTimeout = window.setTimeout(pingFunc, 30_000);
    };

    ws.addEventListener('open', () => {
      // console.log('websocket connected');
      pingFunc();
    });

    return () => {
      cleanup = true;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (typeof pingTimeout !== 'undefined') {
        window.clearTimeout(pingTimeout);
      }
    };
  }, [listMutate, mutate, reconnect]);

  return (
    <div className="container">
      <h1 className="my-4">屋久島の防災放送</h1>

      { !isRunningStandalone && (
        <p>
          このサイトをホーム画面に追加すると、通知を受け取ることができます。
        </p>
      )}

      { ('Notification' in window) && (!isSubscribed && (
        <div className="d-grid gap-2">
          <button type="button" className="btn btn-primary mb-4" onClick={subscribeHandler}>
            通知を受け取る
          </button>
        </div>
      )) }

      <TranscriptionListView />
    </div>
  );
}

export default App;
