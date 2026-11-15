import { Question } from '../models/content.models';

export interface Response {
  answer?: string[];
  answerMap?: Record<string, string>;
}

/** True when the response is complete enough to count as "answered". */
export function isAnswered(q: Question, r: Response | undefined): boolean {
  if (!r) return false;
  switch (q.type) {
    case 'single':
    case 'multiple':
      return (r.answer?.length ?? 0) > 0;
    case 'dragdrop-order':
      return (r.answer?.length ?? 0) === (q.items?.length ?? 0);
    case 'dragdrop-match':
      return Object.keys(r.answerMap ?? {}).length === (q.items?.length ?? 0);
    case 'yesno':
      return Object.keys(r.answerMap ?? {}).length === (q.statements?.length ?? 0);
    case 'dropdown':
      return Object.keys(r.answerMap ?? {}).length === (q.blanks?.length ?? 0);
    default:
      return false;
  }
}

/** Grade a response. All parts must be right (no partial credit, like most exam items). */
export function isCorrect(q: Question, r: Response | undefined): boolean {
  if (!r) return false;
  switch (q.type) {
    case 'single': {
      return r.answer?.length === 1 && r.answer[0] === q.answer?.[0];
    }
    case 'multiple': {
      const want = new Set(q.answer ?? []);
      const got = new Set(r.answer ?? []);
      if (want.size !== got.size) return false;
      for (const id of want) if (!got.has(id)) return false;
      return true;
    }
    case 'dragdrop-order': {
      const want = q.answer ?? [];
      const got = r.answer ?? [];
      return want.length === got.length && want.every((id, i) => got[i] === id);
    }
    case 'dragdrop-match':
    case 'yesno':
    case 'dropdown': {
      const want = q.answerMap ?? {};
      const got = r.answerMap ?? {};
      const keys = Object.keys(want);
      if (Object.keys(got).length !== keys.length) return false;
      return keys.every((k) => got[k] === want[k]);
    }
    default:
      return false;
  }
}
