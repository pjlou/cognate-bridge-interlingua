# Cognate Bridge

A spaced-repetition language learning app built around a **correspondence layer**: you
study a bridge language, and every word and grammar pattern shows you its real cognate in
the languages you are actually aiming for, along with the sound-correspondence rule that
predicts it.

**Interlingua** is the flagship bridge, shipped by default:

| Bridge | Family | Opens onto |
| --- | --- | --- |
| **Interlingua** (IALA / Gode) | Romance | Spanish, French, Italian, Portuguese |
| **Finnish** (experimental, opt-in via `ENABLE_EXPERIMENTAL_BRIDGES=fin`) | Uralic | Estonian |

The premise is that a bridge language is worth learning not for its own sake but as
scaffolding. Interlingua `nation` is not just "nation" — it is the form that makes
Spanish *nación*, French *nation*, Italian *nazione*, and Portuguese *nação* predictable,
via a stated correspondence rule about the Romance reflexes of the `-tion` suffix.
Cognate Bridge stores that rule as a first-class row that lessons reference, rather than
as a sentence baked into a UI string.

Grammar gets the same treatment and the same spaced-repetition scheduling as vocabulary,
because shared structure transfers to a real target language more directly than isolated
words do.

## Architecture

```
server/    Express + TypeScript API, Postgres, SQL migrations
client/    React + TypeScript, Vite
parsers/   Python: the Interlingua rule engine (and other bridge-specific pipelines)
docs/      Source documents and the licensing determination
```

Interlingua's pipeline **generates** cognates: its IEDICT source dictionary does not list
cognates, so documented prototype rules are run forward from each Interlingua headword to
predict each target-language form, and only predictions confirmed against an open lexicon
are kept. The resulting `cognate_correspondences` rows carry their provenance and the
rule that produced them.

Not every bridge needs a rule engine, though — the experimental Finnish module
illustrates the other shape a source can take: a curated, project-authored core of
Finnish/Estonian cognate pairs, parsed directly rather than predicted. If you're adding
your own bridge language, `parsers/finnish/` is the simpler pipeline to start from when
your source already states its cognates; `parsers/interlingua/` is the one to study when
your source doesn't and you need to derive them from correspondence rules instead.

## Running it locally

Prerequisites: Node 20+, Python 3.13+, and Docker (for the local database).

```bash
# 1. Database
# Docker needs to be running (e.g. Docker Desktop) for the local database
docker compose up -d

# 2. API
cd server
cp .env.example .env
npm install
npm run migrate:up
npm run seed        # loads parsed content from parsers/out/
npm run dev         # http://localhost:3002

# 3. Client, in a second terminal
cd client
npm install
npm run dev         # http://localhost:5174
```

The database, API and client ports (5433/3002/5174) are deliberately offset from
Postgres/Node/Vite's usual defaults so this can run alongside another local Cognate
Bridge checkout without port conflicts.

The client dev server proxies `/api` to the API, so no CORS configuration is needed in
development.

### Regenerating the content

Seed data is committed as JSON in `parsers/out/`, so a fresh clone can seed without
running the parsers. To rebuild it:

```bash
cd parsers
pip install -r requirements.txt
python -m interlingua.build        # downloads IEDICT, runs the rule engine
python -m interlingua.build_grammar
python -m finnish.build            # experimental Finnish core + Estonian cognates
python -m finnish.build_grammar    # gradation, cases, rections, …
python -m frequency.build          # spoken/subtitle lemma ranks → server/data/
python -m cognates.build           # etym + similarity cognate patches
python -m ud_grammar.build         # UD-template grammar drills (augments each bridge)
python -m rule_cards.build         # decoder cards (re-ranks examples by spoken freq)
```

`python -m interlingua.build` fetches IEDICT over the network. Pass `--offline` to reuse a
previously downloaded copy.

### Tests

```bash
cd server  && npm test    # unit + integration (integration needs Postgres)
cd client  && npm test
cd parsers && python -m pytest
```

Server integration tests are skipped when `TEST_DATABASE_URL` is unset, so the unit
suites still run on a machine with no database.

## Deploying

The target shape is a managed Postgres, a Node web service, and a static client.

1. **Database** — create a free Neon project and copy its connection string. Neon is
   preferred over Render's free Postgres, which expires after 30 days and would take the
   deployment down.
2. **API** — Render reads [`render.yaml`](render.yaml) as a Blueprint. Set `DATABASE_URL`
   to the Neon string and `CORS_ORIGIN` to the client's origin. `JWT_SECRET` is generated
   for you. Migrations run on boot, and `/health` is the health check.
3. **Client** — import `client/` into Vercel; [`client/vercel.json`](client/vercel.json)
   sets the build and the SPA rewrite. Set `VITE_API_URL` to the API origin plus `/api`.
4. **Seed** — run `npm run seed` once against the production `DATABASE_URL`.

[CI](.github/workflows/ci.yml) typechecks, tests and builds all three packages on every
push, with a Postgres service container for the integration tests.

## Licensing

