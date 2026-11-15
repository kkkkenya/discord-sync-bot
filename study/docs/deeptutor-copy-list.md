# What Crux takes from DeepTutor

Source: https://github.com/HKUDS/DeepTutor (Apache-2.0: code can be copied when the ported file names the source and the licence). Paths are relative to `deeptutor/`.

Corrected on 2026-11-15 after reading Crux's server code. The first version of this list (same day) said Crux lacked several things it already has. The build plan is `fixplan-e.md`.

## Crux already has it (do not copy)

| DeepTutor piece | Crux's own |
|---|---|
| Mastery score capped until there is enough evidence (`learning/mastery.py`) | `server/understanding.js`: the Breakpoint model, a credible floor per link, stricter than DeepTutor's |
| Spaced-repetition scheduler (`services/practice/scheduler.py`, `learning/scheduler.py`) | The Breakpoint model forgets with a half-life that spaced practice lengthens. Only the "due today" list is missing (E2). |
| Grading exact answers in code (`learning/grading.py`) | `server/answer.js`: unit-aware comparison |
| Error types (`classify_error`) | `ERROR_TYPES` in `server/defs.js`, marked by the student at the broken step |
| "What next" rules (`learning/policy.py`) | `server/plan.js`, `server/next.js` |
| Follow-up chat on one question (`agents/question/agents/followup_agent.py`) | `AskTutor.jsx`, `askAbout` |
| Questions in the style of past papers (`agents/question/mimic_source.py`) | `makeQuestions`, `predictedMock` |
| Topic list from the unit's files (`learning/topic_generation.py`) | `suggestTopics`, the shared class list |
| Source-grounded study guide (`reading/study_guidance.py`) | `server/guide.js` |
| Photo of working (`agents/vision_solver/`) | `checkPhoto`, `readWorking` |

## Taken as code (ported, with the source comment)

| Piece | Goes to | Phase |
|---|---|---|
| `services/rag/eval/metrics.py`: recall@k, MRR, nDCG as pure functions | `tools/retrieval-eval.js` | E7 |
| `notes/anki_export.py`: Anki 2.1.55+ import text, stable GUIDs | `server/anki.js` | E9 |

## Taken as ideas

| Idea | From | Phase |
|---|---|---|
| A due-review list ordered by urgency, capped per day | `learning/policy.py` `due_reviews`, `learning/scheduler.py` `review_sort_key` | E2 |
| Ask about a selected passage, in a thread tied to that place | `notes/threads.py` ("Little Tutor") | E4 |
| A memory the student can read and edit | `services/memory/` | E5 |
| The model gives evidence; code decides what is recorded | `learning/semantic_assessment.py`, `learning/teaching.py` | E1 (check levels), E5 |
| Score retrieval on real questions before changing it | `services/rag/eval/` | E7 |

## Left out

Partners and IM channels, video lessons, the math animator, research reports, GraphRAG and LightRAG, embeddings, the multi-user admin, the desktop app, living books, question-bank import. Each is too heavy for a serverless app, costs too many tokens at these prices, or is already covered by Discord and Supabase.
