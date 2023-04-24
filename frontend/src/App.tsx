import { useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";

import dayjs from "dayjs";
import CustomDateFormat from "dayjs/plugin/customParseFormat";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import 'dayjs/locale/ja';
import { exponentialBackoffMs } from "./lib/utils";
import { askPermissionAndSubscribe } from "./lib/webpush";

dayjs.locale('ja');
dayjs.extend(CustomDateFormat);
dayjs.extend(LocalizedFormat);

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

type TranscriptLineViewProps = {
  items: TranscriptItem[];
  audioRef?: React.RefObject<HTMLAudioElement>;
};
const TranscriptLineView: React.FC<TranscriptLineViewProps> = ({items, audioRef}) => {
  return (
    <div className="card-text">
      {items.map((item, i) => (
        <p
          key={i}
          className={classNames({
            "text-muted": item.partial,
            "mb-0": true,
            "cursor-pointer": typeof item.startTime !== 'undefined' && typeof item.endTime !== 'undefined',
          })}
          onClick={(e) => {
            const audio = audioRef?.current;
            if (typeof item.startTime === 'undefined' || typeof item.endTime === 'undefined' || !audio) {
              return;
            }
            e.preventDefault();
            audio.play().then(() => {
              audio.currentTime = item.startTime! / 1000;
            });
          }}
        >
          {item.content}
        </p>
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
  exclusivePlaybackId: string | null;
  setExclusivePlaybackId: React.Dispatch<React.SetStateAction<string | null>>;
}
const SinglePastTranscription: React.FC<SinglePastTranscriptionProps> = ({
  id,
  exclusivePlaybackId,
  setExclusivePlaybackId,
}) => {
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

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
  }, [id]);

  return (
    <div className="card mb-2">
      <div className="card-body">
        <h5 className="card-title">{dayjs(id, "YYYYMMDDHHmmss").format("LL(dddd) LT")}</h5>
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

const PastTranscriptions: React.FC<{pastTranscriptionIds: string[]}> = ({pastTranscriptionIds}) => {
  const [
    exclusivePlaybackId,
    setExclusivePlaybackId,
  ] = useState<string | null>(null);
  return (
    <div>
      <h3>過去の放送</h3>
      <div className="mb-2">
        {pastTranscriptionIds.map((id) => (
          <SinglePastTranscription
            key={id}
            id={id}
            exclusivePlaybackId={exclusivePlaybackId}
            setExclusivePlaybackId={setExclusivePlaybackId}
          />
        ))}
      </div>
    </div>
  );
};

function App() {
  const [backfillTranscriptionId, setBackfillTranscriptionId] = useState<string | null>(null);
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscription | null>(null);
  const [pastTranscriptionIds, setPastTranscriptionIds] = useState<string[]>([]);
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
      const data = await resp.json();
      setPastTranscriptionIds(data);
    })();
  }, [reload]);

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
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
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
        setReload((prev) => prev + 1);
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
      }
    });
    ws.addEventListener('close', () => {
      const delay = exponentialBackoffMs(reconnect);
      setTimeout(() => {
        setReconnect((prev) => prev + 1);
      }, delay);
    });

    const pingFunc = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
      window.setTimeout(pingFunc, 30_000);
    };
    let pingTimeout = window.setTimeout(pingFunc, 30_000);

    return () => {
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close();
      }
      window.clearTimeout(pingTimeout);
    };
  }, [reconnect]);

  useEffect(() => {
    (async () => {
      if (!backfillTranscriptionId) {
        return;
      }
      const resp = await fetch(`/api/streams/${backfillTranscriptionId}.txt`);
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
        ご注意: このサイトは公式なものではありません。あくまで個人が実験的に作ったものであり、いつでも停止する可能性もあります。また、内容については不完全な可能性もあり、文字起こしは自動で生成したものであり、正確性については保証できません。
        <br />
        このサイトの仕組みや背景については、<a href="https://keita.blog/?p=3478" rel="noopener noreferer">こちらの記事</a> をご覧ください。
      </p>
      <p>
        お問い合わせは、<a href="https://keita.blog/about/" rel="noopener noreferer">こちらのフォーム</a> までお願いします。
      </p>

      { ('Notification' in window && !isSubscribed) && (
        <button type="button" className="btn btn-primary mb-4" onClick={subscribeHandler}>
          通知を受け取る
        </button>
      )}

      <div className="mb-4">
        <h3>現在の放送</h3>
        { liveTranscription ?
          <LiveTranscriptionView liveTranscription={liveTranscription} />
          :
          <p>現在放送中ではありません。</p>
        }
      </div>

      <PastTranscriptions pastTranscriptionIds={pastTranscriptionIds} />
    </div>
  );
}

export default App;