Content comes from third-party sources with different terms, and the distinction matters:
Interlingua vocabulary comes from IEDICT (Denisowski) under CC BY 3.0 and is bulk-parsed;
the two 1951 IALA works (the *Interlingua–English Dictionary* introduction and *Interlingua:
A Grammar*) are cited for their rules but never bulk-copied; and the experimental Finnish
module's vocabulary is project-authored, with grammar topics cited (not bulk-copied) from
a CC BY-SA Wikibooks source.
[`docs/SOURCES.md`](docs/SOURCES.md) records the full determination. The app surfaces the
same information on its About page (`/about`, reachable without signing in). CC BY 3.0
attribution for IEDICT is discharged there and at `/api/attribution`.

This project adapts an earlier coursework app (CS468 Language Learning App) for its
authentication and spaced-repetition design.

## Experimental: Finnish module

An experimental **Finnish** bridge (`fin`, family Uralic) is seeded when
`parsers/out/finnish.json` is present. It teaches Finnish itself with **Estonian**
cognates only, and is intended as a pedagogical reference / creator testbed — not a
production Romance or Germanic track.

It is **hidden by default**. To enable it locally:

1. Ensure Finnish content is seeded (`npm run seed` after building parsers, or use the
   committed `parsers/out/finnish*.json` files).
2. Set in `server/.env`:

```bash
ENABLE_EXPERIMENTAL_BRIDGES=fin
```

3. Restart the API. Home will list Finnish; the target picker will include Estonian.

Without that env var, `GET /api/bridges` omits `fin` and `GET /api/targets` omits `et`,
even if the rows exist in Postgres. Direct `/b/fin/...` routes also return 404.

## Local TTS with Piper (not recommended)

The browser can typically handle text to speech reliably.  
Piper is an alternative option, but has unreliable results. 

### 1. Install Piper

Download a release for your OS from [rhasspy/piper](https://github.com/rhasspy/piper/releases)
(or build from source). You need the `piper` binary (on Windows, `piper.exe`).

### 2. Download voice models

Get ONNX voices from the [Piper voices list](https://github.com/rhasspy/piper/blob/master/VOICES.md)
(or Hugging Face `rhasspy/piper-voices`). Each voice is an `.onnx` file plus a matching
`.onnx.json`. Put them in one directory, for example `server/piper/voices/` (gitignored).

Suggested models for Cognate Bridge bridges:

| Bridge preference | Piper model prefix | Example package |
| --- | --- | --- |
| Finnish (`fin`) | `fi_FI-` | `fi_FI-harri-medium` |
| Italian (`ia`) | `it_IT-` | `it_IT-riccardo-x_low` |
| Spanish (`ia`) | `es_ES-` | `es_ES-sharvard-medium` |

The server picks a stable `.onnx` whose filename starts with the matching prefix
(preferring `-medium`, then `-high`, then `-low`, then alphabetical). Synthesis uses
`--noise_scale 0` / `--noise_w 0` so Replay sounds the same each time, and sends a
trailing newline so Piper does not truncate the last phonemes.

## Troubleshooting

### Browser voices are unavailable

If Study Reveal says `Install an Italian or Spanish speech voice` (or a similar message), 
it is recommended to switch to a Chrome Browser, which typically has direct support.

Alternatively, you can install the matching Windows speech language:

1. Open **Settings → Time & language → Language & region**.
2. Under **Preferred languages**, choose **Add a language**.
3. Add **Italian**, **Spanish**, or **Finnish** as needed.
4. Open the language's `...` menu → **Language options**.
5. Under **Speech**, click **Download**.
6. Restart the browser completely, then reload the study page.

The application looks for browser voices with these language tags:

- Interlingua: `it-IT`/`it` or `es-ES`/`es`
- Finnish: `fi-FI` or `fi`

The Windows display language does not need to change. Microsoft Edge generally exposes installed
Windows speech voices more reliably than other browsers. If a browser voice is still unavailable,
use **Local TTS (Piper)** instead.

Some headwords are flagged as misread by a given stand-in voice (for example Interlingua **nation**
on the Italian stand-in). Browser TTS then tries the other stand-in (Spanish). If every stand-in is
flagged, speech stays silent until you add a corrected WAV at
`client/public/tts-corrections/{bridge}/{headword}.wav` (e.g. `ia/nation.wav`).

### 3. Configure the API

In `server/.env`:

```bash
PIPER_BIN=C:\path\to\piper.exe
PIPER_VOICES_DIR=C:\path\to\voices
```

On macOS/Linux use absolute paths to the `piper` binary and the voices directory, e.g.:

```bash
PIPER_BIN=/opt/piper/piper
PIPER_VOICES_DIR=/opt/piper/voices
```

Restart the API. `GET /api/tts/status` should report `"local": true`. On the Study page,
choose **Local TTS (Piper)** under Speech engine. Language priority still applies when
choosing which Piper model to use: the priority-target mechanism has a Romance-family
slot (actively populated by Interlingua's Italian/Spanish preference) and a
Germanic-family slot kept as scaffold for future extensibility — no shipped bridge
populates the Germanic slot today, so it has no effect on Piper model selection.