import React, { useCallback, useEffect, useState } from "react";
// import dayjs from "../lib/dayjs";
import SPT from "./SinglePastTranscription";
import { useTranscriptionList } from "../lib/dataHooks";
import Loader from "./Loader";
import dayjs from "../lib/dayjs";
import { useAtomValue } from "jotai";
import { todayDateAtom } from "../atoms";

const PastTranscriptions: React.FC<{
  date: string;
  onEmpty?: () => void;
}> = ({date, onEmpty}) => {
  const { data, isLoading } = useTranscriptionList(date);
  const transcriptionIds = data?.transcriptionIds ?? [];

  useEffect(() => {
    if (!isLoading && transcriptionIds.length === 0 && onEmpty) {
      onEmpty();
    }
  }, [isLoading, transcriptionIds.length, onEmpty]);

  return <>
    {isLoading && <Loader />}

    {!isLoading && transcriptionIds.length === 0 && <p>本日の放送はまだありません</p>}
    {transcriptionIds.map((id) => (
      <SPT
        key={id}
        id={id}
      />
    ))}
  </>
};

const TranscriptionListView: React.FC = () => {
  const today = useAtomValue(todayDateAtom);
  const [shownDates, setShownDates] = useState<string[]>([today]);
  useEffect(() => {
    setShownDates((prev) => {
      if (prev[0] === today) {
        return prev;
      }
      return [today, ...prev];
    });
  }, [today]);

  const loadNextPage = useCallback(() => {
    setShownDates((prev) => {
      const lastDate = prev[prev.length - 1];
      const newDate = dayjs(lastDate, "YYYYMMDD").subtract(1, "day").format("YYYYMMDD");
      return [...prev, newDate];
    });
  }, []);

  const pages = [];
  for (const dateStr of shownDates) {
    pages.push(<React.Fragment key={dateStr}>
      <h3 className="mt-4 mb-3">{dayjs(dateStr, "YYYYMMDD").format("LL(dddd)")}</h3>
      <PastTranscriptions
        date={dateStr}
        onEmpty={dateStr === shownDates[shownDates.length - 1] ? loadNextPage : undefined}
      />
    </React.Fragment>)
  }

  return (
    <div className="mb-2">
      {pages}
      <div className="text-center my-5">
        <button className="btn btn-primary" onClick={(ev) => {
          ev.preventDefault();
          loadNextPage();
        }}>さらに読み込む</button>
      </div>
    </div>
  );
};

export default TranscriptionListView;
