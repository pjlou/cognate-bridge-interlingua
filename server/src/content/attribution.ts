/**
 * Source attribution, served to the client's About page.
 *
 * This is not optional boilerplate. IEDICT, the core Interlingua source, is CC BY 3.0
 * and requires attribution; several other sources carry their own attribution or
 * research-use terms. Putting the text here rather than in the React tree keeps the
 * obligation next to the data model that incurred it, and lets `docs/SOURCES.md` and
 * the running app state the same thing.
 */

export interface AttributionSource {
  title: string;
  author: string;
  year: string;
  licence: string;
  licence_url: string | null;
  /**
   * API-relative path to this project's own copy of the licence text, for the licences
   * that require one to be included rather than merely cited. Served by the API so the
   * obligation does not depend on an external host staying up.
   */
  licence_text_path: string | null;
  source_url: string | null;
  /** How this project uses the source. */
  usage: string;
  /** Verbatim notice that must be preserved, where the licence requires one. */
  notice: string | null;
}

export const ATTRIBUTION: AttributionSource[] = [
  {
    title: 'IEDICT — Interlingua-English Dictionary',
    author: 'Paul Denisowski',
    year: '2019',
    licence: 'Creative Commons Attribution 3.0 Unported',
    licence_url: 'https://creativecommons.org/licenses/by/3.0/',
    licence_text_path: 'licenses/CC-BY-3.0.txt',
    source_url: 'http://www.denisowski.org/Interlingua/IEDICT/iedict.txt',
    usage:
      'Parsed in bulk. Supplies every Interlingua headword and its English gloss. Parts of ' +
      'speech are inferred by this project from Interlingua morphology and gloss shape, and are ' +
      'not present in the source.',
    notice: null,
  },
  {
    title: 'Interlingua–English Dictionary, Introduction',
    author: 'Alexander Gode and the research staff of IALA',
    year: '1951',
    licence: 'Cited, not reproduced',
    licence_url: null,
    licence_text_path: null,
    source_url: 'https://www.interlingua.com/ied/intro/',
    usage:
      'Used as a rule source only. The section “Variants and Their Prototypes” documents how ' +
      'Interlingua prototypes relate to their Romance variants; those derivations are restated ' +
      'in this project’s own words as correspondence rules, each citing the section it came ' +
      'from. No dictionary entries or passages are reproduced.',
    notice: null,
  },
  {
    title: 'Interlingua: A Grammar of the International Language',
    author: 'Alexander Gode and Hugh E. Blair',
    year: '1951',
    licence: 'Cited, not reproduced',
    licence_url: null,
    licence_text_path: null,
    source_url: 'https://adoneilson.com/int/gi/',
    usage:
      'Used as a rule source only. The Romance grammar patterns — pronoun case, object-pronoun ' +
      'proclisis, the -ar/-er/-ir verb classes and the affix word-building system — are ' +
      'described in this project’s own words with a citation to the relevant section. Example ' +
      'sentences are newly written rather than taken from the book.',
    notice: null,
  },
  {
    title: 'Apertium bilingual dictionaries',
    author: 'The Apertium project',
    year: 'ongoing',
    licence: 'GNU General Public License v3',
    licence_url: 'https://www.gnu.org/licenses/gpl-3.0.html',
    // No copy vendored: the GPL's obligations attach to distributing the covered work,
    // and this project distributes none of it -- only the boolean "form was attested".
    licence_text_path: null,
    source_url: 'https://github.com/apertium',
    usage:
      'Consulted as a validation lexicon, never redistributed. A generated Romance cognate is ' +
      'kept only if the predicted form is attested. Records of which lexicon confirmed a form ' +
      'are stored; no lexicon content is.',
    notice: null,
  },
  {
    title: 'Wiktionary, via wiktextract',
    author: 'Wiktionary contributors',
    year: 'ongoing',
    licence: 'Creative Commons Attribution-ShareAlike 4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    licence_text_path: null,
    source_url: 'https://kaikki.org/',
    usage:
      'Consulted as a validation lexicon, never redistributed, on the same terms as the ' +
      'Apertium data above.',
    notice: null,
  },
  {
    title: 'Spoken word frequency (OpenSubtitles FrequencyWords / SUBTLEX)',
    author: 'Hermit Dave FrequencyWords; Brysbaert & New (SUBTLEX) when used',
    year: '2018–',
    licence: 'Public frequency lists; attribute source',
    licence_url: 'https://github.com/hermitdave/FrequencyWords',
    licence_text_path: null,
    source_url: 'https://github.com/hermitdave/FrequencyWords',
    usage:
      'Subtitle-derived lemma ranks approximate spoken conversational language. English ' +
      'ranks batch vocabulary into bands of 500; other languages are stored for composite ' +
      'scoring. Rebuild via python -m frequency.build. Prefer local SUBTLEX-US when present.',
    notice:
      'OpenSubtitles FrequencyWords are derived from OpenSubtitles.org. Attribute the ' +
      'FrequencyWords project (and SUBTLEX authors when that export is used).',
  },
  {
    title: 'Experimental Finnish module (hidden by default)',
    author: 'Cognate Bridge (pedagogical core); FrequencyWords for spoken ranks',
    year: '2026',
    licence: 'Project-authored examples; FrequencyWords attribution for ranks',
    licence_url: 'https://github.com/hermitdave/FrequencyWords',
    licence_text_path: null,
    source_url: 'https://en.wikibooks.org/wiki/Suomen_kieli_ulkomaalaisille',
    usage:
      'Optional creator testbed: Finnish as study bridge with Estonian cognates only. ' +
      'Enable with ENABLE_EXPERIMENTAL_BRIDGES=fin. Grammar drills cite Wikibooks topics ' +
      '(CC BY-SA) without bulk copying. Not a production Romance/Germanic track.',
    notice:
      'Included as a pedagogical reference point for language-learning design, not as a ' +
      'shipped public curriculum by default.',
  },
  {
    title: 'Etymological Wordnet / MUSE bilingual dictionaries',
    author: 'Gerard de Melo (Etymological Wordnet); Facebook AI Research (MUSE)',
    year: '2014–',
    licence: 'Research use; attribute sources',
    licence_url: 'https://www1.icsi.berkeley.edu/~demelo/etymwn/',
    licence_text_path: null,
    source_url: 'https://github.com/facebookresearch/MUSE',
    usage:
      'Augments cognate rows: curated etym links (provenance curated) and translation-pair ' +
      'similarity matches (provenance similarity). Does not replace dictionary or rule-engine cognates.',
    notice: null,
  },
  {
    title: 'Universal Dependencies treebanks',
    author: 'Universal Dependencies consortium',
    year: 'ongoing',
    licence: 'Treebank-specific (typically CC BY-SA); attribute UD',
    licence_url: 'https://universaldependencies.org/',
    licence_text_path: null,
    source_url: 'https://universaldependencies.org/',
    usage:
      'Frequency-ranked dependency templates inform additional grammar drills. Example ' +
      'sentences are newly written for each bridge; treebank text is not copied wholesale.',
    notice: null,
  },
];
