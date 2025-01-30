import { atom } from "jotai";

export const loadTranscriptionBeforeIdAtom = atom<string | undefined>(undefined);
export const focusMessageIdAtom = atom<string | undefined>(undefined);
export const exclusivePlaybackIdAtom = atom<string | undefined>(undefined);
