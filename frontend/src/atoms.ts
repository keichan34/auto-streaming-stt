import { atom } from "jotai";

export const pastTranscriptionIdsAtom = atom<string[]>([]);
export const loadTranscriptionBeforeIdAtom = atom<string | undefined>(undefined);

export const summariesAtom = atom<Record<string, string>>({});

export const focusMessageIdAtom = atom<string | undefined>(undefined);
export const exclusivePlaybackIdAtom = atom<string | undefined>(undefined);
