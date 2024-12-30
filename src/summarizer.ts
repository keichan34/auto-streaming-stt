import path from 'node:path';
import fs from 'node:fs/promises';
import OpenAI from 'openai';

const filesDir = path.join(__dirname, "..", "files");

let SYSTEM_PROMPT: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (SYSTEM_PROMPT) {
    return SYSTEM_PROMPT;
  }
  SYSTEM_PROMPT = await fs.readFile(path.join(filesDir, 'summarize-prompt.txt'), 'utf-8');
  return SYSTEM_PROMPT;
}

export async function createSummary(text: string): Promise<string> {
  const client = new OpenAI();
  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    messages: [
      {
        role: 'system',
        content: await getSystemPrompt(),
      },
      {
        role: 'user',
        content: text,
      }
    ],
    model: 'gpt-4o',
  };
  const response = await client.chat.completions.create(params);
  const out = response.choices[0].message.content;
  if (!out) {
    throw new Error(`Failed to generate summary: ${JSON.stringify(response)}`);
  }
  return out;
}
