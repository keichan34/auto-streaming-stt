import React, { useState } from "react";
// import dayjs from "../lib/dayjs";
import SPT from "./SinglePastTranscription";
import { useTranscriptionList } from "../lib/dataHooks";
import Loader from "./Loader";

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
  const firstPageIdx = data.findIndex((x) => x.transcriptionIds.length > 0);
  const firstPage = firstPageIdx >= 0 ? data[firstPageIdx] : null;
  const pastPages = firstPageIdx >= 0 ? data.slice(0, firstPageIdx) : [];
  const pastTranscriptionIds = pastPages.flatMap((x) => x.transcriptionIds);

  // const todayStr = dayjs().format('YYYYMMDD');
  // const todayTranscriptionIds = data.find((x) => x.date === todayStr)?.transcriptionIds || [];

  // const firstTranscriptionIds = todayTranscriptionIds.length > 0 ?
  //   todayTranscriptionIds : [allTranscriptionIds[0]];

  // const pastTranscriptionIds = allTranscriptionIds.slice(firstTranscriptionIds.length);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(false);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className="mb-2">
      { firstPage && <>
          <h3 className="my-4">最新の放送</h3>
          <PastTranscriptions pastTranscriptionIds={firstPage.transcriptionIds} />
        </>
      }
      { showPastTranscriptions ? <>
        <h3 className="my-4">過去の放送</h3>
        <PastTranscriptions pastTranscriptionIds={pastTranscriptionIds} />
        <div className="text-center my-5">
          {isLoadingMore ?
            <Loader />
            :
            <button className="btn btn-primary" onClick={() => loadNextPage()}>さらに読み込む</button>
          }
        </div>
      </> : (
        <div className="text-center my-4">
          <button
            className="btn btn-primary"
            onClick={() => setShowPastTranscriptions(true)}
          >
            過去の放送を表示
          </button>
        </div>
      )}
    </div>
  );
};

export default TranscriptionListView;
