import { notebookEntries, notebookKinds } from './notebook';

describe('notebook', () => {
  it('classifies wrong, lucky-guess and noted questions', () => {
    expect(notebookKinds({ attempts: 1, lastCorrect: false })).toEqual(['wrong']);
    expect(notebookKinds({ attempts: 1, lastCorrect: false, guessed: true })).toEqual(['wrong']);
    expect(notebookKinds({ attempts: 1, lastCorrect: true, guessed: true })).toEqual(['guessed']);
    expect(notebookKinds({ attempts: 1, lastCorrect: true, guessed: false })).toEqual([]);
    expect(notebookKinds({ note: 'remember NOLOCK' })).toEqual(['note']);
    expect(notebookKinds({ attempts: 2, lastCorrect: false, note: 'x' })).toEqual(['wrong', 'note']);
    expect(notebookKinds({ read: true, bookmarked: true })).toEqual([]);
  });

  it('lists entries newest first and skips entries without a subtopic', () => {
    const entries = notebookEntries({
      a: { s: 'sub-1', attempts: 1, lastCorrect: false, lastAt: 100 },
      b: { s: 'sub-2', attempts: 1, lastCorrect: true, guessed: true, lastAt: 300 },
      c: { s: 'sub-1', note: 'only a note' },
      d: { s: 'sub-1', attempts: 1, lastCorrect: true, lastAt: 500 },
      e: { attempts: 1, lastCorrect: false, lastAt: 900 },
    });
    expect(entries.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(entries[2].note).toBe('only a note');
  });
});
