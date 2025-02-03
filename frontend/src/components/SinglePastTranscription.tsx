import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import Markdown from 'react-markdown';

import dayjs from "../lib/dayjs";
import { useAtom } from "jotai";
import { exclusivePlaybackIdAtom, focusMessageIdAtom } from "../atoms";
import { TranscriptionItem } from "../lib/data";
import { useTranscription } from "../lib/dataHooks";

type TranscriptSingleLineViewProps = {
  item: TranscriptionItem;
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

  const onClick = useCallback<React.MouseEventHandler<HTMLSpanElement>>(async (e) => {
    const audio = audioRef?.current;
    if (typeof startTime === 'undefined' || typeof endTime === 'undefined' || !audio) {
      return;
    }
    e.preventDefault();

    audio.currentTime = startTime / 1000;
    if (audio.paused) {
      await audio.play();
    }
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
  items: TranscriptionItem[];
  audioRef?: React.RefObject<HTMLAudioElement | null>;
};
const TranscriptLineView: React.FC<TranscriptLineViewProps> = ({items, audioRef}) => {
  const [ currentTimestamp, setCurrentTimestamp ] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    // Update the timestamp whenever the audio playback position changes.
    const handleTimeUpdate = () => {
      setCurrentTimestamp(audio.currentTime * 1000);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handleTimeUpdate);
    audio.addEventListener('pause', handleTimeUpdate);
    audio.addEventListener('ended', handleTimeUpdate);

    // Cleanup the event listeners when the component unmounts or audioRef changes.
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handleTimeUpdate);
      audio.removeEventListener('pause', handleTimeUpdate);
      audio.removeEventListener('ended', handleTimeUpdate);
    };
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
  const { data } = useTranscription(id);
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
      src={`${import.meta.env.VITE_API_URL}/transcriptions/${id}/recording.mp3`}
      ref={audioRef}
      onPlay={() => {
        // we only want to play one audio at a time, so we'll send a message to the
        // others to pause.
        setExclusivePlaybackId(id);
      }}
    />
    { data && <TranscriptLineView
      items={data.transcription.transcription}
      audioRef={audioRef}
    /> }
  </>;
};

type SinglePastTranscriptionProps = {
  id: string;
};
const SinglePastTranscription: React.FC<SinglePastTranscriptionProps> = ({
  id,
}) => {
  const { data } = useTranscription(id);

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
        <h5 className="card-title">{dayjs(id, "YYYYMMDDHHmmss").format("LT")}</h5>
        { data && (
          <div className="card-text mt-3">
            <Markdown>{data.transcription.summary}</Markdown>
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
