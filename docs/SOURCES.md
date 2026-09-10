# Sources and licensing determination

Every piece of linguistic content in Cognate Bridge comes from an external source. This
document records what each source is, what its licence permits, and how the project uses
it. It is the reference for the in-app About/credits page.

The short version: **Interlingua vocabulary is bulk-parsed under CC BY 3.0, the two 1951
IALA works are cited for their rules but never bulk-copied, and the experimental Finnish
module draws on project-authored vocabulary plus cited (not bulk-copied) grammar topics.**

## Summary table

| Source | Licence | How this project uses it |
| --- | --- | --- |
| IEDICT (Denisowski) | CC BY 3.0 | Bulk-parsed: Interlingua headwords and English glosses |
| *Interlingua–English Dictionary* introduction (1951) | Unclear (see below) | Rule citations only |
| *Interlingua: A Grammar* (Gode & Blair, 1951) | Unclear (see below) | Rule citations only |
| Apertium bilingual dictionaries | GPL v3 | Validation lexicon only; no data redistributed |
| Wiktionary / wiktextract | CC BY-SA 4.0 | Validation lexicon only; no data redistributed |
| OpenSubtitles FrequencyWords / SUBTLEX | Public / research use with attribution | Spoken-register lemma ranks for study bands (incl. Finnish `fi`) |
| COCA word frequency lists (www.wordfrequency.info) | Redistributable with source attribution | Deprecated for seed; retained as reference |
| Experimental Finnish core + Estonian cognates | Project-authored; FrequencyWords ranks | Hidden pedagogical module (`fin`); see below |
| Wikibooks *Suomen kieli ulkomaalaisille* | CC BY-SA | Grammar **topics cited**; example sentences newly written |
| Omorfi / OFITWOL / NorthEuraLex bulk dumps | GPL / research corpora | **Not bulk-imported** in v1 (citation / future option only) |

## Interlingua — cleared for bulk use, via a source the project spec did not know about

The spec assumed the 1951 *Interlingua–English Dictionary* would be the data source. It is
not, because its copyright status could not be established (below). The data source is
instead:

**IEDICT** — Paul Denisowski, 15 February 2019, 31,031 entries.
<http://www.denisowski.org/Interlingua/IEDICT/iedict.txt>

> IEDICT (Interlingua-English Dictionary) by Paul Denisowski is licensed under a Creative
> Commons Attribution 3.0 Unported License. What this means is that anyone can use,
> transmit, or modify IEDICT for any purpose, including commercial purposes, as long as
> the source is properly attributed.

CC BY 3.0 is unambiguous and permits commercial use, so this is safe to parse in bulk and
to redistribute as seeded database rows. The only obligation is attribution, discharged on
the About page.

Format is one entry per line, `interlingua : english gloss`, with no part-of-speech field
and no cognate data:

```
filia : daughter
filio : son
filo : thread, yarn, edge (of a knife, razor)
filo de auro : gold wire
```

Part of speech is therefore inferred (see `parsers/interlingua/`), and Romance cognates are
generated rather than looked up (see below).

### The two 1951 IALA works: cited, not copied

*Interlingua–English Dictionary* (IALA, dir. Alexander Gode, 1951) and *Interlingua: A
Grammar of the International Language* (Gode & Blair, 1951, renewed by Science Service
1955) are both US works first published in 1951. Works of that vintage required a
copyright renewal filed around 1979 to remain in copyright, and this project has **not**
verified whether renewals were filed. Absent that verification, assume they are still in
copyright.

Both are freely readable online — the IED introduction at
<https://www.interlingua.com/ied/intro/>, the grammar at <https://adoneilson.com/int/gi/>
and <https://rudhar.com/iagr> — but readability is not a licence.

The project therefore treats them as **rule citation sources**. Facts about a language are
not copyrightable; a particular expression of them is. So the project extracts the
*substance* of a rule, restates it in its own words, and records a citation to the section
it came from, in exactly the way a paper cites a reference. It does not copy entry text,
tables, or example sentences verbatim into the database.

