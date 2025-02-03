import useSWRInfinite from 'swr/infinite';
import useSWRImmutable from 'swr/immutable';
import { jsonFetcher, TranscriptionGetResponse, TranscriptionsGetResponse } from './data';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(now: Date): string {
  now.setUTCHours(now.getUTCHours() + 9);
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

const _transcriptionListKey = (pageIndex: number) => {
  if (pageIndex === 0) {
    return `${BASE}/transcriptions`;
  }
  const now = new Date();
  // page index is the number of days ago
  now.setDate(now.getDate() - pageIndex);
  return `${BASE}/transcriptions?date=${formatDate(now)}`;
}

export const useTranscriptionList = () => {
  const { data, error, isLoading,  mutate, size, setSize } = useSWRInfinite<TranscriptionsGetResponse>(
    _transcriptionListKey, jsonFetcher, {
      initialSize: 2, // load today and yesterday
      parallel: true,
    }
  );

  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");

  return {
    data: data || [],
    error,
    isLoading,
    isLoadingMore,
    mutate,
    loadNextPage: () => setSize((s) => s + 1),
  }
};

export const useTranscription = (id: string) => {
  return useSWRImmutable<TranscriptionGetResponse>(`${BASE}/transcriptions/${id}`, jsonFetcher);
};
