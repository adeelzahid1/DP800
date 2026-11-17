import { ProgressMap, QuestionProgress } from '../models/progress.models';

/** Why a question is in the mistake notebook. */
export type NotebookKind = 'wrong' | 'guessed' | 'note';

export interface NotebookEntry {
  id: string;
  subtopic: string;
  kinds: NotebookKind[];
  note?: string;
  lastAt?: number;
}

/** The reasons a question belongs in the notebook (empty = it doesn't). */
export function notebookKinds(p: QuestionProgress): NotebookKind[] {
  const kinds: NotebookKind[] = [];
  if ((p.attempts ?? 0) > 0 && p.lastCorrect === false) kinds.push('wrong');
  // A wrong answer marked as a guess is simply wrong; "guessed" means a lucky correct answer.
  if (p.lastCorrect === true && p.guessed) kinds.push('guessed');
  if (p.note) kinds.push('note');
  return kinds;
}

/** Notebook entries, most recently attempted first. */
export function notebookEntries(map: ProgressMap): NotebookEntry[] {
  const out: NotebookEntry[] = [];
  for (const id of Object.keys(map)) {
    const p = map[id];
    if (!p.s) continue;
    const kinds = notebookKinds(p);
    if (kinds.length === 0) continue;
    out.push({ id, subtopic: p.s, kinds, note: p.note, lastAt: p.lastAt });
  }
  return out.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.id.localeCompare(b.id));
}
