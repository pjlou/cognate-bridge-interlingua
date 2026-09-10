# Sound Correspondence Rule Cards
### A decoder set for Romance cognate recognition

**Implemented as** `/rules` in the app (list + drill + SRS). Both cards below are seeded
from this doc into `parsers/out/rule_cards.json`. Frequency re-ranking, transparency
scoring, and pipeline overhauls stay future work.

**Purpose:** Each card is a *synchronic decoding rule*, not a history lesson. The goal is for the listener to internalize "if I hear X in language A, try substituting Y to check language B" as a live, real-time strategy — the way a chess player recognizes a pattern rather than recalling why it was invented.

**A note on the example words below:** these are chosen from well-established, high-frequency vocabulary based on general knowledge of core Romance lexis, not pulled from your SUBTLEX pipeline. Treat this as a first draft — re-rank and prune each card's example list against your actual frequency data before finalizing, since a few of these may sit lower in casual-speech frequency than they appear to a fluent adult.

---

## Tier 1 — Highest yield (teach first)

### Card 1: Romance C-palatalization split (the "hundred" test)
**Pattern:** Latin *c* before a front vowel (e, i) split three ways across Romance languages. Learning this one three-way split lets a learner mentally "de-palatalize" any Romance word back to a shared shape.

| Language | Reflex of Latin ce-/ci- | Example |
|---|---|---|
| Italian | [tʃ] ("ch") | cento, cielo |
| French | [s] | cent, ciel |
| Spanish (European) | [θ] ("th") | cien, cielo |
| Spanish (Latin American) | [s] | cien, cielo |

**Teaching frame:** "Hear a French word with a soft s- where you'd expect a hard c-? Try swapping in 'ch' (Italian) or 'th' (Spanish) mentally — they're often the same root."

**High-value cognate seeds to test this rule on:** century/cent/cento/ciento; centre/centro; cielo/ciel/heaven(not cognate, skip); face/faccia (different root — verify before including); city/cité/città/ciudad.

---

## Tier 2 — Strong secondary yield

### Card 2: Prosthetic vowel before Latin s+consonant (Romance-internal, useful for recognizing Romance-Romance and Romance-English pairs)
**Pattern:** Latin words beginning with *s* + consonant (st-, sp-, sc-) gained a prothetic vowel in French, Spanish, and Portuguese, but not in Italian or English.

| Language | Treatment | Example |
|---|---|---|
| Latin | st-/sp-/sc- | schola, spatha, status |
| Italian | keeps st-/sp-/sc- | scuola, spada, stato |
| English | keeps st-/sp-/sc- | school, state |
| French | é + consonant | école, épée, état |
| Spanish | es + consonant | escuela, espada, estado |

**Teaching frame:** "A French or Spanish word starting with é-/es- followed by a consonant cluster shape may correspond to an English or Italian word with st-, sp-, or sc- at the start — just strip the vowel."

**Why include it:** it's not a "sound law" from the glossary you linked (it's a separate, well-documented Vulgar Latin epenthesis rule), but it's extremely high-yield for beginners because it affects common nouns (school, state, spouse/espoux, space/espace).

---

## Suggested rollout order (pending your frequency-list verification)

1. Card 1 (Romance c-split) — very teachable, immediately useful for Romance-to-Romance transfer
2. Card 2 (prosthetic vowel) — high yield, cheap to teach, good "aha" moment for learners

## Open items before this is production-ready

- Run every example word triad against your SUBTLEX-derived frequency ranks; drop or reorder any pair that turns out to be lower-frequency than it feels to a fluent speaker.
- Decide whether to score a word pair's "rule-governed" status as a binary boost to the cognate transparency score, or a continuous weight (e.g., words matching Card 1's split, like *ciento*, could get a compounded boost if a future card adds an overlapping pattern).
- Consider a small "false friend" companion list for each card — pairs that *look* like they follow the rule but etymologically don't — since a rule-based decoder will occasionally overgeneralize and a listener should learn its failure modes too.
