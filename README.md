# DIF Tutor

Math 555 (Differential Equations I) practice app for iPad: write with the Apple Pencil, get checked by an AI tutor, and keep every attempt.

- **App**: installable web app (Add to Home Screen), works offline for practice. Static files in `public/`, hosted on Vercel.
- **Database**: Supabase project `rdfhauvxbubmpmiswxyc`. Tables `dif_attempts` (one row per attempt: problem, outcome, help used, time), `dif_attempt_ink` (handwriting strokes for replay), `dif_progress` (marks, mistake log, mock-exam scores), `dif_tutor_usage` (tutor call log). Row-level security: each user sees only their own rows.
- **AI tutor**: Supabase Edge Function `dif-tutor` → Anthropic Messages API. Needs the secret `ANTHROPIC_API_KEY`. Only the emails in `ALLOWED_EMAILS` (default: Adan's) can use it, capped at `DAILY_CAP` calls per 24 h (default 250).

## Update the app
1. Edit `src/tutor/page.html` (the tutor page), `src/tutor/bank.json` (problems) or `src/app-shell.js` (sign-in, database, tutor connection).
2. `python3 build_app.py` → rebuilds `public/`.
3. Commit and push; Vercel redeploys automatically.

## Files
- `public/` — what gets deployed (built).
- `src/tutor/` — tutor page template, problem bank, formula-sheet images and card positions.
- `src/app-shell.js` — Supabase sign-in, database adapter, tutor client. `src/sw.js` — offline cache. `src/manifest.webmanifest`, `src/icons/`.
- `supabase/` — the database migration and Edge Function source (already deployed).
