import { ArrowRight, BookOpen, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { getGrammarPatterns } from '../services/api';
import './GrammarListPage.css';

const DIFFICULTY_WORDS = ['', 'easy', 'easy', 'moderate', 'hard', 'hard'];

export default function GrammarListPage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const { data: patterns, isLoading, error } = useAsync(() => getGrammarPatterns(bridge), [bridge]);

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Grammar patterns</h1>
        <p className="page__lede">
          Grammar transfers between related languages more reliably than vocabulary does, so
          these drills work on structure rather than on words. Each pattern is drilled over the
          worked examples from its source, and where a real target language does the same thing
          the parallel sentence is shown beside it.
        </p>
      </header>

      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading patterns
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      <ul className="pattern-list">
        {patterns?.map((pattern) => (
          <li key={pattern.id}>
            <Link to={`/b/${bridge}/grammar/${pattern.slug}`} className="pattern card">
              <div className="pattern__body">
                <h2 className="pattern__name">{pattern.name}</h2>
                <p className="pattern__summary">{pattern.summary}</p>
                <p className="pattern__source">
                  <BookOpen size={12} aria-hidden="true" /> {pattern.source_note}
                </p>
              </div>

              <div className="pattern__meta">
                <span className="tag">{pattern.example_count} examples</span>
                <span className="tag">{DIFFICULTY_WORDS[pattern.difficulty_level]}</span>
                {pattern.progress && pattern.progress.review_count > 0 && (
                  <span className="tag tag--germanic">
                    {pattern.progress.mastery_level}% mastered
                  </span>
                )}
                <ArrowRight size={16} className="pattern__arrow" aria-hidden="true" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {patterns?.length === 0 && (
        <div className="empty-state">
          <h3>No patterns for this bridge</h3>
          <p>Run the grammar builders and reseed to load them.</p>
        </div>
      )}
    </main>
  );
}
