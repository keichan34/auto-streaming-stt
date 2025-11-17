import path from 'node:path';
import fs from 'node:fs/promises';
import OpenAI from 'openai';
import dayjs from 'dayjs';

const filesDir = path.join(__dirname, "..", "files");

type JapaneseEra = {
  name: string;
  start: dayjs.Dayjs;
};

const JAPANESE_ERAS: JapaneseEra[] = [
  { name: '令和', start: dayjs('2019-05-01') },
  { name: '平成', start: dayjs('1989-01-08') },
  { name: '昭和', start: dayjs('1926-12-25') },
  { name: '大正', start: dayjs('1912-07-30') },
  { name: '明治', start: dayjs('1868-01-25') },
];

let SYSTEM_PROMPT: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (SYSTEM_PROMPT) {
    return SYSTEM_PROMPT;
  }
  SYSTEM_PROMPT = await fs.readFile(path.join(filesDir, 'summarize-prompt.txt'), 'utf-8');
  return SYSTEM_PROMPT;
}

function formatJapaneseEraDate(date: dayjs.Dayjs): string {
  for (const era of JAPANESE_ERAS) {
    if (date.isAfter(era.start) || date.isSame(era.start)) {
      const eraYear = date.year() - era.start.year() + 1;
      const yearLabel = eraYear === 1 ? '元' : String(eraYear);
      return `${era.name}${yearLabel}年${date.format('MM月DD日')}`;
    }
  }
  return date.format('YYYY年MM月DD日');
}

function replacePrompt(now: dayjs.Dayjs, prompt: string): string {
  const gregorianDate = now.format('YYYY年MM月DD日');
  const japaneseEraDate = formatJapaneseEraDate(now);
  return prompt.replace(/<<CURRENT_DATE>>/g, `${gregorianDate}（${japaneseEraDate}）`);
}

export async function createSummary(streamId: string, text: string): Promise<string> {
  if (text.trim().length === 0) {
    return '';
  }

  const prompt = await getSystemPrompt();

  const now = dayjs(streamId, 'YYYYMMDDHHmmss');
  const replacedPrompt = replacePrompt(now, prompt);

  const client = new OpenAI();
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    instructions: replacedPrompt,
    input: text,
    model: 'gpt-5.1',
    reasoning: {
      effort: 'low',
    },
    text: {
      verbosity: 'low',
    },
  };
  const response = await client.responses.create(params);
  const out = response.output_text;
  if (!out) {
    throw new Error(`Failed to generate summary: ${JSON.stringify(response)}`);
  }
  if (out.includes('__NOTHING__')) {
    return '';
  }
  return out;
}
