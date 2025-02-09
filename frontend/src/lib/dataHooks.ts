import useSWRImmutable from 'swr/immutable';
import { jsonFetcher, TranscriptionGetResponse, TranscriptionsGetResponse } from './data';
import useSWR from 'swr';

const BASE = import.meta.env.VITE_API_URL;

export const useTranscriptionList = (dateStr: string) => {
  return useSWR<TranscriptionsGetResponse>(`${BASE}/transcriptions?date=${dateStr}`, jsonFetcher);
};

export const useTranscription = (id: string) => {
  return useSWRImmutable<TranscriptionGetResponse>(`${BASE}/transcriptions/${id}`, jsonFetcher);
};
