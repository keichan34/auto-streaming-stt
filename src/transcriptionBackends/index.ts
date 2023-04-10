import { Transform } from "node:stream";

export type AudioStreamEvent = {
  AudioEvent: {
    AudioChunk: any;
  };
};

export type TranscriptionResult = {
  partial: boolean
  content: string
}

export type TranscriptionFunc =
  (audioStream: Transform) =>
  AsyncGenerator<TranscriptionResult, void, unknown>;
