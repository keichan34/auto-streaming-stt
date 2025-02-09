/// <reference types="gtag.js" />

import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { focusMessageIdAtom, todayDateAtom } from "./atoms";
import TranscriptionListView from "./components/TranscriptionListView";
import { useTranscriptionList } from "./lib/dataHooks";
import NotificationButton from "./components/NotificationButton";

function App() {
  const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const setFocusMessageId = useSetAtom(focusMessageIdAtom);
  const todayDate = useAtomValue(todayDateAtom);
  const { mutate: listMutate } = useTranscriptionList(todayDate);

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

  return (
    <div className="min-vh-100 d-flex flex-column">
      <header className="bg-primary-subtle text-center py-3">
        <h1 className="fs-4">屋久島の防災放送</h1>
      </header>

      <main className="flex-fill container">
        { !isRunningStandalone && (
          <p>
            このサイトをホーム画面に追加すると、通知を受け取ることができます。
          </p>
        )}

        <NotificationButton />
        <TranscriptionListView />
      </main>

      <footer className="bg-dark text-white text-center py-3">
        <p>このアプリは非公式のもの・一切の責任を負いません</p>
        <p><a className="text-light" href="https://github.com/keichan34/auto-streaming-stt" rel="noopener noreferrer" target="_blank">詳細はこちら</a>・<a className="text-light" href="mailto:keita+yakubousai@kbys.me?subject=屋久島防災放送について" rel="noopener noreferrer" target="_blank">連絡はこちら</a></p>
      </footer>
    </div>
  );
}

export default App;
