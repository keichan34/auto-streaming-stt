import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import classNames from "classnames";
import Markdown from 'react-markdown';

import dayjs from "../lib/dayjs";
import { useAtom } from "jotai";
import { exclusivePlaybackIdAtom, focusMessageIdAtom } from "../atoms";
import { summaryFetcher, transcriptionFetcher, TranscriptItem } from "../lib/data";

type TranscriptSingleLineViewProps = {
  item: TranscriptItem;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
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
  audioRef?: React.RefObject<HTMLAudioElement | null>;
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

const SPTDetails: React.FC<{id: string}> = ({id}) => {
  const { data: transcript } = useSWR(`/api/streams/${id}.json`, transcriptionFetcher);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [exclusivePlaybackId, setExclusivePlaybackId] = useAtom(exclusivePlaybackIdAtom);

  useEffect(() => {
    if (id !== exclusivePlaybackId) {
      audioRef.current?.pause();
    }
  }, [id, exclusivePlaybackId]);

  return <>
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
    { transcript && <TranscriptLineView
      items={transcript}
      audioRef={audioRef}
    /> }
  </>;
};

type SinglePastTranscriptionProps = {
  id: string;
  firstView: boolean;
}
const SinglePastTranscription: React.FC<SinglePastTranscriptionProps> = ({
  id,
}) => {
  const { data: summary } = useSWR(`/api/streams/${id}.summary.txt`, summaryFetcher);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [focusMessageId, setFocusMessageId] = useAtom(focusMessageIdAtom);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useLayoutEffect(() => {
    if (id !== focusMessageId) {
      return;
    }
    wrapperRef.current?.scrollIntoView({
      block: 'center',
    });
    setFocusMessageId(undefined);
  }, [id, focusMessageId, setFocusMessageId]);

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
        <details open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
          <summary>詳細を表示</summary>
          {detailsOpen && <SPTDetails id={id} />}
        </details>
      </div>
    </div>
  );
};

export default SinglePastTranscription;
