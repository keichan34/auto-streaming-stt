import { Transform } from "node:stream";

export type AudioStreamEvent = {
  AudioEvent: {
    AudioChunk: any;
  };
};

export type TranscriptionResult = {
  partial: boolean
  content: string

  /// The start time of the result in milliseconds from the start of the audio stream.
  startTime: number
  /// The end time of the result in milliseconds from the start of the audio stream.
  endTime: number
}

export type TranscriptionFunc =
  (audioStream: Transform) =>
  AsyncGenerator<TranscriptionResult, void, unknown>;
