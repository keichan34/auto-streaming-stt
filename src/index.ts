#!/usr/bin/env node

import startPublisher from "./publisher";
import serve from "./server";

import Transcription from "./transcription";

async function main() {
  const transcriber = new Transcription();

  startPublisher(transcriber);
  serve(transcriber);
  transcriber.start();
}

main();
