#!/usr/bin/env node

import Transcription from "./transcription";

async function main() {
  const transcriber = new Transcription();


  transcriber.start();
}

main();
