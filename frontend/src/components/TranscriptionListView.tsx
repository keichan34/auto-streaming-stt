import React, { useLayoutEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { pastTranscriptionIdsAtom, loadTranscriptionBeforeIdAtom } from "../atoms";
import SPT from "./SinglePastTranscription";

const PastTranscriptions: React.FC<{pastTranscriptionIds: string[]}> = ({pastTranscriptionIds}) => {
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

  return <>
    {pastTranscriptionIds.map((id) => (
      <div key={id} ref={id === lastTranscriptionId ? lastTranscriptionRef : undefined}>
        <SPT
          id={id}
          firstView={false}
        />
      </div>
    ))}
  </>
};

const TranscriptionListView: React.FC = () => {
  const allTranscriptionIds = useAtomValue(pastTranscriptionIdsAtom);
  const firstTranscriptionId = allTranscriptionIds[0];
  const pastTranscriptionIds = allTranscriptionIds.slice(1);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(false);

  return (
    <div className="mb-2">
      { firstTranscriptionId && <>
          <h3 className="my-4">最新の放送</h3>
          <SPT
            id={firstTranscriptionId}
            firstView={true}
          />
        </>
      }
      { showPastTranscriptions ? <>
        <h3 className="my-4">過去の放送</h3>
        <PastTranscriptions pastTranscriptionIds={pastTranscriptionIds} />
      </> : (
        <div className="text-center my-4">
          <button
            className="btn btn-primary"
            onClick={() => setShowPastTranscriptions(true)}
          >
            過去の放送を読み込む
          </button>
        </div>
      )}
    </div>
  );
};

export default TranscriptionListView;
