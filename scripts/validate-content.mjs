#!/usr/bin/env node
/**
 * Content validation for the DP-800 study portal.
 *
 * Checks:
 *  - manifest parses; every lesson/question file it references exists
 *  - every non-lesson-only subtopic has >= MIN_QUESTIONS questions
 *  - every question has: stable unique id, valid type/difficulty, text.en,
 *    explanation.en, sources, and a consistent answer key for its type
 *  - manifest questionCount matches the actual bank size
 *  - no duplicate question ids across the whole portal
 *  - no duplicate question text within a bank (exact-match filler check)
 *  - flashcards.json has exactly one non-empty prompt per lesson exam tip
 *
 * Usage: node scripts/validate-content.mjs [--fix-counts]
 *   --fix-counts  rewrite manifest questionCount values from the banks
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public', 'content');
const MIN_QUESTIONS = 50;
const TYPES = new Set(['single', 'multiple', 'dragdrop-order', 'dragdrop-match', 'yesno', 'dropdown']);
const DIFFS = new Set(['easy', 'medium', 'hard']);
const FIX_COUNTS = process.argv.includes('--fix-counts');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function loadJson(rel) {
  const p = join(CONTENT, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    err(`${rel}: invalid JSON — ${e.message}`);
    return null;
  }
}

const manifest = loadJson('manifest.json');
if (!manifest) {
  console.error('manifest.json missing or invalid; aborting.');
  process.exit(1);
}

const allIds = new Map(); // question id -> subtopic
const counts = [];
let manifestChanged = false;
const flashcards = loadJson('flashcards.json');
if (!flashcards || typeof flashcards.prompts !== 'object') err('flashcards.json missing or has no "prompts" object');
const flashPrompts = flashcards?.prompts ?? {};
const seenSubtopics = new Set();
let cardCount = 0;

function checkLocalized(obj, field, where) {
  if (!obj || typeof obj !== 'object' || typeof obj.en !== 'string' || obj.en.trim() === '') {
    err(`${where}: missing or empty ${field}.en`);
    return false;
  }
  return true;
}

function checkQuestion(q, sub, bank, textSeen) {
  const where = `${sub.id} / ${q.id ?? '(no id)'}`;

  if (!q.id || !/^[a-z0-9][a-z0-9-]+$/.test(q.id)) err(`${where}: missing or invalid id`);
  else if (allIds.has(q.id)) err(`${where}: duplicate id (also in ${allIds.get(q.id)})`);
  else allIds.set(q.id, sub.id);

  if (!TYPES.has(q.type)) err(`${where}: invalid type "${q.type}"`);
  if (!DIFFS.has(q.difficulty)) err(`${where}: invalid difficulty "${q.difficulty}"`);
  checkLocalized(q.text, 'text', where);
  checkLocalized(q.explanation, 'explanation', where);
  if (!Array.isArray(q.sources) || q.sources.length === 0) err(`${where}: no sources`);
  if (q.subtopic !== sub.id) err(`${where}: question.subtopic "${q.subtopic}" != bank subtopic "${sub.id}"`);

  const key = (q.text?.en ?? '').trim().toLowerCase();
  if (key) {
    if (textSeen.has(key)) err(`${where}: duplicate question text within bank (same as ${textSeen.get(key)})`);
    else textSeen.set(key, q.id);
  }

  // Answer-key consistency per type
  const optIds = new Set((q.options ?? []).map((o) => o.id));
  const itemIds = new Set((q.items ?? []).map((o) => o.id));
  switch (q.type) {
    case 'single': {
      if (!q.options || q.options.length < 3) err(`${where}: single needs >= 3 options`);
      if (!Array.isArray(q.answer) || q.answer.length !== 1) err(`${where}: single needs exactly 1 answer`);
      else if (!optIds.has(q.answer[0])) err(`${where}: answer "${q.answer[0]}" not among options`);
      break;
    }
    case 'multiple': {
      if (!q.options || q.options.length < 4) err(`${where}: multiple needs >= 4 options`);
      if (!Array.isArray(q.answer) || q.answer.length < 2) err(`${where}: multiple needs >= 2 answers`);
      else {
        for (const a of q.answer) if (!optIds.has(a)) err(`${where}: answer "${a}" not among options`);
        if (q.selectCount && q.selectCount !== q.answer.length)
          err(`${where}: selectCount ${q.selectCount} != answer count ${q.answer.length}`);
      }
      break;
    }
    case 'dragdrop-order': {
      if (!q.items || q.items.length < 3) err(`${where}: dragdrop-order needs >= 3 items`);
      if (!Array.isArray(q.answer) || q.answer.length !== (q.items?.length ?? 0))
        err(`${where}: dragdrop-order answer must list all item ids in order`);
      else {
        const seen = new Set();
        for (const a of q.answer) {
          if (!itemIds.has(a)) err(`${where}: order answer "${a}" not among items`);
          if (seen.has(a)) err(`${where}: order answer repeats "${a}"`);
          seen.add(a);
        }
      }
      break;
    }
    case 'dragdrop-match': {
      if (!q.items || q.items.length < 2) err(`${where}: dragdrop-match needs >= 2 items`);
      if (!q.targets || q.targets.length < 2) err(`${where}: dragdrop-match needs >= 2 targets`);
      const targetIds = new Set((q.targets ?? []).map((t) => t.id));
      const map = q.answerMap ?? {};
      if (Object.keys(map).length !== (q.items?.length ?? 0))
        err(`${where}: answerMap must cover every item`);
      for (const [k, v] of Object.entries(map)) {
        if (!itemIds.has(k)) err(`${where}: answerMap key "${k}" not among items`);
        if (!targetIds.has(v)) err(`${where}: answerMap value "${v}" not among targets`);
      }
      break;
    }
    case 'yesno': {
      if (!q.statements || q.statements.length < 2) err(`${where}: yesno needs >= 2 statements`);
      const stIds = new Set((q.statements ?? []).map((s) => s.id));
      const map = q.answerMap ?? {};
      if (Object.keys(map).length !== (q.statements?.length ?? 0))
        err(`${where}: answerMap must cover every statement`);
      for (const [k, v] of Object.entries(map)) {
        if (!stIds.has(k)) err(`${where}: answerMap key "${k}" not among statements`);
        if (v !== 'yes' && v !== 'no') err(`${where}: yesno values must be "yes"/"no", got "${v}"`);
      }
      break;
    }
    case 'dropdown': {
      if (!q.blanks || q.blanks.length < 1) err(`${where}: dropdown needs >= 1 blank`);
      const map = q.answerMap ?? {};
      if (Object.keys(map).length !== (q.blanks?.length ?? 0))
        err(`${where}: answerMap must cover every blank`);
      for (const b of q.blanks ?? []) {
        const choiceIds = new Set(b.choices.map((c) => c.id));
        if (b.choices.length < 3) err(`${where}: blank "${b.id}" needs >= 3 choices`);
        if (!(b.id in map)) err(`${where}: no answer for blank "${b.id}"`);
        else if (!choiceIds.has(map[b.id])) err(`${where}: answer for blank "${b.id}" not among its choices`);
      }
      break;
    }
  }

  // Case-study reference
  if (q.caseId) {
    const cases = new Set((bank.cases ?? []).map((c) => c.id));
    if (!cases.has(q.caseId)) err(`${where}: caseId "${q.caseId}" not found in bank.cases`);
  }
}

for (const domain of manifest.domains) {
  for (const topic of domain.topics) {
    for (const sub of topic.subtopics) {
      seenSubtopics.add(sub.id);
      // Lesson
      const lesson = loadJson(sub.lessonFile);
      if (!lesson) {
        err(`${sub.id}: lesson file missing (${sub.lessonFile})`);
      } else {
        checkLocalized(lesson.title, 'title', `${sub.id} lesson`);
        if (!Array.isArray(lesson.sections) || lesson.sections.length === 0)
          err(`${sub.id}: lesson has no sections`);
        if (!Array.isArray(lesson.examTips)) err(`${sub.id}: lesson has no examTips array`);
        else {
          const prompts = flashPrompts[sub.id];
          if (!Array.isArray(prompts)) {
            if (lesson.examTips.length > 0) err(`${sub.id}: flashcards.json has no prompts for this subtopic`);
          } else {
            if (prompts.length !== lesson.examTips.length)
              err(`${sub.id}: ${prompts.length} flashcard prompts for ${lesson.examTips.length} exam tips`);
            prompts.forEach((pr, i) => checkLocalized(pr, `prompt ${i}`, `${sub.id} flashcards`));
            cardCount += Math.min(prompts.length, lesson.examTips.length);
          }
        }
        if (!Array.isArray(lesson.sources) || lesson.sources.length === 0)
          err(`${sub.id}: lesson has no sources`);
      }

      // Bank
      if (domain.lessonOnly || !sub.questionFile) {
        counts.push({ sub: sub.id, n: 0, lessonOnly: true });
        continue;
      }
      const bank = loadJson(sub.questionFile);
      if (!bank) {
        err(`${sub.id}: question file missing (${sub.questionFile})`);
        counts.push({ sub: sub.id, n: 0 });
        continue;
      }
      const qs = bank.questions ?? [];
      counts.push({ sub: sub.id, n: qs.length });
      if (qs.length < MIN_QUESTIONS)
        err(`${sub.id}: only ${qs.length} questions (minimum ${MIN_QUESTIONS})`);
      if (sub.questionCount !== qs.length) {
        if (FIX_COUNTS) {
          sub.questionCount = qs.length;
          manifestChanged = true;
        } else {
          warn(`${sub.id}: manifest questionCount ${sub.questionCount} != actual ${qs.length} (run with --fix-counts)`);
        }
      }
      const textSeen = new Map();
      for (const q of qs) checkQuestion(q, sub, bank, textSeen);

      // Difficulty / type spread sanity
      const diffs = { easy: 0, medium: 0, hard: 0 };
      const types = {};
      for (const q of qs) {
        if (q.difficulty in diffs) diffs[q.difficulty]++;
        types[q.type] = (types[q.type] ?? 0) + 1;
      }
      if (qs.length >= MIN_QUESTIONS) {
        for (const d of Object.keys(diffs))
          if (diffs[d] === 0) warn(`${sub.id}: no ${d} questions`);
        if (Object.keys(types).length < 3)
          warn(`${sub.id}: only ${Object.keys(types).length} question types — mix in more`);
      }
    }
  }
}

for (const id of Object.keys(flashPrompts))
  if (!seenSubtopics.has(id)) err(`flashcards.json: unknown subtopic "${id}"`);

if (FIX_COUNTS && manifestChanged) {
  writeFileSync(join(CONTENT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest.json questionCount values updated.');
}

console.log('\n=== Question counts per subtopic ===');
for (const c of counts) {
  const mark = c.lessonOnly ? ' (lesson only)' : c.n >= MIN_QUESTIONS ? ' ✓' : ' ✗';
  console.log(`${c.sub.padEnd(28)} ${String(c.n).padStart(4)}${mark}`);
}
const totalQ = counts.reduce((s, c) => s + c.n, 0);
console.log(`${'TOTAL'.padEnd(28)} ${String(totalQ).padStart(4)}`);
console.log(`${'FLASHCARDS'.padEnd(28)} ${String(cardCount).padStart(4)}`);

if (warnings.length) {
  console.log(`\n--- ${warnings.length} warning(s) ---`);
  for (const w of warnings) console.log('WARN  ' + w);
}
if (errors.length) {
  console.log(`\n--- ${errors.length} error(s) ---`);
  for (const e of errors) console.log('ERROR ' + e);
  process.exit(1);
}
console.log('\nValidation passed.');
