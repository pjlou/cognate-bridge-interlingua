import { ArrowLeft, BookOpen, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WordOrderPrompt from '../components/WordOrderPrompt';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import { getGrammarPattern, recordGrammarReview, type GrammarExample } from '../services/api';
import './GrammarDrillPage.css';

/** Enough to be a real test of the pattern without turning one session into a slog. */
const QUESTIONS_PER_SESSION = 8;

/**
 * How much of a session has to be right for the pattern to count as recalled.
 *
 * The SRS unit is the pattern, not the individual sentence, so a session produces one
 * outcome from several answers and the threshold has to be stated somewhere. Four fifths
 * is strict enough that a pattern cannot be pushed out to a long interval while it is
 * still shaky, and loose enough that one slip does not reset it.
 */
const PASS_RATIO = 0.8;

/**
 * Deterministic shuffle, seeded by the example id.
 *
 * The options have to hold still. Shuffling with Math.random on each render would move
 * the answer under the pointer whenever React re-rendered mid-question.
 */
function shuffleFor(id: number, options: string[]): string[] {
  const result = [...options];
  let seed = id * 2654435761;
  for (let i = result.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function ParallelList({ example }: { example: GrammarExample }) {
  if (example.parallels.length === 0) return null;

  return (
    <ul className="parallels">
      {example.parallels.map((parallel) => (
        <li key={parallel.target_language.id}>
          <span className="parallels__code">{parallel.target_language.code}</span>
          <span className="parallels__text">{parallel.target_text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function GrammarDrillPage() {
  const { bridge = '', slug = '' } = useParams<{ bridge: string; slug: string }>();
  const {
    data: pattern,
    isLoading,
    error,
    reload,
  } = useAsync(
    () => getGrammarPattern(bridge, slug),
    [bridge, slug],
    'Could not load this grammar pattern.',
  );

  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [session, setSession] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const examples = pattern?.examples ?? [];
  const drillable = examples.filter((example) => example.answer !== null);
  const illustrative = examples.filter((example) => example.answer === null);

  // Resampled per session so a pattern with 37 examples is not always drilled on the same
  // eight. `session` is in the dependency list so "drill again" picks a new sample.
  const questions = useMemo(() => {
    if (drillable.length <= QUESTIONS_PER_SESSION) return drillable;
    const offset = (session * QUESTIONS_PER_SESSION) % drillable.length;
    return [...drillable.slice(offset), ...drillable.slice(0, offset)].slice(
      0,
      QUESTIONS_PER_SESSION,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, session]);

  const question = questions[index];
  const finished = Boolean(question === undefined && questions.length > 0);

  async function finish(outcomes: boolean[]): Promise<void> {
    if (!pattern || saved) return;
    const passed = outcomes.filter(Boolean).length / outcomes.length >= PASS_RATIO;
    try {
      await recordGrammarReview(pattern.id, passed);
      setSaved(true);
    } catch (caught) {
      setSaveError(errorMessage(caught, 'Could not record this session.'));
    }
  }

  function submit(correct: boolean): void {
    if (locked || !question) return;
    setLocked(true);
    const outcomes = [...results, correct];
    setResults(outcomes);
    if (outcomes.length === questions.length) void finish(outcomes);
  }

  function choose(option: string): void {
    if (locked || !question) return;
    setChosen(option);
    submit(option === question.answer);
  }

  function restart(): void {
    setSession((value) => value + 1);
    setIndex(0);
    setLocked(false);
    setChosen(null);
    setResults([]);
    setSaved(false);
    setSaveError(null);
    reload();
  }

  if (isLoading) {
    return (
      <main className="page page--narrow">
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading pattern
        </div>
      </main>
    );
  }

  if (error || !pattern) {
    return (
      <main className="page page--narrow">
        <p className="notice notice--error">{error ?? 'Pattern not found'}</p>
      </main>
    );
  }

  const correct = results.filter(Boolean).length;

  return (
    <main className="page page--narrow">
      <Link to={`/b/${bridge}/grammar`} className="drill__back">
        <ArrowLeft size={14} aria-hidden="true" /> All patterns
      </Link>

      <header className="page__header">
        <h1 className="page__title">{pattern.name}</h1>
        <p className="drill__description">{pattern.description}</p>
        <p className="drill__source">
          <BookOpen size={12} aria-hidden="true" /> {pattern.source_note}
        </p>
      </header>

      {questions.length === 0 ? (
        <p className="notice notice--info">This pattern has no drillable examples.</p>
      ) : finished ? (
        <section className="drill card drill--done">
          <h2 className="drill__score">
            {correct} / {results.length}
          </h2>
          <p className="drill__verdict">
            {correct / results.length >= PASS_RATIO
              ? 'Counted as recalled. This pattern moves to a longer interval.'
              : 'Counted as missed. This pattern comes back sooner.'}
          </p>
          {saveError && <p className="notice notice--error">{saveError}</p>}
          <button type="button" className="btn" onClick={restart}>
            <RotateCcw size={15} aria-hidden="true" /> Drill again
          </button>
        </section>
      ) : (
        <section className="drill card">
          <div className="drill__meter">
            <span>
              Question {index + 1} of {questions.length}
            </span>
            <span>
              {correct} correct
            </span>
          </div>

          <p className="drill__prompt">{question!.prompt}</p>

          {pattern.drill_kind === 'word_order' ? (
            <WordOrderPrompt
              key={question!.id}
              example={question!}
              disabled={locked}
              onConfirm={submit}
            />
          ) : (
            <ul className="drill__options">
              {shuffleFor(question!.id, [question!.answer!, ...question!.distractors]).map(
                (option) => {
                  const isAnswer = option === question!.answer;
                  const state =
                    !locked
                      ? ''
                      : isAnswer
                        ? 'is-correct'
                        : option === chosen
                          ? 'is-wrong'
                          : 'is-dimmed';

                  return (
                    <li key={option}>
                      <button
                        type="button"
                        className={`drill__option ${state}`}
                        onClick={() => choose(option)}
                        disabled={locked}
                      >
                        <span>{option}</span>
                        {locked && isAnswer && <Check size={15} aria-hidden="true" />}
                        {chosen === option && !isAnswer && <X size={15} aria-hidden="true" />}
                      </button>
                    </li>
                  );
                },
              )}
            </ul>
          )}

          {locked && (
            <div className="drill__feedback">
              {question!.note && <p className="drill__note">{question!.note}</p>}
              {question!.highlight && (
                <p className="drill__highlight">
                  The pattern turns on <strong>{question!.highlight}</strong>.
                </p>
              )}
              <ParallelList example={question!} />
              <button
                type="button"
                className="btn btn--block"
                onClick={() => {
                  setIndex(index + 1);
                  setLocked(false);
                  setChosen(null);
                }}
              >
                {index + 1 === questions.length ? 'Finish' : 'Next'}
              </button>
            </div>
          )}
        </section>
      )}

      {illustrative.length > 0 && (
        <section className="drill__counter">
          <h3 className="section-heading">Counter-examples</h3>
          <p className="drill__counter-lede">
            Shown but never drilled: these break the pattern, and offering one as a correct
            answer would teach the opposite of the rule.
          </p>
          {illustrative.map((example) => (
            <div key={example.id} className="drill__counter-item">
              <p className="drill__counter-text">
                <span aria-hidden="true">*</span>
                {example.bridge_text}
              </p>
              <p className="drill__counter-gloss">{example.gloss_en}</p>
              {example.note && <p className="drill__counter-note">{example.note}</p>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
