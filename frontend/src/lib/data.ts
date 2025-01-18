export type TranscriptItem = {
  partial: boolean;
  content: string;
  startTime?: number;
  endTime?: number;
};

export const transcriptionFetcher = async (
  url: string,
): Promise<TranscriptItem[]> => {
  const resp = await fetch(url);
  if (resp.ok) {
    const data = await resp.text();
    return data.split('\n').filter(l => l.trim().length > 0).map((line) => {
      return JSON.parse(line);
    });
  }
  return [];
};

export const summaryFetcher = async (
  url: string,
): Promise<string> => {
  const resp = await fetch(url);
  if (resp.ok) {
    return resp.text();
  }
  return '';
};
