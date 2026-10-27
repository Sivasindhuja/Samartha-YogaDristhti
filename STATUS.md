# Project status — Asana Coach

**As of 2026-10-27. Development is intentionally paused.** This file is the handoff: what exists,
what was verified, what is broken by design, and what we are *not* doing right now.

> Short version: the prototype works end to end, but it must not be used by real people yet.
> The expert angle rubric is unfilled (0 of 18 angles verified) and the vision model runs on a
> free API tier that may retain uploaded photos. Both are product blockers, not engineering tasks.

## 1. What this is

A single-page demo: upload one JPG/PNG of a yoga pose, a vision-language model describes the
alignment against an expert-authored angle rubric, and a chat pane answers follow-up questions
about that asana. Two poses are supported: **Tadasana** and **Virabhadrasana II**.

There is no pose-estimation model. MediaPipe was removed deliberately. The VLM *estimates* joint
angles; the server compares those estimates to ranges in `backend/asanas.json` and recomputes
pass/fail itself. Every number is labelled an estimate, never a measurement.

## 2. What was built

| Piece | State |
| --- | --- |
| `backend/main.py` | FastAPI: `/api/health`, `/api/asanas`, `/api/asanas/{id}`, `/api/analyze`, `/api/chat` |
| `backend/asanas.json` | SME-editable rubric: 2 asanas, 18 angles, all `verified: false`, status `draft` |
| `backend/rubric.py` | Rubric load/reload-on-change, validation, scoring |
| `backend/prompts.py` | Review and chat prompts, including "estimates not measurements" and joint-attribution rules |
| `backend/normalize.py` | Stable response shape, recomputed rubric pass/fail, caveats, `pose_mismatch`, `angle_status` |
| `backend/gemini.py` | Gemini via OpenAI-compatible endpoint, 25 s per attempt, fallback model, readable error mapping |
| `backend/config.py` | `.env` loading (root wins, empty values never shadow), 4 MB cap, model defaults |
| `public/` | Upload form, browser-side downscale to 1600 px, results rendering, chat |
| `app.py`, `vercel.json`, `requirements.txt`, `.python-version`, `.vercelignore` | Vercel deployment shape |
| `docker-compose.yml`, `backend/Dockerfile` | Single-service local Docker path |
| `legacy/server`, `legacy/web` | Previous Node/Express + React implementation, unused, excluded from builds |
| `README.md` | Run, deploy, rubric-authoring and troubleshooting docs |

Deleted: `analyzer/` (the old MediaPipe pipeline).

### 2.1 Guardrails against misleading numbers

These exist because the raw model output was misleading in ways a user could not detect:

- `within_range` and `score` are recomputed from the rubric server-side; a model claim never wins.
- Joints the rubric asks for but the model could not see are shown as "not estimated", not dropped.
- Corrections carry `angle_status`; one that points at an angle already in range gets a
  "cue · angle in range" badge and a caveat, instead of reading as a measured fault.
- The score is labelled **"angle match (estimate)"** and states that qualitative corrections are
  excluded from the number.
- Per-angle confidence is labelled the model's self-report, not a statistical measure.
- When the fallback model is used, the UI names it and the reason (usually HTTP 429 quota).
- The rubric badge always shows the real state: "draft · 0/18 angles verified".

## 3. What was verified

- `python -m py_compile` on all backend modules, `node --check public/app.js`, rubric JSON validation.
- Smoke suite (temporary script, not committed) covering scoring, caveats, 503 without a key, 422
  for a bad asana id, image downscale, and the correction-vs-angle contradiction path.
- Live `/api/analyze`: 200 in ~13–18 s on `gemini-3.6-flash`; 200 in 26 s when the fallback ran.
- Live `/api/chat`: 200 in ~11 s, and it correctly refuses to measure hold time or breath count.
- Auto pose detection: returns `asana: null` plus an explanatory caveat for poses outside the rubric.
- `VERCEL=1` mode: static mount is skipped and `/api/*` still responds.

Not verified: an actual Vercel deployment (never executed — no account/token on this machine).

## 4. Two hard blockers

### 4.1 The rubric is empty (correctness)

`backend/asanas.json` contains placeholder ranges written while scaffolding. All 18 angles are
`verified: false` and the file status is `draft`. The UI says so. Until a subject matter expert
fills and signs off the ranges, the app is grading students against invented numbers.

Three concrete conflicts the SME must resolve, found by running real photos through it:

1. **Knee extension 170–185°** accepts 178°, but the model's coaching cue says "don't lock the
   knees". Either the range should stop around 178 or a separate qualitative check is needed.
2. **Stance ratio 0.15–0.6** is wide enough to accept both feet-together and hip-width. A ratio is
   the wrong instrument; a `stance` variant (`together` / `hip_width`) would be gradable.
3. **Tadasana variant is undefined**, so the model fills the gap and complains about feet position
   inconsistently between runs.

### 4.2 Not safe for real users (privacy and security)

- The app calls Gemini on the **free tier**, whose terms allow the provider to retain and use
  submitted content to improve its products. Photos of students may leave our control and cannot be
  deleted by us.
