import { useEffect, useState } from "react";
import classNames from "classnames";

import dayjs from "dayjs";
import CustomDateFormat from "dayjs/plugin/customParseFormat";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import 'dayjs/locale/ja';

dayjs.locale('ja');
dayjs.extend(CustomDateFormat);
dayjs.extend(LocalizedFormat);

type TranscriptItem = { partial: boolean; content: string };
type LiveTranscription = {
  id: string;
  items: TranscriptItem[];
}

const TranscriptLineView: React.FC<{items: TranscriptItem[]}> = ({items}) => {
  return (
    <div className="card-text">
      {items.map((item, i) => (
        <p
          key={i}
          className={classNames({
            "text-muted": item.partial,
            "mb-0": true,
          })}
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

const SinglePastTranscription: React.FC<{id: string}> = ({id}) => {
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);

  useEffect(() => {
    (async () => {
      const resp = await fetch(`/api/streams/${id}.txt`);
      const data = await resp.text();
      setTranscript(data.split('\n').map((line) => {
        return { partial: false, content: line.trim() };
      }));
    })();
  }, [id]);

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">{dayjs(id, "YYYYMMDDHHmmss").format("LL(dddd) LT")}</h5>
        <audio
          controls
          src={`/api/streams/${id}.mp3`}
        />
        <TranscriptLineView items={transcript} />
      </div>
    </div>
  );
};

const PastTranscriptions: React.FC<{pastTranscriptionIds: string[]}> = ({pastTranscriptionIds}) => {
  return (
    <div>
      <h3>過去の放送</h3>
      <div>
        {pastTranscriptionIds.map((id) => (
          <SinglePastTranscription key={id} id={id} />
        ))}
      </div>
    </div>
  );
};

function App() {
  const [backfillTranscriptionId, setBackfillTranscriptionId] = useState<string | null>(null);
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscription | null>(null);
  const [pastTranscriptionIds, setPastTranscriptionIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const resp = await fetch(`/api/streams`);
      const data = await resp.json();
      setPastTranscriptionIds(data);
    })();
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
    return () => {
      ws.close();
    }
  }, []);

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