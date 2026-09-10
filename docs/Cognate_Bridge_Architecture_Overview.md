# Cognate Bridge: Architecture Overview

This describes the codebase as it actually exists right now, not the
original spec (which is well behind current reality in several places —
Postgres replaced SQLite, spaced repetition, TTS, and games didn't exist at all in the
original plan). Where something isn't obvious from reading the code, I've
noted it; everything else here I confirmed by reading the actual files,
not inferring from file names.

## The one idea that explains most of the rest

There's a hard boundary between **parse-time** (offline, on your machine,
run manually) and **run-time** (the live app, running on the server the
public actually hits). This boundary exists because of licensing, not
just convenience:

```
Source documents (PDFs, spreadsheets)
    │  restricted or license-specific — never touch the live server
    ▼
parsers/  (Python, run manually, offline)
    │  extracts, structures, validates
    ▼
parsers/out/*.json   (cleared, structured, derived data)
    │
    ▼
server/src/seed/run.ts   (loads JSON into Postgres — "npm run seed")
    │
    ▼
Postgres (the only thing the live app actually reads from)
    │
    ▼
server/src/  (Express API)
    │
    ▼
client/src/  (React app)
```

The live server and the deployed database never see the original source
documents at all — only what the parsers extracted and the seed step
loaded. This is why a source with restrictive terms could sit in `docs/`
for reference without ever being a redistribution risk: nothing
downstream of the parse step touches it. In practice the shipped bridges
don't need this escape hatch — Interlingua's IEDICT source is CC BY and
Finnish's content is project-authored — but the boundary is what would
let a future bridge use a more restricted source safely.

## Backend (`server/`)

**Stack:** Express + TypeScript, Postgres (via `pg`, not an ORM), Zod for
request validation, `node-pg-migrate` for schema migrations, Vitest +
Supertest for testing.

- `server/migrations/*.sql` — 16 migrations as of this snapshot, applied
  in order, tracked by number. This is your schema's real history; reading
  them in sequence tells you how the data model actually evolved (e.g.,
  `0011_core_track_and_fluency.sql` adds the `is_core_track` flag used to
  mark Interlingua's pedagogically representative core vocabulary).
- `server/src/db.ts` — a single connection pool, not a query builder.
  Worth reading in full once; it's short, and the comments explain two
  non-obvious decisions (NUMERIC-as-float parsing, and why TLS is
  conditional on whether the host is `localhost`).
- `server/src/models/` — hand-written SQL queries, one file per domain
  (`content.model.ts` for vocabulary/grammar/cognates, `progress.model.ts`
  for scheduling state, `user.model.ts` for auth). No ORM abstraction
  layer between these and Postgres — reading a model function *is* reading
  the query.
- `server/src/routes/` — thin Express route handlers that call into
  models. If you're tracing "what happens when the client calls X," start
  in `routes/`, not `models/` — routes are the entry point.
- `server/src/services/` — the two most important are `scheduler.ts`
  (spaced repetition, see below) and `tts.ts`/`piper.ts` (server-side
  text-to-speech).
- `server/src/seed/` — the parse-output-to-Postgres loader. `run.ts` is
  the orchestrator; it replaces content rather than merging on every run,
  deliberately (the parsers are deterministic, so a partial merge has no
  advantage — the file's own top comment explains this and the review-
  history tradeoff it implies).
- `server/src/content/attribution.ts` — the license/attribution text
  served to the client. This exists as code, not just documentation,
  specifically so the About page can render it live rather than someone
  having to keep a markdown file and a UI component in sync by hand.

## Data model: the core shape to hold in your head

Four entities matter most:

- **`bridge_languages`** — Interlingua (`family = 'Romance'`) and, when
  `ENABLE_EXPERIMENTAL_BRIDGES=fin` is set, the experimental Finnish
  bridge (`family = 'Uralic'`). `LanguageFamily` also has a `'Germanic'`
  value in the type system, kept as scaffold for a future Germanic-family
  bridge — no shipped bridge currently populates it.
- **`target_languages`** — the real languages a learner is heading toward
  (Spanish, French, Italian, Portuguese, Estonian...). Notably, nothing
  stops a *bridge* language from also appearing as a target — the schema
  doesn't rule out "Interlingua as a target for another Romance bridge"
  without a schema change, even though no second Romance bridge ships
  today.
- **`bridge_target_links`** — many-to-many between the two, carrying
  `track_type` (comprehension vs. production) and priority ordering. The
  priority-target mechanism has slots for both a Romance-family and a
  Germanic-family target; Interlingua actively populates the Romance
  slot, while the Germanic slot exists for future extensibility and has
  no active bridge behind it yet.
- **`vocabulary`** and **`grammar_patterns`** — the actual teachable
  content, each tagged back to a bridge language, with `is_core_track` as
  the boolean that drives curated-subset behavior.

If you're extending the content model (a new bridge, a new track type, a
new content kind), start by understanding these four tables and their
relationships before touching anything else — almost everything else in
the schema hangs off them.

