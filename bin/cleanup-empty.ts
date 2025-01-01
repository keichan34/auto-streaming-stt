import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const outDir = path.join(__dirname, '..', 'out');
  const files = await fs.readdir(outDir);
  const emptyStreamIds = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.txt' || file.endsWith('.summary.txt')) {
      continue;
    }
    const filePath = path.join(outDir, file);
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      emptyStreamIds.add(path.basename(file, ext));
    }
  }

  for (const streamId of emptyStreamIds) {
    const files = [
      path.join(outDir, `${streamId}.mp3`),
      path.join(outDir, `${streamId}.txt`),
      path.join(outDir, `${streamId}.json`),
    ]
    console.log(`Removing empty stream ${streamId}`);
    await Promise.all(files.map((file) => fs.unlink(file).catch(() => {})));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
