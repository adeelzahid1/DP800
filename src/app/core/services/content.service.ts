import { Injectable, computed, signal } from '@angular/core';
import {
  CaseStudy,
  ContentManifest,
  DomainMeta,
  Lesson,
  Question,
  QuestionBank,
  SubtopicMeta,
  TopicMeta,
} from '../models/content.models';
import { FlashcardPrompts } from '../utils/flashcards';

/** A question together with the case study it belongs to, if any. */
export interface LoadedQuestion {
  q: Question;
  caseStudy: CaseStudy | null;
}

export interface SubtopicRef {
  domain: DomainMeta;
  topic: TopicMeta;
  subtopic: SubtopicMeta;
  /** Index in the flattened subtopic order (for prev/next navigation). */
  index: number;
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  readonly manifest = signal<ContentManifest | null>(null);
  readonly loadError = signal<string | null>(null);

  private readonly lessonCache = new Map<string, Promise<Lesson>>();
  private readonly bankCache = new Map<string, Promise<QuestionBank>>();
  private flashcardPrompts: Promise<FlashcardPrompts> | null = null;

  /** Flattened subtopic list in tree order. */
  readonly subtopicRefs = computed<SubtopicRef[]>(() => {
    const m = this.manifest();
    if (!m) return [];
    const refs: SubtopicRef[] = [];
    for (const domain of m.domains) {
      for (const topic of domain.topics) {
        for (const subtopic of topic.subtopics) {
          refs.push({ domain, topic, subtopic, index: refs.length });
        }
      }
    }
    return refs;
  });

  readonly refById = computed<Map<string, SubtopicRef>>(() => {
    const map = new Map<string, SubtopicRef>();
    for (const ref of this.subtopicRefs()) map.set(ref.subtopic.id, ref);
    return map;
  });

  constructor() {
    void this.loadManifest();
  }

  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch('content/manifest.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest.set((await res.json()) as ContentManifest);
    } catch (e) {
      this.loadError.set(`Could not load content manifest: ${String(e)}`);
    }
  }

  getLesson(sub: SubtopicMeta): Promise<Lesson> {
    let p = this.lessonCache.get(sub.id);
    if (!p) {
      p = fetch(`content/${sub.lessonFile}`).then((r) => {
        if (!r.ok) throw new Error(`Lesson ${sub.id}: HTTP ${r.status}`);
        return r.json() as Promise<Lesson>;
      });
      p.catch(() => this.lessonCache.delete(sub.id));
      this.lessonCache.set(sub.id, p);
    }
    return p;
  }

  /**
   * Load specific questions (with their case studies) from their banks.
   * Ids no longer present in a bank are left out.
   */
  async loadQuestions(
    wanted: readonly { id: string; subtopic: string }[],
  ): Promise<LoadedQuestion[]> {
    const refs = this.refById();
    const subtopics = [...new Set(wanted.map((w) => w.subtopic))];
    const banks = await Promise.all(
      subtopics.map((s) => {
        const ref = refs.get(s);
        return ref ? this.getBank(ref.subtopic) : Promise.resolve(null);
      }),
    );
    const byId = new Map<string, LoadedQuestion>();
    for (const bank of banks) {
      if (!bank) continue;
      for (const q of bank.questions) {
        const caseStudy = q.caseId ? (bank.cases?.find((c) => c.id === q.caseId) ?? null) : null;
        byId.set(q.id, { q, caseStudy });
      }
    }
    return wanted.map((w) => byId.get(w.id)).filter((x): x is LoadedQuestion => !!x);
  }

  /** Recall prompts for every lesson's exam tips (public/content/flashcards.json). */
  getFlashcardPrompts(): Promise<FlashcardPrompts> {
    if (!this.flashcardPrompts) {
      this.flashcardPrompts = fetch('content/flashcards.json').then((r) => {
        if (!r.ok) throw new Error(`Flashcards: HTTP ${r.status}`);
        return r.json() as Promise<FlashcardPrompts>;
      });
      this.flashcardPrompts.catch(() => (this.flashcardPrompts = null));
    }
    return this.flashcardPrompts;
  }

  getBank(sub: SubtopicMeta): Promise<QuestionBank> {
    if (!sub.questionFile) return Promise.resolve({ subtopic: sub.id, questions: [] });
    let p = this.bankCache.get(sub.id);
    if (!p) {
      p = fetch(`content/${sub.questionFile}`).then((r) => {
        if (!r.ok) throw new Error(`Bank ${sub.id}: HTTP ${r.status}`);
        return r.json() as Promise<QuestionBank>;
      });
      p.catch(() => this.bankCache.delete(sub.id));
      this.bankCache.set(sub.id, p);
    }
    return p;
  }

  neighbor(subtopicId: string, dir: 1 | -1): SubtopicRef | null {
    const ref = this.refById().get(subtopicId);
    if (!ref) return null;
    return this.subtopicRefs()[ref.index + dir] ?? null;
  }
}
