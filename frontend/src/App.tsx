import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import Markdown from 'react-markdown';

import dayjs from "dayjs";
import CustomDateFormat from "dayjs/plugin/customParseFormat";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import 'dayjs/locale/ja';
import { exponentialBackoffMs } from "./lib/utils";
import { askPermissionAndSubscribe } from "./lib/webpush";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { exclusivePlaybackIdAtom, focusMessageIdAtom, loadTranscriptionBeforeIdAtom, pastTranscriptionIdsAtom, summariesAtom } from "./atoms";

dayjs.locale('ja');
dayjs.extend(CustomDateFormat);
dayjs.extend(LocalizedFormat);

const API_ROOT = '/api';

type TranscriptItem = {
  partial: boolean;
  content: string;
  startTime?: number;
  endTime?: number;
};

type LiveTranscription = {
  id: string;
  items: TranscriptItem[];
}

type TranscriptSingleLineViewProps = {
  item: TranscriptItem;
  audioRef?: React.RefObject<HTMLAudioElement>;
  currentTimestamp: number | null;
};
const TranscriptSingleLineView: React.FC<TranscriptSingleLineViewProps> = (props) => {
  const {
    item,
    audioRef,
    currentTimestamp,
  } = props;

  const { startTime, endTime } = item;

  const lineIsPlaying = typeof startTime !== 'undefined' && typeof endTime !== 'undefined' && currentTimestamp !== null && startTime <= currentTimestamp && currentTimestamp <= endTime;

  const onClick = useCallback<React.MouseEventHandler<HTMLSpanElement>>((e) => {
    const audio = audioRef?.current;
    if (typeof startTime === 'undefined' || typeof endTime === 'undefined' || !audio) {
      return;
    }
    e.preventDefault();
    audio.play().then(() => {
      audio.currentTime = startTime! / 1000;
    });
  }, [audioRef, endTime, startTime]);

  return (
    <span
      className={classNames({
        "text-muted": item.partial,
      })}
    >
      <span
        className={classNames({
          "cursor-pointer": typeof item.startTime !== 'undefined' && typeof item.endTime !== 'undefined',
          "bg-secondary": lineIsPlaying,
          "text-white": lineIsPlaying,
        })}
        onClick={onClick}
      >
        {item.content}
      </span>
    </span>
  );
};

type TranscriptLineViewProps = {
  items: TranscriptItem[];
  audioRef?: React.RefObject<HTMLAudioElement>;
};
const TranscriptLineView: React.FC<TranscriptLineViewProps> = ({items, audioRef}) => {
  const [ currentTimestamp, setCurrentTimestamp ] = useState<number | null>(null);

  useLayoutEffect(() => {
    let raf: number;
    const handler = () => {
      const audio = audioRef?.current;
      if (audio && !audio.paused) {
        setCurrentTimestamp(audio.currentTime * 1000);
      } else {
        setCurrentTimestamp(null);
      }
      raf = window.requestAnimationFrame(handler);
    };
    raf = window.requestAnimationFrame(handler);
    return () => {
      window.cancelAnimationFrame(raf);
    }
  }, [audioRef]);

  return (
    <div className="card-text">
      {items.map((item, i) => (
        <TranscriptSingleLineView
          key={i}
          item={item}
          audioRef={audioRef}
          currentTimestamp={currentTimestamp}
        />
      ))}
    </div>
  );
}

const LiveTranscriptionView: React.FC<{liveTranscription: LiveTranscription}> = ({liveTranscription}) => {
  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">{dayjs(liveTranscription.id, "YYYYMMDDHHmmss").format("LL(dddd) LT")}</h5>
        <TranscriptLineView items={liveTranscription.items} />
      </div>
    </div>
  );
};

