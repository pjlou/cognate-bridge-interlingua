"""Interlingua grammar patterns, hand-authored.

These are not parsed from a source. There is no openly licensed
Interlingua grammar to parse: Gode & Blair's 1951 grammar has an unclear renewal status
(see docs/SOURCES.md), so it is cited section by section and never copied. Every rule
below carries the section it comes from, and the example sentences and their Romance
parallels are written for this app.

That is not much of a loss. Interlingua's grammar is deliberately small, so the content
worth drilling is a handful of patterns rather than a book's worth.

Which patterns are worth drilling is decided by what actually transfers. Interlingua
regularises away most of what makes Romance grammar hard -- there is no gender agreement
and no personal verb inflection -- so a pattern only earns a place here if the Romance
languages share it. Two kinds qualify:

  * Patterns Interlingua keeps and Romance keeps too: pronoun case, object proclisis,
    the three infinitive classes, the affix system.
  * Patterns Interlingua drops that Romance requires. These are drilled as warnings
    rather than as models, because a learner who generalises Interlingua's invariant verb
    to Spanish will be wrong in every sentence. Honest scaffolding has to mark where the
    scaffold stops.
"""

from __future__ import annotations

from common.patterns import Example, Pattern, assign_sibling_distractors

BRIDGE_CODE = "ia"
FAMILY = "Romance"

GRAMMAR = "Gode & Blair, Interlingua: A Grammar of the International Language, 2nd ed. 1955"


