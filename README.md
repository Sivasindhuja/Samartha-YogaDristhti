# Asana Coach

Upload one photo of a yoga pose. A vision-language model reviews the alignment, compares it
against an expert-authored rubric, and then answers follow-up questions about that asana.

```
app.py                Vercel entrypoint: re-exports the FastAPI app from backend/main.py
public/               vanilla HTML + CSS + JS, served by the CDN (or by FastAPI locally)
backend/
  main.py             FastAPI app: /api/* routes
  asanas.json         expert rubric: the angle ranges to be filled in by SMEs
  rubric.py           rubric loading, validation and scoring
  prompts.py          prompts for the review and chat calls
  normalize.py        turns model output into a stable response
  gemini.py           Gemini transport (OpenAI-compatible endpoint) + JSON extraction
  config.py           env configuration
  requirements.txt    backend-only deps (Docker / local venv)
requirements.txt      project deps installed by Vercel
vercel.json           function config: 60s max duration, rubric bundling, bundle excludes
docker-compose.yml    single-service Docker setup
STATUS.md             stop-point: blockers, out-of-scope work, handoff notes
legacy/               the old MediaPipe + Node/React implementation, kept for reference
```

There is **no pose-estimation model**. MediaPipe was removed. A VLM looks at the photo and
*estimates* joint angles. Every surface that shows a number says "estimate", never "measurement".
That distinction is the main design constraint — please keep it.

> [!WARNING]
> **Internal demo only — not for real students.** The model runs on a free API tier whose terms
> allow the provider to retain and use submitted images; there is no consent flow, retention
> policy, authentication or rate limiting. On top of that, the angle rubric is unfilled
> (0 of 18 angles verified), so grading is not yet defensible. Read [`STATUS.md`](STATUS.md)
> before showing this to anyone outside the project.

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

copy .env.example .env        # then add GEMINI_API_KEY
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000. One process serves the API and `public/`.

## Run with Docker

```bash
echo GEMINI_API_KEY=your-key-here > .env
docker compose up --build
```

Open http://localhost:8000.

## Deploy to Vercel

The project is already shaped for Vercel: FastAPI is detected from `requirements.txt` +
`app.py`, and `public/` is served by the CDN at the root. No build command is required.

```bash
npm i -g vercel
vercel login
vercel                       # preview deployment
vercel env add GEMINI_API_KEY production
vercel --prod
```

Or import the repo in the Vercel dashboard, add `GEMINI_API_KEY` under
**Settings → Environment Variables**, and deploy. Then check
`https://<your-app>.vercel.app/api/health` — it should report `"vision_configured": true`.

How the pieces fit on Vercel:

| Piece | Behaviour |
| --- | --- |
| `app.py` | Vercel looks for a `FastAPI` instance named `app` here. It adds `backend/` to `sys.path` and re-exports `backend.main:app`. |
| `public/` | Served from the CDN at `/`. FastAPI does **not** mount it when `VERCEL` is set. |
| `/api/*` | Reaches the single serverless function. |
| `vercel.json` | `maxDuration: 60`, bundles `backend/asanas.json`, excludes `legacy/` and `node_modules` from the bundle. |
| `.python-version` | Pins Python 3.12. |
| `.vercelignore` | Keeps `legacy/` (including its old `node_modules`) out of the upload. |

Vercel-specific limits:

- **4.5 MB request body.** Uploads are capped at 4 MB, and `public/app.js` downscales photos to
  1600 px in the browser first, so a normal phone photo arrives at ~200–400 KB.
- **60 s function duration.** One Gemini call plus one image. If a model is rate limited the
  fallback model is tried inside the same request, so very slow responses can still time out.
- **Read-only filesystem, no state.** Nothing is persisted; the browser keeps the last analysis
  and sends it with each chat message.

## API

| Method | Path                  | Purpose                                            |
| ------ | --------------------- | -------------------------------------------------- |
| GET    | `/api/health`         | Liveness + whether a model key is configured       |
| GET    | `/api/asanas`         | Rubric metadata and the pose list                  |
| GET    | `/api/asanas/{id}`    | One full rubric entry, including angle ranges      |
| POST   | `/api/analyze`        | multipart: `file`, `asana_id`, `age`, `flexibility`, `goal`, `notes` |
| POST   | `/api/chat`           | JSON: `question`, `asana_id`, `analysis`           |

`/api/analyze` returns `{analysis, rubric, profile, file}`. The interesting part is `analysis`:

```json
{
  "asana": { "id": "tadasana", "name": "Tadasana", "rubric_status": "draft", "verified": false },
  "summary": "…",
  "score": 78,
  "score_is_estimate": true,
  "requested_model": "gemini-3.6-flash",
  "used_fallback": false,
  "fallback_reason": null,
  "angle_checks": [
    {
      "joint": "left_knee", "label": "Left knee extension",
      "estimate": 176, "ideal_min": 170, "ideal_max": 185,
      "within_range": true, "delta": 0, "confidence": "medium",
      "verified": false
    }
  ],
  "corrections": [{ "area": "pelvis", "issue": "…", "joint": "…", "fix": "…", "angle_status": "in_range" }],
  "working_well": ["…"],
  "safety": ["…"],
  "caveats": ["…"],
  "disclaimer": "Angles are estimates by a vision-language model from a single photograph. …"
}
```

Two integrity rules are enforced in `normalize.py`:

1. `within_range` and `score` are **recomputed from the rubric**, never taken from the model. If the
   model claims an angle is in range and it is not, the rubric wins and a caveat is added.
