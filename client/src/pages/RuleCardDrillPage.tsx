import { ArrowLeft, BookOpen, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import {
  getRuleCard,
  recordRuleCardReview,
  type RuleCardExample,
  type RuleCardForms,
} from '../services/api';
import './GrammarDrillPage.css';
import './RuleCardDrillPage.css';

const QUESTIONS_PER_SESSION = 8;
const PASS_RATIO = 0.8;

const FORM_ORDER = ['la', 'en', 'de', 'es', 'fr', 'it', 'pt'] as const;

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

function FormTriad({ forms }: { forms: RuleCardForms }) {
  const entries = FORM_ORDER.filter((code) => forms[code]).map((code) => [code, forms[code]!] as const);
  if (entries.length === 0) return null;

  return (
    <ul className="rule-forms">
      {entries.map(([code, text]) => (
        <li key={code}>
          <span className="rule-forms__code">{code}</span>
          <span className="rule-forms__text">{text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RuleCardDrillPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const {
    data: card,
    isLoading,
    error,
    reload,
  } = useAsync(() => getRuleCard(slug), [slug], 'Could not load this rule card.');

  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [session, setSession] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const examples = card?.examples ?? [];
  const drillable = examples.filter(
    (example): example is RuleCardExample & { prompt: string; answer: string } =>
      example.prompt !== null && example.answer !== null,
  );

  const questions = useMemo(() => {
    if (drillable.length <= QUESTIONS_PER_SESSION) return drillable;
    const offset = (session * QUESTIONS_PER_SESSION) % drillable.length;
    return [...drillable.slice(offset), ...drillable.slice(0, offset)].slice(
      0,
      QUESTIONS_PER_SESSION,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, session]);

  const question = questions[index];
  const finished = Boolean(question === undefined && questions.length > 0);

  async function finish(outcomes: boolean[]): Promise<void> {
    if (!card || saved) return;
    const passed = outcomes.filter(Boolean).length / outcomes.length >= PASS_RATIO;
    try {
      await recordRuleCardReview(card.id, passed);
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
          <Loader2 className="spinner-icon" size={20} /> Loading rule
        </div>
      </main>
    );
  }

  if (error || !card) {
    return (
      <main className="page page--narrow">
        <p className="notice notice--error">{error ?? 'Rule card not found'}</p>
      </main>
    );
  }

  const correct = results.filter(Boolean).length;

  return (
    <main className="page page--narrow">
      <Link to="/rules" className="drill__back">
        <ArrowLeft size={14} aria-hidden="true" /> All rules
      </Link>

      <header className="page__header">
        <h1 className="page__title">{card.name}</h1>
        <p className="drill__frame">{card.teaching_frame}</p>
        <p className="drill__description">{card.description}</p>
        {card.caveat && <p className="drill__caveat">{card.caveat}</p>}
        <p className="drill__source">
          <BookOpen size={12} aria-hidden="true" /> {card.source_note}
        </p>
      </header>

      {(card.mappings?.length ?? 0) > 0 && (
        <table className="rule-map">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Notation</th>
            </tr>
          </thead>
          <tbody>
            {card.mappings!.map((mapping) => (
              <tr key={mapping.id}>
                <td>{mapping.from_label}</td>
                <td>{mapping.to_label}</td>
                <td>
                  <code>{mapping.notation ?? '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {questions.length === 0 ? (
        <p className="notice notice--info">This card has no drillable examples.</p>
      ) : finished ? (
        <section className="drill card drill--done">
          <h2 className="drill__score">
            {correct} / {results.length}
          </h2>
          <p className="drill__verdict">
            {correct / results.length >= PASS_RATIO
              ? 'Counted as recalled. This rule moves to a longer interval.'
              : 'Counted as missed. This rule comes back sooner.'}
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
            <span>{correct} correct</span>
          </div>

          <p className="drill__prompt">{question!.prompt}</p>

          <ul className="drill__options">
            {shuffleFor(question!.id, [question!.answer, ...question!.distractors]).map(
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

          {locked && (
            <div className="drill__feedback">
              {question!.note && <p className="drill__note">{question!.note}</p>}
              {question!.false_friend && (
                <p className="drill__highlight">Watch the false friend on this triad.</p>
              )}
              <FormTriad forms={question!.forms} />
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
    </main>
  );
}
