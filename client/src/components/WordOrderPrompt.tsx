import { useEffect, useMemo, useState } from 'react';
import {
  displayToken,
  formatAssembled,
  sentencesMatch,
  tokenizeSentence,
} from '../lib/sentenceOrder';
import type { GrammarExample } from '../services/api';

/**
 * Deterministic shuffle, seeded by the example id.
 *
 * The chips have to hold still. Shuffling with Math.random on each render would move
 * words under the pointer whenever React re-rendered mid-question.
 */
function shuffleFor<T>(id: number, items: T[]): T[] {
  const result = [...items];
  let seed = id * 2654435761;
  for (let i = result.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

interface Chip {
  id: string;
  token: string;
}

interface Props {
  example: GrammarExample;
  disabled: boolean;
  onConfirm: (correct: boolean) => void;
}

export default function WordOrderPrompt({ example, disabled, onConfirm }: Props) {
  const { tokens, trailingPunct } = useMemo(
    () => tokenizeSentence(example.answer ?? example.bridge_text),
    [example.answer, example.bridge_text],
  );

  const initialBank = useMemo<Chip[]>(() => {
    const shuffled = shuffleFor(
      example.id,
      tokens.map((token, index) => ({ id: `${example.id}-${index}-${token}`, token })),
    );
    return shuffled;
  }, [example.id, tokens]);

  const [bank, setBank] = useState<Chip[]>(initialBank);
  const [assembled, setAssembled] = useState<Chip[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [correct, setCorrect] = useState(false);

  useEffect(() => {
    setBank(initialBank);
    setAssembled([]);
    setConfirmed(false);
    setCorrect(false);
  }, [initialBank]);

  function pick(chip: Chip): void {
    if (disabled || confirmed) return;
    setBank((current) => current.filter((item) => item.id !== chip.id));
    setAssembled((current) => [...current, chip]);
  }

  function unpick(chip: Chip): void {
    if (disabled || confirmed) return;
    setAssembled((current) => current.filter((item) => item.id !== chip.id));
    setBank((current) => [...current, chip]);
  }

  function confirm(): void {
    if (confirmed || assembled.length !== tokens.length) return;
    const ok = sentencesMatch(
      assembled.map((chip) => chip.token),
      tokens,
    );
    setCorrect(ok);
    setConfirmed(true);
    onConfirm(ok);
  }

  const ready = assembled.length === tokens.length && !confirmed;

  return (
    <div className="word-order">
      <div className="word-order__answer" aria-label="Your sentence">
        {assembled.length === 0 ? (
          <p className="word-order__placeholder">Tap words in order to build the sentence.</p>
        ) : (
          <ul className="word-order__chips">
            {assembled.map((chip, index) => (
              <li key={chip.id}>
                <button
                  type="button"
                  className="word-order__chip is-placed"
                  onClick={() => unpick(chip)}
                  disabled={disabled || confirmed}
                >
                  {displayToken(chip.token, index === 0)}
                </button>
              </li>
            ))}
            {confirmed && trailingPunct ? (
              <li className="word-order__punct" aria-hidden="true">
                {trailingPunct}
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <ul className="word-order__chips word-order__bank" aria-label="Word bank">
        {bank.map((chip) => (
          <li key={chip.id}>
            <button
              type="button"
              className="word-order__chip"
              onClick={() => pick(chip)}
              disabled={disabled || confirmed}
            >
              {chip.token}
            </button>
          </li>
        ))}
      </ul>

      {!confirmed ? (
        <button type="button" className="btn btn--block" onClick={confirm} disabled={!ready}>
          Confirm
        </button>
      ) : (
        <p className={`word-order__verdict ${correct ? 'is-correct' : 'is-wrong'}`}>
          {correct
            ? 'Correct.'
            : `The sentence is ${formatAssembled(tokens, trailingPunct)}`}
        </p>
      )}
    </div>
  );
}
