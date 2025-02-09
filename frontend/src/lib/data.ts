export interface TranscriptionsGetResponse {
  date: string;
  transcriptionIds: string[];
}

export interface SingleTranscription {
  summary: string;
  transcription: TranscriptionItem[];
}

export interface TranscriptionItem {
  content: string;
  startTime: number;
  endTime: number;
  partial: boolean;
}

export interface TranscriptionGetResponse {
  id: string;
  transcription: SingleTranscription;
}

export function formatDate(now: Date): string {
  now.setUTCHours(now.getUTCHours() + 9);
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function jsonFetcher<T = unknown>(url: string | [string, { headers: Record<string, string>}]): Promise<T> {
  let urlStr: string;
  let headers: Record<string, string> = {};
  if (Array.isArray(url)) {
    urlStr = url[0];
    headers = url[1].headers;
  } else {
    urlStr = url;
  }

  const resp = await fetch(urlStr, { headers });
  if (resp.ok) {
    return resp.json();
  } else {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }
}
