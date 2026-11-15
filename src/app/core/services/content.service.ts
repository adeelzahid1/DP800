import { Injectable, computed, signal } from '@angular/core';
import {
  ContentManifest,
  DomainMeta,
  Lesson,
  QuestionBank,
  SubtopicMeta,
  TopicMeta,
} from '../models/content.models';

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
