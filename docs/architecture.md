# Cognate Bridge Architecture

This document describes the architecture implemented in the repository, rather than
the earlier project specification. The project is a language-learning application built
around bridge languages: a learner studies a bridge language and sees corresponding
forms in selected target languages, together with the rule or source evidence behind
the correspondence.

## System shape

The system has an offline content pipeline and a live application pipeline:

```text
Source documents, dictionaries, spreadsheets, and open lexicons
															|
															v
								 parsers/ (Python, run offline)
															|
															v
								 parsers/out/*.json (derived data)
															|
															v
						 server/src/seed/run.ts (transactional loader)
															|
															v
										PostgreSQL database
															|
															v
						 server/ (Express + TypeScript API)
															|
															v
						 client/ (React + TypeScript SPA)
```

The parser output, not the original source documents, is the input to the live
application. This is an important boundary for reproducibility and licensing: the
server reads structured content from the database, while source PDFs and other source
materials remain offline inputs to the build process.

## Repository components

### `parsers/`: offline content production

The Python package converts source material into JSON documents suitable for seeding.
It is not imported by the API at runtime.

- `interlingua/` is the flagship bridge module. It builds vocabulary and grammar
	content from IEDICT and documented correspondence rules. Its rule engine predicts
	target-language forms (Spanish, French, Italian, Portuguese) from the Interlingua
	headword and can validate predictions against available lexicons before they are
	kept.
- `finnish/` is a second, experimental bridge module, included to show a different
	shape of source pipeline: rather than a rule engine predicting cognates, it teaches
	Finnish itself with a curated, project-authored core of Estonian cognate pairs. It
	is hidden from the public API unless explicitly enabled.
- `cognates/` adds etymological and similarity-based cognate data.
- `frequency/` produces frequency rankings used to order and filter study content.
- `ud_grammar/` augments bridges with Universal Dependencies-derived grammar drills.
- `rule_cards/` produces correspondence-rule decoder cards.
- `common/` contains shared extraction utilities, including PDF handling.

The committed files in `parsers/out/` make normal seeding possible without rerunning
the source parsers. Rebuilding content is a separate, potentially networked operation;
for example, some builders download dictionaries or lexicons.

### `server/`: API, persistence, and learning rules

The backend is an Express application written in TypeScript. It uses `pg` directly for
PostgreSQL access, Zod for request validation, JSON Web Tokens for authentication,
`node-pg-migrate` for schema migrations, and Vitest/Supertest for tests.

- `src/index.ts` starts the HTTP server and handles graceful shutdown.
- `src/app.ts` creates the Express app, configures CORS and JSON parsing, exposes the
	health check and license files, and mounts the routers.
- `src/routes/auth.ts` handles registration, login, the current-user profile, learning
	preferences, and deletion/reset of user learning data.
- `src/routes/content.ts` exposes bridges, targets, vocabulary browsing, study queues,
	grammar, rule cards, games, statistics, target selection, and review operations.
- `src/routes/tts.ts` exposes TTS availability and authenticated synthesis.
- `src/models/` contains hand-written SQL and result types. There is no ORM layer.
	`content.model.ts` reads teachable content; `progress.model.ts` reads and updates
	learner state; `user.model.ts` owns account and profile data.
- `src/services/scheduler.ts` is the pure scheduling engine. Vocabulary uses an
	Anki-style SM-2-like state machine with Again/Hard/Good/Easy grades. Grammar patterns
	and rule cards use fixed Leitner-style mastery boxes at 0, 25, 50, 75, and 100.
- `src/services/tts.ts` supports optional Google Cloud TTS and `src/services/piper.ts`
	supports optional local Piper voices. TTS is an auxiliary service, not a prerequisite
	for studying.
- `src/seed/run.ts` converts parser JSON into database rows. It loads languages, rules,
	vocabulary, cognates, grammar, frequency metadata, and rule cards in a transaction.
	Content is replaced on a seed run; users are preserved, but progress tied to replaced
	content can no longer be relied upon.
- `src/content/attribution.ts` provides the source and modification notices consumed by
	the About page and `/api/attribution`. Vendored license text is served through
	`/api/licenses/`.

The API also applies product-level visibility rules. The `fin` bridge and `et` target
are seeded data, but they are omitted from normal API responses until
`ENABLE_EXPERIMENTAL_BRIDGES=fin` is set. Target visibility also depends on the user's
interface language and selected learning preferences.

### `client/`: browser application

The frontend is a React 18 single-page application built with Vite. It uses React
Router, Axios through `src/services/api`, and Testing Library/Vitest.

`main.tsx` composes the application providers in this order:

```text
BrowserRouter
	AuthProvider
		LocaleBridge / I18nContext
			App
```

`App.tsx` defines two route groups:

- Global routes include home, target selection, About, and rule-card pages.
- Bridge-scoped routes are under `/b/:bridge/`: study, games, cards, statistics,
	vocabulary browsing, grammar lists, and grammar drills.

`AppShell` supplies the authenticated application frame and bridge-aware navigation.
Unauthenticated users are sent to the authentication page, except that `/about` remains
public so source and license information is accessible without an account. The auth
context stores the JWT in browser local storage and uses it for API requests.

The browser also contains pure client-side learning helpers in `src/lib`, including the
game matching engine, sentence-order exercises, and browser/WASM pronunciation support.
These complement the server scheduler; they do not replace server-side persistence or
review decisions.

## Data model

The schema is evolved by the numbered SQL migrations in `server/migrations/`. The main
relationships are:

