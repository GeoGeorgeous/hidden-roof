import { msg } from '../messages.ts';

// What a HOST, JOIN or SAVE is doing, for the player: a step, and how far along an upload or a download is.
// The words are made here only (progressText): the menu, the HUD and the loading page read the step.

export type Progress = { step: 'joining' | 'back' | 'creating' | 'creatingSave' | 'saving' | 'loading' } | { step: 'uploading' | 'downloading' | 'savingParts'; percent: number };

const WORDS = {
  joining: 'menu.progressJoining',
  back: 'menu.progressGoingBack',
  creating: 'menu.progressCreating',
  creatingSave: 'menu.progressCreatingSave',
  saving: 'menu.progressSaving',
  loading: 'menu.progressLoading',
  uploading: 'menu.progressUploading',
  downloading: 'menu.progressDownloading',
  savingParts: 'menu.progressSavingParts',
} as const;

/** `p` in the player's words: 'Downloading paint 40%'. */
export const progressText = (p: Progress) => msg(WORDS[p.step], 'percent' in p ? { percent: `${p.percent}%` } : {});
