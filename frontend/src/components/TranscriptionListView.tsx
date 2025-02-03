import React from "react";
// import dayjs from "../lib/dayjs";
import SPT from "./SinglePastTranscription";
import { useTranscriptionList } from "../lib/dataHooks";
import Loader from "./Loader";
import dayjs from "../lib/dayjs";

const PastTranscriptions: React.FC<{pastTranscriptionIds: string[]}> = ({pastTranscriptionIds}) => {
  return <>
    {pastTranscriptionIds.map((id) => (
      <SPT
        key={id}
        id={id}
      />
    ))}
  </>
};

const TranscriptionListView: React.FC = () => {
  const { data, isLoading, isLoadingMore, loadNextPage } = useTranscriptionList();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className="mb-2">
      { data.map((x) => <React.Fragment key={x.date}>
        <h3 className="mt-4 mb-3">{dayjs(x.date, "YYYYMMDD").format("LL(dddd)")}</h3>
        <PastTranscriptions pastTranscriptionIds={x.transcriptionIds} />
      </React.Fragment>) }
      <div className="text-center my-5">
        {isLoadingMore ?
          <Loader />
          :
          <button className="btn btn-primary" onClick={() => loadNextPage()}>さらに読み込む</button>
        }
      </div>
    </div>
  );
};

export default TranscriptionListView;
