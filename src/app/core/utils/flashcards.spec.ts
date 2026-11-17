import { CardMap } from '../models/progress.models';
import { Flashcard, buildDeck, cardId, cardsForLesson, deckCounts, fnv1a } from './flashcards';

describe('flashcards', () => {
  const tips = [{ en: 'Tip A' }, { en: 'Tip B' }, { en: 'Tip C' }];
  const prompts = [{ en: 'Q A?' }, { en: 'Q B?' }, { en: 'Q C?' }];

  it('hashes deterministically', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('Tip A')).toBe(fnv1a('Tip A'));
    expect(fnv1a('Tip A')).not.toBe(fnv1a('Tip B'));
  });

  it('pairs tips with prompts and keys cards by tip text', () => {
    const cards = cardsForLesson('sub', tips, prompts);
    expect(cards.length).toBe(3);
    expect(cards[1]).toEqual({ id: cardId('sub', tips[1]), subtopic: 'sub', front: prompts[1], back: tips[1] });
    // Reordering tips keeps ids.
    const reordered = cardsForLesson('sub', [tips[2], tips[0]], [prompts[2], prompts[0]]);
    expect(reordered[1].id).toBe(cards[0].id);
    expect(cardsForLesson('sub', tips, undefined)).toEqual([]);
    expect(cardsForLesson('sub', tips, prompts.slice(0, 2)).length).toBe(2);
  });

  describe('deck', () => {
    const today = 1000;
    const cards: Flashcard[] = ['a', 'b', 'c', 'd', 'e'].map((x) => ({
      id: x,
      subtopic: 's',
      front: { en: x },
      back: { en: x },
    }));
    const state: CardMap = {
      a: { s: 's', box: 2, dueDay: today + 2 },
      b: { s: 's', box: 1, dueDay: today },
      c: { s: 's', box: 3, dueDay: today - 4 },
    };

    it('counts due and new cards', () => {
      expect(deckCounts(cards, state, today)).toEqual({ due: 2, fresh: 2, total: 5 });
    });

    it('puts most overdue first, then new cards, within the limit', () => {
      expect(buildDeck(cards, state, today, 10).map((c) => c.id)).toEqual(['c', 'b', 'd', 'e']);
      expect(buildDeck(cards, state, today, 3).map((c) => c.id)).toEqual(['c', 'b', 'd']);
    });

    it('includes every card when cramming', () => {
      expect(buildDeck(cards, state, today, 10, true).length).toBe(5);
    });
  });
});
