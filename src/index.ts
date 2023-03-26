#!/usr/bin/env node

import serve from "./server";
import Transcription from "./transcription";

async function main() {
  const transcriber = new Transcription();

  serve(transcriber);
  transcriber.start();
}

main();