Concretely, the IED introduction's section *Variants and Their Prototypes* documents the
derivations that this project encodes as `correspondence_rules` rows — for example that
the prototype of French *terre*, Spanish *tierra*, Portuguese and Italian *terra* is
`terra`, with the Spanish diphthong and the French final `-e` being language-specific
developments. That fact is what gets stored; the paragraph stating it is not.

Every `correspondence_rules` and `grammar_patterns` row carries a `source_note` naming the
work and section it derives from, so the citation trail is queryable rather than
informal.

## Validation lexicons — consulted, not redistributed

The Romance cognate generator checks whether a predicted target-language form actually
exists. It consults Apertium bilingual dictionaries (GPL v3) and wiktextract-derived
wordlists (CC BY-SA 4.0) as a **membership test only**.

This matters legally: GPL v3 and CC BY-SA are both copyleft, and redistributing their
content would pull those terms onto the derived dataset. Recording only the boolean "this
form was attested in lexicon X" avoids that entirely, since the stored target word is one
this project generated from a rule, not one it copied. The `cognate_correspondences`
table records which lexicon confirmed each form in `validated_against` so the provenance
is auditable, and the lexicon files themselves stay out of the repository.

## Word frequency — spoken / subtitle ranks

Study cards are batched by how common the English meaning is in **spoken** language:
ranks 1–500, then 501–1000, and so on. Primary ranks come from
[OpenSubtitles FrequencyWords](https://github.com/hermitdave/FrequencyWords) (subtitle
corpora). A local SUBTLEX-US export under `parsers/frequency/cache/` is preferred for
English when present. Leipzig lists may be added as fallbacks for languages without
subtitle data. Rebuild with `python -m frequency.build` from `parsers/`.

The converted multi-language JSON lives at `server/data/spoken_frequency.json`. English
ranks drive `bridge_vocabulary.frequency_rank` at seed; other languages are stored for
cross-linguistic scoring. A documented `coverage_95_rank_en` approximates the 95% spoken
coverage cutoff (not a CEFR label).

The older COCA list at `docs/COCA English word frequency list.txt` /
`server/data/wordfrequency.json` is **deprecated** for seed ranking (kept for reference).

## Etymological / similarity cognates (augment)

Additional cognates are merged at seed from `parsers/out/etym_cognates.json`, built by
`python -m cognates.build`. Curated etym links (Etymological Wordnet–style fixtures;
full de Melo dump optional under `parsers/cognates/cache/`) use provenance `curated`.
Translation-pair surface matches (MUSE bilingual dictionaries when present, else
fixtures) use provenance `similarity`. Existing `parsed` and `rule_generated` rows are
kept; on collision, higher provenance rank / confidence wins.

## Transparency and study priority

`bridge_vocabulary.transparency_score` is the mean orthographic transparency of
non-English cognates vs the English gloss (boosted when a sound-law rule is linked).
`priority_score` is a lower-sooner composite (geometric mean of spoken rank and
1/transparency). Study queues order by `priority_score`, then `frequency_rank`.

## UD grammar patterns (augment)

`python -m ud_grammar.build` emits `ud_*_grammar.json` files with frequency-ranked
dependency templates from Universal Dependencies-style fixture counts. Hand-authored
bridge examples illustrate each template; treebank sentences are not copied. Seed
concatenates these after each bridge’s existing grammar JSON.

## Experimental Finnish module (`fin`)

Finnish is seeded as a natural-language **bridge** with **Estonian** as its only cognate
target. The module is a creator pedagogical testbed: enable with
`ENABLE_EXPERIMENTAL_BRIDGES=fin` (see README). Vocabulary is a curated high-frequency
core with project-authored English glosses and Estonian cognate pairs; spoken ranks come
from FrequencyWords `fi`. Grammar patterns are hand-authored (gradation, verb rections,
partitive vs accusative, locatives, vowel harmony, negation), citing Wikibooks *Suomen
kieli ulkomaalaisille* topics under CC BY-SA without bulk copying. Omorfi/OFITWOL and
NorthEuraLex bulk imports remain deferred.
