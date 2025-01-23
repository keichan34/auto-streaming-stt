import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createSummary } from '../src/summarizer';

async function main() {
  const outDir = path.join(__dirname, '..', 'out');
  const files = await fs.readdir(outDir);
  const summaryRequiredIds = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.txt' || file.endsWith('.summary.txt')) {
      continue;
    }
    const basename = path.basename(file, ext);
    const summaryPath = path.join(outDir, `${basename}.summary.txt`);
    if (!existsSync(summaryPath)) {
      summaryRequiredIds.add(basename);
    }
  }

  for (const streamId of summaryRequiredIds) {
    const filePath = path.join(outDir, `${streamId}.txt`);
    const summaryPath = path.join(outDir, `${streamId}.summary.txt`);
    console.log(`Generating summary for ${streamId}`);
    const inputText = await fs.readFile(filePath, 'utf-8');
    const summary = await createSummary(streamId, inputText);
    await fs.writeFile(summaryPath, summary);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
