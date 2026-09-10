import { ArrowRight, BookOpen, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { getRuleCards } from '../services/api';
import './GrammarListPage.css';
import './RuleCardsPage.css';

const DIFFICULTY_WORDS = ['', 'easy', 'easy', 'moderate', 'hard', 'hard'];

function isDue(nextReviewAt: string | null): boolean {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() <= Date.now();
}

export default function RuleCardsPage() {
  const { data: cards, isLoading, error } = useAsync(() => getRuleCards(), []);

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Sound correspondence rules</h1>
        <p className="page__lede">
          Cross-bridge decoders: when you meet an unfamiliar cognate, try the substitution on the
          card and see whether a word you already know lights up. These are study objects with
          drills and spaced review — separate from the sound-law footnotes on vocabulary cards.
        </p>
      </header>

      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading rules
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      <ul className="pattern-list">
        {cards?.map((card) => {
          const due =
            !card.progress ||
            card.progress.review_count === 0 ||
            isDue(card.progress.next_review_at);

          return (
            <li key={card.id}>
              <Link to={`/rules/${card.slug}`} className="pattern card">
                <div className="pattern__body">
                  <p className="rule-card__tier">Tier {card.tier}</p>
                  <h2 className="pattern__name">{card.name}</h2>
                  <p className="pattern__summary">{card.teaching_frame}</p>
                  <p className="pattern__source">
                    <BookOpen size={12} aria-hidden="true" /> {card.source_note}
                  </p>
                </div>

                <div className="pattern__meta">
                  <span className="tag">{card.example_count} examples</span>
                  <span className="tag">{DIFFICULTY_WORDS[card.difficulty_level]}</span>
                  {due && <span className="tag tag--romance">due</span>}
                  {card.progress && card.progress.review_count > 0 && (
                    <span className="tag tag--germanic">
                      {card.progress.mastery_level}% mastered
                    </span>
                  )}
                  <ArrowRight size={16} className="pattern__arrow" aria-hidden="true" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {cards?.length === 0 && (
        <div className="empty-state">
          <h3>No rule cards yet</h3>
          <p>Build parsers/out/rule_cards.json and reseed to load them.</p>
        </div>
      )}
    </main>
  );
}
