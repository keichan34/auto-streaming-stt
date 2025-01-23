import path from 'node:path';
import fs from 'node:fs/promises';
import OpenAI from 'openai';
import dayjs from 'dayjs';
import dayjsCustomParseFormat from 'dayjs/plugin/customParseFormat';

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
  const prompt = await getSystemPrompt();

  const now = dayjs(streamId, 'YYYYMMDDHHmmss');
  const replacedPrompt = replacePrompt(now, prompt);

  const client = new OpenAI();
  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    messages: [
      {
        role: 'system',
        content: replacedPrompt,
      },
      {
        role: 'user',
        content: text,
      }
    ],
    model: 'gpt-4o',
    temperature: 0.3,
  };
  const response = await client.chat.completions.create(params);
  const out = response.choices[0].message.content;
  if (!out) {
    throw new Error(`Failed to generate summary: ${JSON.stringify(response)}`);
  }
  return out;
}
