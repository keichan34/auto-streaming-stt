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

type TranscriptItem = {
  partial: boolean;
  content: string;
  startTime?: number;
  endTime?: number;
};

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
      const resp = await fetch(`/api/streams/${id}.json`);
      if (resp.ok) {
        const data = await resp.text();
        setTranscript(data.split('\n').filter(l => l.trim().length > 0).map((line) => {
          return JSON.parse(line);
        }));
      } else {
        const resp = await fetch(`/api/streams/${id}.txt`);
        const data = await resp.text();
        setTranscript(data.split('\n').filter(l => l.trim().length > 0).map((line) => {
          return { partial: false, content: line.trim() };
        }));
      }
    })();

    (async () => {
      const resp = await fetch(`/api/streams/${id}.summary.txt`);
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
          src={`/api/streams/${id}.mp3`}
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
      console.log('websocket closed, reconnecting...');
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
      console.log('websocket connected');
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
        <button type="button" className="btn btn-primary mb-4" onClick={subscribeHandler}>
          通知を受け取る
        </button>
      )) }

      <PastTranscriptions />
    </div>
  );
}

export default App;
