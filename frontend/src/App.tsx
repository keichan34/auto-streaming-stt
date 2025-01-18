import { useCallback, useEffect, useState } from "react";
import { exponentialBackoffMs } from "./lib/utils";
import { askPermissionAndSubscribe } from "./lib/webpush";
import { useAtomValue, useSetAtom } from "jotai";
import { focusMessageIdAtom, loadTranscriptionBeforeIdAtom, pastTranscriptionIdsAtom, summariesAtom } from "./atoms";
import TranscriptionListView from "./components/TranscriptionListView";

function App() {
  const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const setPastTranscriptionIds = useSetAtom(pastTranscriptionIdsAtom);
  const loadTranscriptionBeforeId = useAtomValue(loadTranscriptionBeforeIdAtom);
  const setFocusMessageId = useSetAtom(focusMessageIdAtom);
  const setSummaries = useSetAtom(summariesAtom);
  const [reload, setReload] = useState(0);
  const [reconnect, setReconnect] = useState(0);

  const [isSubscribed, setIsSubscribed] = useState(localStorage.getItem('isSubscribed') === 'true');

  const subscribeHandler = useCallback<React.MouseEventHandler>(async (event) => {
    event.preventDefault();
    await askPermissionAndSubscribe();
    setIsSubscribed(true);
    localStorage.setItem('isSubscribed', 'true');
  }, []);

  useEffect(() => {
    (async () => {
      const resp = await fetch(`/api/streams/`);
      const data = await resp.json() as string[];
      setPastTranscriptionIds((oldData) => {
        return [...new Set([...oldData, ...data])];
      });
    })();
  }, [reload, setPastTranscriptionIds]);

  useEffect(() => {
    if (!loadTranscriptionBeforeId) {
      return;
    }
    (async () => {
      const resp = await fetch(`/api/streams/?before=${loadTranscriptionBeforeId}`);
      const data = await resp.json() as string[];
      setPastTranscriptionIds((oldData) => {
        const newData = [...new Set([...oldData, ...data])];
        newData.sort((a, b) => (a > b ? -1 : 1));
        return newData;
      });
    })();
  }, [loadTranscriptionBeforeId, setPastTranscriptionIds]);

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      console.log('message received', event.data);
      if (event.data.type === 'open-notif') {
        const id = event.data.id;
        setFocusMessageId(id);
        setReload((prev) => prev + 1);
      }
    };
    navigator.serviceWorker.addEventListener('message', messageHandler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
    };
  }, [setFocusMessageId]);

  useEffect(() => {
    // reload when the app becomes active
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setReload((prev) => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

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
        setPastTranscriptionIds((oldData) => {
          const data = [...new Set([...oldData, message.data.streamId])];
          data.sort((a, b) => (a > b ? -1 : 1));
          return data;
        });
      } else if (message.type === "summary") {
        setSummaries((prev) => {
          return {
            ...prev,
            [message.data.streamId]: message.data.summary,
          };
        });
      }
    });

    ws.addEventListener('close', () => {
      if (cleanup) {
        // we're already cleaning up, so don't reconnect
        return;
      }
      // console.log('websocket closed, reconnecting...');
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
  }, [reconnect, setPastTranscriptionIds, setSummaries]);

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