```text
bridge_languages --< bridge_target_links >-- target_languages
			 |
			 +--< bridge_vocabulary --< cognate_correspondences >-- target_languages
			 |             |
			 |             +--< vocabulary_progress >-- users
			 |
			 +--< correspondence_rules
			 |
			 +--< grammar_patterns --< grammar_examples
										 |
										 +--< grammar_progress >-- users
```

Important modeling choices:

- A bridge language is the scaffold being studied. A target language is the language
	the learner is working toward. The relationship is many-to-many, so a target can be
	linked to several bridges.
- `bridge_vocabulary` stores the headword, glosses, part of speech, IPA, etymology,
	source reference, difficulty, frequency metadata, and track flags.
- `correspondence_rules` are first-class records with descriptions, citations, examples,
	and optional executable pattern/replacement fields. Directly curated cognates (for
	example Finnish's Estonian pairs) can have explanatory rules without a generated
	transformation; rule-generated cognates (Interlingua's predicted Romance forms) must
	reference a rule.
- `cognate_correspondences` stores the target form plus provenance (`parsed`,
	`rule_generated`, `curated`, or later similarity augmentation), confidence, and any
	validation source.
- Users select target languages through `user_target_languages`. API queries attach only
	the selected cognates for authenticated learners; anonymous browse can show all
	cognates.
- Vocabulary and grammar progress are separate because their scheduling algorithms and
	review controls differ. Later migrations add vocabulary tiers/SM-2 fields, rule cards,
	core tracks, source-language preferences, priority targets, and interface language.

## Request and study flow

1. The browser loads the SPA and restores a JWT from local storage, if present.
2. The client calls the Express API under `/api`. CORS is configured for the client
	 origin; Vite proxies `/api` to the local API during development.
3. Public requests can list bridges, targets, attribution, and browse vocabulary.
	 Authenticated requests use the JWT middleware for personal targets, study queues,
	 progress, games, reviews, and TTS synthesis.
4. For a study request, the API resolves the bridge, user's selected targets, optional
	 frequency/cognate filters, and the bridge-specific known side. It queries due and new
	 rows, attaches the relevant cognates and correspondence rules, and adds progress
	 state before returning JSON.
5. A review request is validated and passed to the corresponding scheduler. The API
	 persists the resulting next-review time and counters in PostgreSQL.
6. The client renders the returned card and correspondence information. Audio may come
	 from browser/WASM speech, or from the authenticated API TTS endpoint when a configured
	 cloud or Piper engine is selected.

## Content generation and seeding

There are two distinct cognate strategies, illustrated by the two bridge modules:

- Interlingua uses documented correspondence rules to predict target forms from the
	bridge headword. Generated forms carry a rule, provenance, confidence, and validation
	source; unsupported or unvalidated predictions are not treated as equivalent to
	directly curated forms.
- Finnish, by contrast, supplies cognate forms directly: its Estonian pairs are curated
	rather than predicted, so the parser preserves the pairing and its source reference,
	and the seed normalizes it into one row per target language and form. A future bridge
	whose source already states cognates (the way a dictionary with cognate annotations
	would) can follow this same direct path instead of building a rule engine.

The seed also merges auxiliary outputs such as English etymological cognates, frequency
bands, Universal Dependencies grammar drills, and rule cards. It maps external language
codes to database IDs, inserts in chunks, and runs the replacement within a transaction.

## Local and deployed topology

Local development uses three processes/services:

```text
Docker Compose PostgreSQL :5433
					^
					|
Express API :3002  <--- Vite client :5174
```

`docker-compose.yml` supplies PostgreSQL 16 and initializes the test database. The API
runs migrations, can seed the committed parser output, and serves `/health`. The Vite
development server proxies API requests so the browser does not need local CORS setup.

The deployment configuration separates the two web tiers:

- `render.yaml` defines the Node API on Render. Its build compiles TypeScript; startup
	applies migrations before starting the compiled server. Production supplies
	`DATABASE_URL`, `CORS_ORIGIN`, and a generated `JWT_SECRET`.
- `client/vercel.json` defines the Vite client build and rewrites SPA routes to
	`index.html`. The client receives the API origin through `VITE_API_URL`.
- The database is external managed PostgreSQL, currently expected to be supplied by a
	Neon connection string rather than declared as a Render database service.

This is a deployment target described by repository configuration; the manifests do not
by themselves prove that a production instance is currently running.

## Verification and maintenance

The repository has separate test/build surfaces:

- `server`: `npm run typecheck`, `npm run build`, and `npm test`. Integration tests use
	PostgreSQL when `TEST_DATABASE_URL` is available.
- `client`: `npm run typecheck`, `npm run build`, and `npm test`.
- `parsers`: `python -m pytest` using the configuration in `pyproject.toml`.

The safest extension path is to follow the ownership boundaries: add or change source
extraction in `parsers/`, update the JSON contract and seed mapping, evolve the schema
with a migration when needed, expose behavior through a model and route, then connect
it to a client page or component. Changes to content should be checked against source
licensing and attribution before they are seeded or deployed.

## Relationship to the architecture overview

`Cognate_Bridge_Architecture_Overview.md` is a useful high-level guide and its central
parse-time/runtime boundary is confirmed by the code. This document adds the details
that are easy to miss when reading only that overview: the current API route/provider
structure, the replacement semantics of seeding, the two separate scheduling systems,
interface-language and experimental-bridge filtering, browser/WASM TTS, and the fact
that Render and Vercel are separate deployment targets.