- No consent screen, no privacy notice, no retention policy, no data-processing agreement.
- No authentication, no accounts, no rate limiting. Anyone with the URL can spend the API quota.
- Images transit the server in memory and are not stored by us, but that does not change the
  provider-side retention.
- The live `GEMINI_API_KEY` sits in plaintext in the root `.env` (and `backend/.env`). Treat the
  folder as a secret; rotate the key if it was ever shared or zipped.

Consequence: internal demos only, with stock or consenting-adult photos that are acceptable to lose.

## 5. What we are explicitly not doing right now

| Not doing | Why not now | Would need |
| --- | --- | --- |
| Populating the 18 angle ranges | Requires a yoga SME and cited sources; inventing values is worse than leaving them blank | SME review, `verified: true` per angle, `status: reviewed` |
| Serving real users | Free-tier image retention; no consent, retention, deletion, or terms | Paid API tier + privacy notice + DPA/terms + deletion path |
| Authentication / accounts | Not needed for a demo; adds state and a database | Product decision |
| Rate limiting / abuse protection | Demo only, single tester | Public-URL requirement |
| Persistence, history, progress tracking | Stateless by design; browser holds the last analysis | Database + retention policy |
| More than 2 asanas | Rubric work is the bottleneck, not code | SME-signed entries |
| Measurement-grade accuracy | A VLM cannot read a joint angle precisely from one photo | Pose estimation reintroduced *alongside* the rubric |
| Rep counting, hold time, video, flow | Single-photo scope; the chat prompt says so explicitly | Video pipeline, different product |
| Accuracy evaluation set (30–50 labelled photos) | Paused; needs labelled ground truth | SME-labelled photos + precision/recall report |
| Vercel deployment | Never executed; no account/token here | Deploy + smoke test on the live URL |
| Mobile app, i18n, accessibility audit | Out of scope for the prototype | Separate project |
| Medical or therapeutic claims | Not appropriate for a heuristic review | Clinical validation, regulated review |
| Fixing the daily-quota UX further | 20 requests/day free per model; fallback already covers it | Paid tier or a second key |

Also not doing: model fine-tuning, a "coach dashboard", payments, or a production admin UI.

## 6. Decisions already made (do not relitigate without a reason)

- **Pure VLM, no pose estimation.** One photo, one model call. Reintroducing MediaPipe is a
  different product with different failure modes.
- **The server owns the verdict.** `within_range` and `score` are recomputed from the rubric; model
  claims are never trusted. Disagreements become caveats.
- **Estimates are labelled everywhere.** No screen may present a VLM number as a measurement.
- **Stateless.** No database, no analysis ids; the browser sends the last analysis with each chat turn.
- **Two models, one fallback.** `gemini-3.6-flash` then `gemini-3.5-flash-lite`, 25 s each, with the
  reason surfaced in the UI.
- **Score is angle-only.** Qualitative corrections are shown separately and say so.
- **Client-side downscale** to 1600 px because of Vercel's 4.5 MB body limit.

## 7. Known defects and risks

- **Non-determinism.** Three identical runs produced three different corrections. Expected from a
  VLM; the reason the eval set was planned.
- **Inflated self-confidence.** Per-angle "high" confidence is the model's self-report; the UI now
  says so.
- **Joint attribution.** The model used to tag qualitative cues with arbitrary joint ids. The prompt
  now forbids it and a live run confirmed `joint: null`, but it remains model-dependent.
- **Free-tier quota.** 20 requests/day per model for `gemini-3.6-flash`; exhausted during testing,
  resets daily. `GEMINI_MODEL=gemini-3.5-flash-lite` in `.env` extends a testing session.
- **No version control.** This folder is not a git repository. There is no history, no branch, no
  rollback. Do not delete files casually.
- **Transient DNS.** One local failure (`[Errno 11001] getaddrinfo failed`) was environmental; the
  error text now names the host and the likely causes.
- **`legacy/server/.env`** still points at a local MongoDB (`MONGO_URI`); its API keys are empty.
  `legacy/` is not used at runtime.

## 8. If work resumes, in this order

1. **Version control.** `git init`, commit the current tree (`.env` is already gitignored), so future
   changes are reversible.
2. **Rotate the API key** if the folder was shared, zipped, or screenshotted.
3. **SME sign-off** for at least one asana; resolve the three rubric conflicts in §4.1; flip
   `verified` and `status`.
4. **Privacy review** and a paid API tier so photos are not retained for product improvement.
5. **Eval set**: 30–50 labelled photos; report precision/recall of "in range" calls before trusting
   the score.
6. **Then deploy** to Vercel and smoke-test `/api/health` and one real analysis on the live URL.
7. Optional cleanup: delete `legacy/` after archiving it elsewhere.

## 9. Run it as-is

See `README.md` for setup. Shortest path:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Then open http://localhost:8000. Health check: `curl http://localhost:8000/api/health`.
The UI shows "Rubric draft · 0/18 angles verified" on purpose — that is the honest state.
