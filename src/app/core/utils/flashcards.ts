import { LocalizedText } from '../models/content.models';
import { CardMap } from '../models/progress.models';

/** Shape of public/content/flashcards.json. */
export interface FlashcardPrompts {
  version: number;
  /** subtopicId -> one prompt per lesson exam tip, in the same order. */
  prompts: Record<string, LocalizedText[]>;
}

/** One flashcard: a recall prompt on the front, the lesson's exam tip on the back. */
export interface Flashcard {
  id: string;
  subtopic: string;
  front: LocalizedText;
  back: LocalizedText;
}

/** 32-bit FNV-1a hash as 8 hex chars. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Card ids hash the English tip text, so reordering tips keeps progress and
 * rewriting a tip starts that card fresh.
 */
export function cardId(subtopic: string, tip: LocalizedText): string {
  return `${subtopic}:${fnv1a(tip.en)}`;
}

/** Pair a lesson's exam tips with their prompts. Tips without a prompt are skipped. */
export function cardsForLesson(
  subtopic: string,
  tips: readonly LocalizedText[],
  prompts: readonly LocalizedText[] | undefined,
): Flashcard[] {
  if (!prompts) return [];
  const out: Flashcard[] = [];
  tips.forEach((tip, i) => {
    const front = prompts[i];
    if (front) out.push({ id: cardId(subtopic, tip), subtopic, front, back: tip });
  });
  return out;
}

export interface DeckCounts {
  due: number;
  fresh: number;
  total: number;
}

export function deckCounts(cards: readonly Flashcard[], state: CardMap, today: number): DeckCounts {
  let due = 0;
  let fresh = 0;
  for (const c of cards) {
    const s = state[c.id];
    if (!s) fresh++;
    else if (s.dueDay !== undefined && s.dueDay <= today) due++;
  }
  return { due, fresh, total: cards.length };
}

/**
 * Cards for a session: due cards first (most overdue first), then new ones, up
 * to `limit`. With `all`, every card in scope is included in its natural order.
 */
export function buildDeck(
  cards: readonly Flashcard[],
  state: CardMap,
  today: number,
  limit: number,
  all = false,
): Flashcard[] {
  if (all) return cards.slice(0, limit);
  const due = cards
    .filter((c) => {
      const d = state[c.id]?.dueDay;
      return d !== undefined && d <= today;
    })
    .sort((a, b) => (state[a.id].dueDay ?? 0) - (state[b.id].dueDay ?? 0));
  const fresh = cards.filter((c) => !state[c.id]);
  return [...due, ...fresh].slice(0, limit);
}