PATTERNS: list[Pattern] = [
    Pattern(
        slug="pronoun-case",
        name="Pronoun case",
        family=FAMILY,
        summary="Subject, object, and possessive forms: io / me / mi.",
        description=(
            "Interlingua keeps the case system Latin had on pronouns, even though it drops "
            "it everywhere else. Each person has a subject form (io, tu, ille, illa, nos, "
            "vos, illes), an object form (me, te, le, la, nos, vos, les), a possessive "
            "adjective (mi, tu, su, nostre, lor), and a possessive pronoun (mie, tue, sue, "
            "nostre, lore). Every Romance language makes the same distinctions with "
            "recognisably related forms, so this table is the highest-value thing to "
            "memorise here: it unlocks the pronoun systems of four languages at once."
        ),
        source_note=f"{GRAMMAR}, \u00a754 (p. 21)",
        difficulty_level=2,
        examples=[
            Example(
                bridge_text="Io vide le can.",
                gloss_en="I see the dog.",
                highlight="Io",
                prompt="I see the dog.",
                answer="Io vide le can.",
                note="Subject form: io.",
                parallels={
                    "es": "Yo veo el perro.",
                    "fr": "Je vois le chien.",
                    "it": "Io vedo il cane.",
                    "pt": "Eu vejo o c\u00e3o.",
                },
            ),
            Example(
                bridge_text="Ille me vide.",
                gloss_en="He sees me.",
                highlight="me",
                prompt="He sees me.",
                answer="Ille me vide.",
                note="Object form: me, not io.",
                parallels={
                    "es": "\u00c9l me ve.",
                    "fr": "Il me voit.",
                    "it": "Lui mi vede.",
                    "pt": "Ele me v\u00ea.",
                },
            ),
            Example(
                bridge_text="Nos les cognosce.",
                gloss_en="We know them.",
                highlight="les",
                prompt="We know them.",
                answer="Nos les cognosce.",
                note="nos serves as both subject and object; les is the plural object form.",
                parallels={
                    "es": "Nosotros los conocemos.",
                    "fr": "Nous les connaissons.",
                    "it": "Noi li conosciamo.",
                    "pt": "N\u00f3s os conhecemos.",
                },
            ),
            Example(
                bridge_text="Iste libro es le mie.",
                gloss_en="This book is mine.",
                highlight="le mie",
                prompt="This book is mine.",
                answer="Iste libro es le mie.",
                note=(
                    "The possessive pronoun mie, distinct from the adjective mi, and normally "
                    "with the article."
                ),
                parallels={
                    "es": "Este libro es el m\u00edo.",
                    "fr": "Ce livre est le mien.",
                    "it": "Questo libro \u00e8 il mio.",
                    "pt": "Este livro \u00e9 o meu.",
                },
            ),
            Example(
                bridge_text="Su soror ama su can.",
                gloss_en="His sister loves his dog.",
                highlight="su",
                prompt="His sister loves his dog.",
                answer="Su soror ama su can.",
                note=(
                    "su covers his, her, and its, and never agrees with what is owned. Spanish "
                    "su behaves the same way; French and Italian do not, and pick the form from "
                    "the thing owned."
                ),
                parallels={
                    "es": "Su hermana ama su perro.",
                    "fr": "Sa s\u0153ur aime son chien.",
                    "it": "Sua sorella ama il suo cane.",
                    "pt": "A irm\u00e3 dele ama o c\u00e3o dele.",
                },
            ),
        ],
    ),
    Pattern(
        slug="object-proclisis",
        name="Object pronouns before the verb",
        family=FAMILY,
        summary="Io le vide, not *Io vide le \u2014 the object pronoun comes first.",
        description=(
            "An unstressed object pronoun goes in front of a finite verb: 'Io le vide', "
            "literally 'I him see'. English puts it after, so this needs unlearning rather "
            "than learning, and it is one of the first things that makes a beginner's "
            "Spanish or French sound wrong. Every Romance language does the same. "
            "The exception is worth as much as the rule: after an infinitive, a participle, "
            "or an imperative the pronoun follows instead, giving 'Io vole vider le'. "
            "Spanish and Portuguese agree ('quiero verlo'), Italian agrees ('voglio "
            "vederlo'), and French does not, keeping the pronoun before the infinitive "
            "('je veux le voir')."
        ),
        source_note=f"{GRAMMAR}, \u00a7\u00a767\u201369 (p. 25)",
        difficulty_level=3,
        examples=[
            Example(
                bridge_text="Io le vide.",
                gloss_en="I see him.",
                highlight="le",
                prompt="I see him.",
                answer="Io le vide.",
                note="Object before the finite verb.",
                parallels={
                    "es": "Yo lo veo.",
                    "fr": "Je le vois.",
                    "it": "Io lo vedo.",
                    "pt": "Eu o vejo.",
                },
            ),
            Example(
                bridge_text="Illa nos ama.",
                gloss_en="She loves us.",
                highlight="nos",
                prompt="She loves us.",
                answer="Illa nos ama.",
                parallels={
                    "es": "Ella nos ama.",
                    "fr": "Elle nous aime.",
                    "it": "Lei ci ama.",
                    "pt": "Ela nos ama.",
                },
            ),
            Example(
                bridge_text="Io non lo sape.",
                gloss_en="I do not know it.",
                highlight="non lo",
                prompt="I do not know it.",
                answer="Io non lo sape.",
                note=(
                    "With both a negator and a pronoun, the pronoun sits closer to the verb: "
                    "non lo sape."
                ),
                parallels={
                    "es": "Yo no lo s\u00e9.",
                    "fr": "Je ne le sais pas.",
                    "it": "Io non lo so.",
                    "pt": "Eu n\u00e3o o sei.",
                },
            ),
            Example(
                bridge_text="Io vole vider le.",
                gloss_en="I want to see him.",
                highlight="vider le",
                prompt="I want to see him.",
                answer="Io vole vider le.",
                note=(
                    "After an infinitive the pronoun follows. French is the outlier and keeps "
                    "it in front: je veux le voir."
                ),
                parallels={
                    "es": "Quiero verlo.",
                    "fr": "Je veux le voir.",
                    "it": "Voglio vederlo.",
                    "pt": "Quero v\u00ea-lo.",
                },
            ),
            Example(
                bridge_text="Da me le libro.",
                gloss_en="Give me the book.",
                highlight="Da me",
                prompt="Give me the book.",
                answer="Da me le libro.",
                note="After an imperative the pronoun follows, as it does across Romance.",
                parallels={
                    "es": "Dame el libro.",
                    "fr": "Donne-moi le livre.",
                    "it": "Dammi il libro.",
                    "pt": "D\u00e1-me o livro.",
                },
            ),
            Example(
                bridge_text="Ille se lava.",
                gloss_en="He washes himself.",
                highlight="se",
                prompt="He washes himself.",
                answer="Ille se lava.",
                note=(
                    "Reflexive se follows the same placement rule. Romance uses reflexives far "
                    "more widely than English does, often where English would use a passive."
                ),
                parallels={
                    "es": "\u00c9l se lava.",
                    "fr": "Il se lave.",
                    "it": "Lui si lava.",
                    "pt": "Ele se lava.",
                },
            ),
        ],
    ),
    Pattern(
        slug="infinitive-classes",
        name="The three infinitive classes",
        family=FAMILY,
        summary="-ar, -er, -ir: the class predicts the target-language infinitive.",
        description=(
            "Interlingua verbs end in -ar, -er, or -ir, the same three classes Latin left to "
            "every Romance language. The class is worth knowing because it predicts the "
            "shape of the infinitive in the target: Italian adds a vowel (cantar to cantare), "
            "Spanish and Portuguese usually leave -ar and -ir alone, and French reshapes -ar "
            "to -er (cantar to chanter). It also predicts which conjugation the verb will "
            "take once you get to a language that conjugates."
        ),
        source_note=f"{GRAMMAR}, \u00a7\u00a780ff (pp. 29ff)",
        difficulty_level=2,
        examples=[
            Example(
                bridge_text="cantar",
                gloss_en="to sing",
                prompt="cantar (to sing) \u2014 which class?",
                answer="-ar",
                distractors=["-er", "-ir"],
                note="First class. Regular across all four targets.",
                parallels={"es": "cantar", "fr": "chanter", "it": "cantare", "pt": "cantar"},
            ),
            Example(
                bridge_text="vender",
                gloss_en="to sell",
                prompt="vender (to sell) \u2014 which class?",
                answer="-er",
                distractors=["-ar", "-ir"],
                note="Second class. French contracts to -re.",
                parallels={"es": "vender", "fr": "vendre", "it": "vendere", "pt": "vender"},
            ),
            Example(
                bridge_text="dormir",
                gloss_en="to sleep",
                prompt="dormir (to sleep) \u2014 which class?",
                answer="-ir",
                distractors=["-ar", "-er"],
                note="Third class. Unchanged in three of the four targets.",
                parallels={"es": "dormir", "fr": "dormir", "it": "dormire", "pt": "dormir"},
            ),
            Example(
                bridge_text="scriber",
                gloss_en="to write",
                prompt="scriber (to write) \u2014 which class?",
                answer="-er",
                distractors=["-ar", "-ir"],
                note=(
                    "Second class, and a reminder that the class predicts the ending, not the "
                    "stem: every target reshapes scrib- differently."
                ),
                parallels={"es": "escribir", "fr": "\u00e9crire", "it": "scrivere", "pt": "escrever"},
            ),
        ],
    ),
    Pattern(
        slug="invariant-verb",
        name="Where the scaffold stops: verb agreement",
        family=FAMILY,
        summary="Interlingua does not conjugate. Every target language does.",
        description=(
            "Interlingua uses one verb form for every person: io canta, tu canta, ille canta, "
            "nos canta. This is the largest single simplification in the language, and the "
            "one place where relying on Interlingua will actively mislead you, because all "
            "four target languages inflect the verb for person and number and none of them "
            "treat it as optional. The pattern is drilled the other way round from the "
            "others: the Interlingua sentence is the prompt, and the point is to notice how "
            "much the target adds. Use Interlingua for the vocabulary and the word order, "
            "and expect to learn conjugation from scratch."
        ),
        source_note=f"{GRAMMAR}, \u00a7\u00a780ff (pp. 29ff)",
        difficulty_level=1,
        examples=[
            Example(
                bridge_text="Io canta.",
                gloss_en="I sing.",
                highlight="canta",
                prompt="I sing.",
                answer="Io canta.",
                parallels={"es": "Yo canto.", "fr": "Je chante.", "it": "Io canto.", "pt": "Eu canto."},
            ),
            Example(
                bridge_text="Tu canta.",
                gloss_en="You sing.",
                highlight="canta",
                prompt="You sing.",
                answer="Tu canta.",
                note="Same verb form as io canta. No target language agrees.",
                parallels={"es": "T\u00fa cantas.", "fr": "Tu chantes.", "it": "Tu canti.", "pt": "Tu cantas."},
            ),
            Example(
                bridge_text="Nos canta.",
                gloss_en="We sing.",
                highlight="canta",
                prompt="We sing.",
                answer="Nos canta.",
                note="Still canta. Compare how far the four targets diverge here.",
                parallels={
                    "es": "Nosotros cantamos.",
                    "fr": "Nous chantons.",
                    "it": "Noi cantiamo.",
                    "pt": "N\u00f3s cantamos.",
                },
            ),
            Example(
                bridge_text="Illes cantava.",
                gloss_en="They sang.",
                highlight="cantava",
                prompt="They sang.",
                answer="Illes cantava.",
                note=(
                    "One past tense, -va, where Romance distinguishes preterite from imperfect. "
                    "Spanish cantaron and cantaban are both cantava in Interlingua."
                ),
                parallels={
                    "es": "Ellos cantaron.",
                    "fr": "Ils ont chant\u00e9.",
                    "it": "Loro cantarono.",
                    "pt": "Eles cantaram.",
                },
            ),
        ],
    ),
    Pattern(
        slug="word-building",
        name="Building words from affixes",
        family=FAMILY,
        summary="One root plus a productive affix: nation, national, nationalitate.",
        description=(
            "Interlingua is built to be extended by analogy. A root takes a productive affix "
            "and the result is a real word, so nation gives national, nationalitate, "
            "nationalismo, nationalista, and international, all without consulting a "
            "dictionary. The affixes are the ones Romance already shares, which is what makes "
            "this the highest-leverage pattern in the language: learning that -itate marks a "
            "quality gets you Spanish -idad, French -it\u00e9, Italian -it\u00e0, and Portuguese "
            "-idade in one step, and those endings are stable enough to guess through."
        ),
        source_note=f"{GRAMMAR}, \u00a7\u00a7135ff (pp. 56ff)",
        difficulty_level=2,
        examples=[
            Example(
                bridge_text="nation \u2192 nationalitate",
                gloss_en="nation \u2192 nationality",
                highlight="-itate",
                prompt="Which suffix turns an adjective into the quality it names?",
                answer="-itate",
                distractors=["-ista", "-eria", "-mente"],
                note="-itate names a quality. Compare Spanish -idad, French -it\u00e9.",
                parallels={
                    "es": "nacionalidad",
                    "fr": "nationalit\u00e9",
                    "it": "nazionalit\u00e0",
                    "pt": "nacionalidade",
                },
            ),
            Example(
                bridge_text="rapide \u2192 rapidemente",
                gloss_en="rapid \u2192 rapidly",
                highlight="-mente",
                prompt="Which suffix makes an adverb from an adjective?",
                answer="-mente",
                distractors=["-itate", "-abile", "-ero"],
                note=(
                    "-mente attaches to the full adjective. Three of the four targets use the "
                    "same suffix; French wore it down to -ment."
                ),
                parallels={
                    "es": "r\u00e1pidamente",
                    "fr": "rapidement",
                    "it": "rapidamente",
                    "pt": "rapidamente",
                },
            ),
            Example(
                bridge_text="amar \u2192 amabile",
                gloss_en="to love \u2192 lovable",
                highlight="-abile",
                prompt="Which suffix means 'able to be ...ed'?",
                answer="-abile",
                distractors=["-mente", "-ista", "-itate"],
                note="-abile from -ar verbs, -ibile from -er and -ir verbs.",
                parallels={"es": "amable", "fr": "aimable", "it": "amabile", "pt": "am\u00e1vel"},
            ),
            Example(
                bridge_text="lacte \u2192 lacteria",
                gloss_en="milk \u2192 dairy",
                highlight="-eria",
                prompt="Which suffix names the shop or premises dealing in something?",
                answer="-eria",
                distractors=["-ero", "-ismo", "-itate"],
                note="Paired with -ero for the person: lactero, a milkman.",
                parallels={
                    "es": "lecher\u00eda",
                    "fr": "laiterie",
                    "it": "latteria",
                    "pt": "leitaria",
                },
            ),
            Example(
                bridge_text="facer \u2192 disfacer",
                gloss_en="to do \u2192 to undo",
                highlight="dis-",
                prompt="Which prefix reverses an action?",
                answer="dis-",
                distractors=["re-", "in-", "pre-"],
                note="Surfaces as des- in Spanish and Portuguese, d\u00e9- in French.",
                parallels={"es": "deshacer", "fr": "d\u00e9faire", "it": "disfare", "pt": "desfazer"},
            ),
            Example(
                bridge_text="biologia \u2192 biologista",
                gloss_en="biology \u2192 biologist",
                highlight="-ista",
                prompt="Which suffix names the practitioner of an art or science?",
                answer="-ista",
                distractors=["-ero", "-itate", "-abile"],
                note=(
                    "Freely productive: any field name takes it, so saxophone gives "
                    "saxophonista."
                ),
                parallels={
                    "es": "bi\u00f3logo",
                    "fr": "biologiste",
                    "it": "biologo",
                    "pt": "bi\u00f3logo",
                },
            ),
        ],
    ),
]


def build() -> list[Pattern]:
    for pattern in PATTERNS:
        # Only the sentence patterns need generated distractors; the affix and class drills
        # carry hand-picked ones, which assign_sibling_distractors leaves alone because it
        # would overwrite them.
        if all(not example.distractors for example in pattern.examples):
            assign_sibling_distractors(pattern.examples)
    return PATTERNS