## Spaced repetition: two algorithms, not one, on purpose

`server/src/services/scheduler.ts` implements **two different scheduling
systems** for two different content types, and the file's own header
comment states why: vocabulary uses Anki-style SM-2 (ease factor, learning
steps, Again/Hard/Good/Easy), while grammar patterns and rule cards use
fixed-interval Leitner boxes keyed to a 0–100 mastery score in steps of 25.
This isn't inconsistency — vocabulary recall genuinely benefits from
per-item ease-factor tuning the way flashcard vocabulary always has;
grammar-pattern mastery is closer to a small number of discrete competence
levels, where a simpler fixed-box model is a better fit. If you're
debugging "why did this review interval come out to X," check which
system the content type in question actually uses before assuming a bug.

## Frontend (`client/`)

**Stack:** React 18 + TypeScript + Vite, React Router, Axios, Vitest +
Testing Library.

- **Routing is bridge-scoped.** `App.tsx` nests most routes under
  `/b/:bridge/...` (study, games, cards, stats, words), so `AppShell` can
  render navigation appropriate to whichever bridge language is active.
  Auth-agnostic routes (`/about`) sit outside that nesting deliberately —
  the comment in `App.tsx` is explicit that the About page must stay
  reachable even to a signed-out visitor, because the GFDL/CC BY notices
  need to be visible to anyone, not just logged-in users.
- **`i18n/`** supports displaying the interface itself in a *bridge*
  language, not just switching between ordinary interface languages —
  a genuinely distinctive feature, worth knowing exists as a mechanism.
  Check `client/src/i18n/messages/` for the current set of shipped
  locale files; the mechanism itself is bridge-agnostic, so adding a
  locale for a new bridge language is a matter of adding another
  messages module, not a schema or routing change.
- **`lib/`** holds the interesting pure-logic pieces, each with a colocated
  test: `matchingEngine.ts` (games), `sentenceOrder.ts` (word-order
  drills), `speakBridgeWord.ts` / `wasmTts.ts` / `ipaToSpeakText.ts`
  (client-side pronunciation, backed by `espeak-ng` compiled to WASM).
- **`pages/`** is a fairly direct map to the route list in `App.tsx` — if
  you know the route, you know the file.

## Parsers (`parsers/`)

Python, organized one subdirectory per source. `interlingua/` is the
flagship bridge: it builds vocabulary from IEDICT (`iedict.py`) and runs
a rule engine (`rules.py`) that predicts Romance target forms from each
Interlingua headword, validating predictions against external lexicons
before keeping them (`lexicons.py`). `finnish/` is the second, deliberately
different example: rather than a rule engine, it works from a curated,
project-authored core of Finnish/Estonian cognate pairs — useful to read
if you're adding a bridge whose source doesn't lend itself to rule
prediction. `cognates/` adds cross-language similarity/matching cognates
as an augment layer, and `rule_cards/` and `ud_grammar/` add
Universal-Dependencies-derived grammar content, separate from each
bridge's own grammar parser. Each bridge module has its own `build.py`
(vocabulary) and `build_grammar.py` (grammar patterns) as the two things
every bridge module produces, plus whatever source-specific logic it
needs — `phonology.py` and `pos.py` for Interlingua's IPA derivation and
part-of-speech inference, `lemmas.py` and `patterns.py` for Finnish's
grammar drills. `common/` holds extraction utilities shared across
parsers; a column-aware PDF extractor lives there too for any future
bridge whose source is a PDF dictionary, though neither shipped bridge's
build currently depends on it.

## Testing

Tests are colocated with source (`Foo.ts` next to `Foo.test.ts`), not in a
separate mirror tree — Vitest on both client and server, Supertest for
the API's HTTP-level tests, plus a dedicated `server/src/test/schema.test.ts`
that appears to test the database schema itself (worth reading if you're
about to write a migration, to see what's expected to hold).

## CI/Deployment

`.github/workflows/` runs CI; the earlier `render.yaml`-based deployment
plan from the original spec is the intended target, though I'd confirm
current deployment status directly rather than assume it from this file
listing — that's the one thing in this document I haven't independently
verified end-to-end.

## If you're picking this up to actually drive development yourself

A reasonable reading order, in order of "most load-bearing to understand
first":

1. `server/migrations/*.sql`, in order — the schema's real history.
2. `server/src/db.ts` and one model file (`content.model.ts`) — how the
   app actually talks to Postgres.
3. `server/src/seed/run.ts` — how parser output becomes live data.
4. One full parser module end-to-end (`parsers/interlingua/`) — it's the
   flagship bridge and the clearest illustration of the rule-generation
   pipeline; read `parsers/finnish/` afterward to see the same contract
   satisfied by a curated source instead.
5. `client/src/App.tsx` then one page (`StudyPage.tsx`) — how a route
   becomes a screen.
6. `server/src/services/scheduler.ts` — the one subsystem most likely to
   have a subtle bug if you extend content types without checking which
   scheduling algorithm applies.