2. Joints the rubric asks for but the model could not see are reported as `not estimated` rather
   than silently dropped or invented.

## Populating `backend/asanas.json` (for subject matter experts)

The file currently contains two asanas — **Tadasana** and **Virabhadrasana II** — with placeholder
ranges. Every angle carries `"verified": false` until a reviewer signs it off. Three specific
conflicts to resolve are listed in [`STATUS.md`](STATUS.md#41-the-rubric-is-empty-correctness).

For each angle:

| Field           | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| `joint`         | Stable id used by the app (`left_knee`, `trunk_from_vertical`, …) |
| `label`         | Human-readable name shown in the UI                               |
| `landmarks`     | The points that define the angle, in order                        |
| `unit`          | `degrees`, or `ratio` for dimensionless measures                  |
| `ideal_min/max` | Accepted range. `180` is a straight joint                         |
| `tolerance`     | How far outside the range still counts as a near miss             |
| `weight`        | Relative importance when the score is weighted                    |
| `verified`      | Set to `true` only after review                                   |
| `reviewer_note` | Why the range is what it is; cite the source                      |

The file is reloaded automatically when its modification time changes, so edits show up without a
restart (locally and in Docker). Adding a pose needs no code change: copy an entry, give it a unique
`id`, rebuild `angles`. If a rubric has no `angles`, the app still gives qualitative feedback.

Hand-editing mistakes are surfaced rather than crashing: `GET /api/asanas` returns `meta.issues`
(missing fields, non-numeric bounds, `min > max`, duplicate ids) and the UI turns the rubric badge
red. `status` at the top of the file is shown as a badge — set it to `reviewed` once every entry is
signed off.

On Vercel, `backend/asanas.json` is bundled explicitly via `vercel.json → functions.includeFiles`,
so `ASANAS_PATH` does not need to be set in the dashboard.

## Limitations

- **Estimates, not measurements.** A VLM cannot reliably read a joint angle off a photo. Values are
  directionally useful, not precise. If real measurement matters later, reintroduce a pose estimator
  and keep this rubric as the comparison target — the data model already supports it.
- **One photo.** No rep counting, no hold time, no flow analysis. The chat prompt says so explicitly.
- **Camera angle matters.** A photo from the side cannot show shoulder abduction, and vice versa.
  This is why each rubric entry has a `camera_hint` and why unseeable joints are skipped.
- **Free tier data use — do not use with real users.** On the Gemini free tier, submitted content
  may be retained and used to improve Google's products. There is no consent screen, privacy
  notice, retention policy, authentication or rate limiting, and the key sits in plaintext in
  `.env`. Demo with stock photos or consenting adults only; move to a paid tier and add the privacy
  work before anywhere public. See [`STATUS.md`](STATUS.md#42-not-safe-for-real-users-privacy-and-security).
- **No persistence.** Nothing is stored server-side; the browser holds the last analysis.

## Model configuration

Defaults: `gemini-3.6-flash`, falling back to `gemini-3.5-flash-lite` on 429/5xx/network errors.
3.8 Flash is deliberately not the default because of demand. Override with `GEMINI_MODEL` and
`GEMINI_FALLBACK_MODEL`.

Each attempt is capped at 25 s (`REQUEST_TIMEOUT_S`) so the fallback model still fits inside
Vercel's 60 s function limit. Missing key → `/api/analyze` and `/api/chat` return 503 with a clear
message; the rest of the app still loads.

`.env` at the repo root is the canonical file: Docker Compose reads it for substitution and the app
loads it first. `backend/.env` is also read as a convenience. Empty placeholders never shadow a real
value, and real environment variables always win.

Gemini 3 spends part of `max_tokens` on thinking tokens, so the review requests 4096 and chat 2048.
An empty or truncated completion (`finish_reason: "length"`) is treated as retryable and handed to
the fallback model instead of surfacing as a 500.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| 503 `GEMINI_API_KEY is not configured` | key missing from both `.env` files. Edit, then **restart uvicorn** — env is read at startup |
| 503 `Could not resolve generativelanguage.googleapis.com ... DNS lookup failed` | the machine running the server has no working DNS (VPN, firewall, captive portal). Not a key problem. Run `ipconfig /flushdns`, reconnect the VPN, or set DNS to 1.1.1.1 / 8.8.8.8 |
| `vision_configured: false` in `/api/health` | same as the first row |
| Review says a different model than `GEMINI_MODEL` | the primary model failed and the fallback ran. With the free tier this is usually HTTP 429 (quota); the exact reason is shown on the result and logged in the terminal. Set `GEMINI_MODEL=gemini-3.5-flash-lite` in `.env` to test without hitting the small daily cap |
| "photo may not match this pose" | you selected a pose but the model thinks the photo shows another one; pick *Let the model identify it* |
| Red rubric badge | hand-editing error in `backend/asanas.json`; hover the badge for the field |
| Tight/odd angle feedback | expected — the ranges are placeholders (`verified: false`) and the values are VLM estimates |

Quick checks:

```bash
curl http://localhost:8000/api/health
python -c "import socket; print(socket.getaddrinfo('generativelanguage.googleapis.com', 443)[0][4])"
```

## Removing the legacy implementation

`legacy/` holds the previous MediaPipe + Node/Express + React version and is not used at runtime. It
is excluded from Docker builds and Vercel uploads. Delete it once you are confident you do not need
it:

```bash
rm -rf legacy
```
