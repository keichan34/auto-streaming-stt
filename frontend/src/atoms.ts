import { atom } from "jotai";

export const loadTranscriptionBeforeIdAtom = atom<string | undefined>(undefined);
export const focusMessageIdAtom = atom<string | undefined>(undefined);
export const exclusivePlaybackIdAtom = atom<string | undefined>(undefined);

const INSTALL_ID_LS_KEY = `installId`;
export const installIdAtom = atom<string>(
  // The read function: on first read, try to get the ID from localStorage.
  () => {
    let installId = localStorage.getItem(INSTALL_ID_LS_KEY);
    if (!installId) {
      installId = crypto.randomUUID();
      localStorage.setItem(INSTALL_ID_LS_KEY, installId);
    }
    return installId;
  }
);
