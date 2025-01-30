import useSWRInfinite from 'swr/infinite';
import useSWRImmutable from 'swr/immutable';
import { streamsFetcher, summaryFetcher, transcriptionFetcher } from './data';

const _transcriptionListKey = (pageIndex: number, previousPageData: string[] | null) => {
  if (pageIndex === 0) {
    return '/api/streams/';
  }
  if (!previousPageData || previousPageData.length === 0) {
    return null;
  }
  return `/api/streams/?before=${previousPageData[previousPageData.length - 1]}`;
}

export const useTranscriptionList = () => {
  const { data, error, isLoading,  mutate, size, setSize } = useSWRInfinite<string[]>(
    _transcriptionListKey, streamsFetcher,
  );

  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");

  return {
    data: data ? data.flat() : [],
    error,
    isLoading,
    isLoadingMore,
    mutate,
    loadNextPage: () => setSize((s) => s + 1),
  }
};

export const useSummary = (id: string) => {
  return useSWRImmutable(`/api/streams/${id}.summary.txt`, summaryFetcher);
};

export const useSingleTranscription = (id: string) => {
  return useSWRImmutable(`/api/streams/${id}.json`, transcriptionFetcher);
};
