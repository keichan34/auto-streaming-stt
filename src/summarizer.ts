import path from 'node:path';
import fs from 'node:fs/promises';
import OpenAI from 'openai';
import dayjs from 'dayjs';

const filesDir = path.join(__dirname, "..", "files");

let SYSTEM_PROMPT: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (SYSTEM_PROMPT) {
    return SYSTEM_PROMPT;
  }
  SYSTEM_PROMPT = await fs.readFile(path.join(filesDir, 'summarize-prompt.txt'), 'utf-8');
  return SYSTEM_PROMPT;
}

function replacePrompt(now: dayjs.Dayjs, prompt: string): string {
  return prompt.replace(/<<CURRENT_DATE>>/g, now.format('YYYY年MM月DD日'));
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
    model: 'gpt-5',
    reasoning: {
      effort: 'minimal',
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
  return out;
}
