# DP-800 Study & Practice Portal

A mobile-responsive, frontend-only study portal for Microsoft **Exam DP-800:
Developing AI-Enabled Database Solutions** (Microsoft Certified: SQL AI
Developer Associate).

- **Stack:** Angular 20 (standalone components, signals, zoneless), no backend.
- **Content:** JSON files under `public/content/`, lazily loaded per subtopic.
- **Progress:** stored in `localStorage` (export/import as JSON from the Dashboard).
- **Modes:** Study (lessons + filtered practice with instant feedback) and Mock
  exam (120-minute timed exam mirroring the official structure, scored on the
  100–1000 scale with 700 to pass — an estimate of the official scaled score).
- **Spaced review:** every practice answer is scheduled with a Leitner system
  (boxes 1–5, reviewed after 1, 3, 7, 14 and 30 days). Mark an answer *Sure* or
  *Guessing* before checking it: a wrong answer goes back to box 1, a confident
  correct answer moves up a box, and a correct guess stays where it is. The
  **Review** page works through what is due today (`src/app/core/utils/srs.ts`).
- **Mistake notebook:** the **Notebook** page collects wrong answers, lucky
  guesses (correct but marked *Guessing*) and questions you wrote a note on,
  grouped by subtopic, with filters and a "Practice these" session. Notes are
  added from the ✎ button on any question (or `T`) and survive a progress reset.

## Run it

```bash
npm install
npm start          # dev server on http://localhost:4200
npm run build      # production build into dist/dp800/browser
npm run validate:content   # validate the question banks
npm run serve:dist  # serve the production build on http://localhost:4300
```

The production output in `dist/dp800/browser` is a static site — host it on any
static host (GitHub Pages, Azure Static Web Apps…). The router uses hash URLs,
so no rewrite rules are needed.

## Content structure

```
public/content/
  manifest.json        # topic tree: Domain → Topic → Subtopic (+ counts, weights)
  i18n/en.json         # all UI strings (one file per locale)
  lessons/<id>.json    # one lesson per subtopic
  questions/<id>.json  # one question bank per subtopic (≥ 50 questions)
```

The tree mirrors the official DP-800 study guide (skills measured as of
March 12, 2026): three domains weighted 35–40% / 35–40% / 25–30%, plus a
lessons-only "Foundations" section that the mock exam never samples.

### Adding a new subtopic

1. Add it to `manifest.json` under the right topic, with `lessonFile` and
   `questionFile` paths and `questionCount: 0`.
2. Create `lessons/<id>.json` (shape: see `src/app/core/models/content.models.ts`,
   `Lesson` interface).
3. Create `questions/<id>.json` with at least 50 questions (shape: `QuestionBank`).
4. Run `npm run validate:content -- --fix-counts` — it checks every rule and
   writes the real question counts back into the manifest.

### Question format

```jsonc
{
  "id": "d3-vector-data-0012",      // stable unique id (progress tracking)
  "domain": "ai-capabilities",
  "topic": "t-intelligent-search",
  "subtopic": "d3-vector-data",
  "type": "single",                  // single | multiple | dragdrop-order |
                                     // dragdrop-match | yesno | dropdown
  "difficulty": "medium",            // easy | medium | hard
  "text": { "en": "…" },
  "code": "SELECT …",                // optional, highlighted as T-SQL
  "options": [{ "id": "a", "text": { "en": "…" } }],
  "answer": ["a"],
  "explanation": { "en": "Why right is right and each wrong is wrong." },
  "example": { "en": "Short related example." },
  "exampleCode": "SELECT …",
  "sources": ["https://learn.microsoft.com/…"]
}
```

Answer shapes per type:

| Type | Key fields |
| --- | --- |
| `single` | `options`, `answer: ["a"]` |
| `multiple` | `options`, `answer: ["a","c"]`, optional `selectCount` |
| `dragdrop-order` | `items`, `answer`: all item ids in correct order |
| `dragdrop-match` | `items`, `targets`, `answerMap: { itemId: targetId }` |
| `yesno` | `statements`, `answerMap: { stmtId: "yes" \| "no" }` |
| `dropdown` | `blanks[{id,label,choices}]`, `answerMap: { blankId: choiceId }` |

Case studies: add a `cases` array to the bank and set `caseId` on member
questions; the scenario renders above each one and the mock exam keeps the
group together.

## Adding a new language (e.g. Roman English)

The portal is localization-ready; English is the fallback everywhere.

1. Copy `public/content/i18n/en.json` to `roman.json` and translate the values.
2. In `manifest.json`, set `"enabled": true` on the `roman` locale entry.
3. Add `"roman": "…"` next to any `"en": "…"` field in lessons/questions you
   have translated — untranslated fields automatically fall back to English.
4. Keep code snippets and technical terms in English.

No code changes are required.

## Keyboard shortcuts (study mode)

`←/→` prev/next question · `1–9`/`A–F` select option · `Enter` check ·
`S`/`G` mark sure/guessing · `T` note · `H` show/hide answer · `X` show/hide example · `M` bookmark ·
`P/N` prev/next subtopic · `?` help · `Esc` close.

## Verification & sources

Questions are original, written against official Microsoft documentation
(Microsoft Learn study guide, SQL Server 2025 / Azure SQL / Fabric docs);
every question and lesson carries source links. No real-exam or "braindump"
content is used. Scores are estimates: Microsoft does not publish the exact
scaling or question count.

## Content coverage

| Domain | Subtopics | Questions |
| --- | --- | --- |
| Foundations (lessons only, not in mock exams) | 3 | 0 |
| Design and develop database solutions | 13 | 650 |
| Secure, optimize, and deploy database solutions | 13 | 650 |
| Implement AI capabilities in database solutions | 9 | 450 |
| **Total** | **38** | **1,750** |

Question types: 1,323 single choice, 73 multiple choice, 129 yes/no sets,
88 dropdown (complete the code), 78 drag-and-drop match, 59 drag-and-drop
order; 11 case studies grouping 45 questions. Difficulty: 285 easy, 1,174
medium, 291 hard.

Facts were checked against Microsoft Learn in November 2026. Several features
covered by the exam are new or in preview (vector indexes and `VECTOR_SEARCH`
in SQL Server 2025, change event streaming, Data API builder 2.0), so where
behavior differs between versions the lessons say which version they describe
(for example, latest vs earlier vector index versions).