type SinglePastTranscriptionProps = {
  id: string;
}
const SinglePastTranscription: React.FC<SinglePastTranscriptionProps> = ({
  id,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [exclusivePlaybackId, setExclusivePlaybackId] = useAtom(exclusivePlaybackIdAtom);
  const [focusMessageId, setFocusMessageId] = useAtom(focusMessageIdAtom);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [summary, setSummary] = useState<string | undefined>(undefined);
  const summaries = useAtomValue(summariesAtom);
  const audioRef = useRef<HTMLAudioElement>(null);

  useLayoutEffect(() => {
    if (id !== focusMessageId) {
      return;
    }
    wrapperRef.current?.scrollIntoView({
      block: 'center',
    });
    setFocusMessageId(undefined);
  }, [id, focusMessageId, setFocusMessageId]);

  useEffect(() => {
    if (id !== exclusivePlaybackId) {
      audioRef.current?.pause();
    }
  }, [id, exclusivePlaybackId]);

  useEffect(() => {
    (async () => {
      const resp = await fetch(`${API_ROOT}/streams/${id}.json`);
      if (resp.ok) {
        const data = await resp.text();
        setTranscript(data.split('\n').filter(l => l.trim().length > 0).map((line) => {
          return JSON.parse(line);
        }));
      } else {
        const resp = await fetch(`${API_ROOT}/streams/${id}.txt`);
        const data = await resp.text();
        setTranscript(data.split('\n').filter(l => l.trim().length > 0).map((line) => {
          return { partial: false, content: line.trim() };
        }));
      }
    })();

    (async () => {
      const resp = await fetch(`${API_ROOT}/streams/${id}.summary.txt`);
      if (resp.ok) {
        const data = await resp.text();
        setSummary(data);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (summaries[id]) {
      setSummary(summaries[id]);
    }
  }, [id, summaries]);

  return (
    <div className="card mb-2" ref={wrapperRef}>
      <div className="card-body">
        <h5 className="card-title">{dayjs(id, "YYYYMMDDHHmmss").format("LL(dddd) LT")}</h5>
        { summary && (
          <div className="card-text mt-3">
            <h4>概要</h4>
            <Markdown>{summary}</Markdown>
          </div>
        )}
        <audio
          className="my-2 w-100"
          controls
          preload="none"
          src={`${API_ROOT}/streams/${id}.mp3`}
          ref={audioRef}
          onPlay={() => {
            // we only want to play one audio at a time, so we'll send a message to the
            // others to pause.
            setExclusivePlaybackId(id);
          }}
        />
        <TranscriptLineView
          items={transcript}
          audioRef={audioRef}
        />
      </div>
    </div>
  );
};

const PastTranscriptions: React.FC = () => {
  const pastTranscriptionIds = useAtomValue(pastTranscriptionIdsAtom);
  const lastTranscriptionId = pastTranscriptionIds[pastTranscriptionIds.length - 1];
  const lastTranscriptionRef = useRef<HTMLDivElement>(null);
  const setLoadTranscriptionBeforeId = useSetAtom(loadTranscriptionBeforeIdAtom);

  useLayoutEffect(() => {
    if (!lastTranscriptionRef.current) { return; }
    const observer = new IntersectionObserver((entries) => {
      // when the last transcription is in view, load more
      if (entries[0].isIntersecting) {
        setLoadTranscriptionBeforeId(lastTranscriptionId);
      }
    }, {
      threshold: 0.1,
    });
    observer.observe(lastTranscriptionRef.current);
    return () => {
      observer.disconnect();
    };
  }, [lastTranscriptionId, setLoadTranscriptionBeforeId]);

  return (
    <div>
      <h3>過去の放送</h3>
      <div className="mb-2">
        {pastTranscriptionIds.map((id) => (
          <div key={id} ref={id === lastTranscriptionId ? lastTranscriptionRef : undefined}>
            <SinglePastTranscription
              id={id}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

function App() {
  const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const [backfillTranscriptionId, setBackfillTranscriptionId] = useState<string | null>(null);
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscription | null>(null);
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
      const resp = await fetch(`${API_ROOT}/streams/`);
      const data = await resp.json() as string[];
      setPastTranscriptionIds((oldData) => {
        return [...new Set([...oldData, ...data])];
      });
    })();
  }, [reload, setPastTranscriptionIds]);
  useEffect(() => {
    (async () => {
      const resp = await fetch(`${API_ROOT}/streams/?before=${loadTranscriptionBeforeId}`);
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
    let proto = 'ws:'; // http
    if (window.location.protocol === 'https:') {
      proto = 'wss:'; // https
    }
    const ws = new WebSocket(`${proto}//${window.location.host}${API_ROOT}/ws`);
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "streamStarted") {
        setLiveTranscription({
          id: message.data.streamId,
          items: [],
        });
      } else if (message.type === "streamEnded") {
        setLiveTranscription(null);
        setBackfillTranscriptionId(null);
        // setReload((prev) => prev + 1);
        setPastTranscriptionIds((oldData) => {
          const data = [...new Set([...oldData, message.data.streamId])];
          data.sort((a, b) => (a > b ? -1 : 1));
          return data;
        });
      } else if (message.type === "transcript") {
        setLiveTranscription((prev) => {
          if (!prev) {
            // we got this transcript before we got the streamStarted message,
            // so we need to set the liveTranscription state
            setBackfillTranscriptionId(message.data.streamId);
            return {
              id: message.data.streamId,
              items: [message.data.item],
            };
          }

          const newItems = [...prev.items];

          // if the last item is partial, replace it with the new item
          if (newItems.length > 0 && newItems[newItems.length - 1].partial) {
            newItems[newItems.length - 1] = message.data.item;
          } else {
            newItems.push(message.data.item);
          }

          return {
            id: message.data.streamId,
            items: newItems,
          };
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
      pingFunc();
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (typeof pingTimeout !== 'undefined') {
        window.clearTimeout(pingTimeout);
      }
    };
  }, [reconnect, setPastTranscriptionIds, setSummaries]);

  useEffect(() => {
    (async () => {
      if (!backfillTranscriptionId) {
        return;
      }
      const resp = await fetch(`${API_ROOT}/streams/${backfillTranscriptionId}.txt`);
      const data = await resp.text();
      const backfilledLines = data.split('\n').map((line) => {
        return { partial: false, content: line.trim() };
      });
      setLiveTranscription((prev) => {
        if (!prev) {
          // because this is set after the liveTranscription state is set,
          // we shouldn't get here.
          return prev;
        }
        return {
          id: prev.id,
          items: [
            ...backfilledLines,
            ...prev.items,
          ],
        };
      });
    })();
  }, [backfillTranscriptionId]);

  return (
    <div className="container">
      <h1 className="my-4">屋久島の防災放送 (安房・松峯地区)</h1>

      <p>
        ご注意: このサイトは公式なものではありません。放送内容は防災放送を自動で文字起こし化し、AIによる要約を行なっています。間違いなどある場合あるので、ご了承ください。
        <br />
        このサイトの仕組みや背景については、<a href="https://keita.blog/2023/03/26/%E4%B9%85%E3%81%97%E3%81%B6%E3%82%8A%E3%81%AB%E5%9C%B0%E5%9B%B3%E3%81%A8%E9%96%A2%E4%BF%82%E3%81%AA%E3%81%84%E3%82%82%E3%81%AE%E3%82%92%E4%BD%9C%E3%82%8A%E3%81%BE%E3%81%97%E3%81%9F/" rel="noopener noreferer">こちらの記事</a> をご覧ください。
      </p>
      <p>
        お問い合わせやご意見などは、<a href="https://x.com/sleepy_keita" rel="noopener noreferer">X (旧Twitter)</a> までお願いします。
      </p>

      { !isRunningStandalone && (
        <p>
          このサイトをホーム画面に追加すると、通知を受け取ることができます。
        </p>
      )}

      { ('Notification' in window) && (!isSubscribed && (
        <button type="button" className="btn btn-primary mb-4" onClick={subscribeHandler}>
          通知を受け取る
        </button>
      )) }

      <div className="mb-4">
        <h3>現在の放送</h3>
        { liveTranscription ?
          <LiveTranscriptionView liveTranscription={liveTranscription} />
          :
          <p>現在放送中ではありません。</p>
        }
      </div>

      <PastTranscriptions />
    </div>
  );
}

export default App;
