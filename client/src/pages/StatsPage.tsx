import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import { aggregateGameStats, clearAllGameStats, loadGameStats } from '../lib/gameStats';
import { getVocabularyStats } from '../services/api';
import './StatsPage.css';

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export default function StatsPage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const { resetUserData } = useAuth();
  const { data, isLoading, error, reload } = useAsync(() => getVocabularyStats(bridge), [bridge]);
  const [gameAgg, setGameAgg] = useState(() => aggregateGameStats(loadGameStats(bridge)));
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    setGameAgg(aggregateGameStats(loadGameStats(bridge)));
  }, [bridge]);

  async function onResetAllData(): Promise<void> {
    const confirmed = window.confirm(
      'Reset all learning data? This clears study progress, grammar and rule-card progress, target languages, preferences, and matching-game stats on this device. Your account login is kept.',
    );
    if (!confirmed) return;

    setResetting(true);
    setResetMessage(null);
    setResetError(null);
    try {
      await resetUserData();
      clearAllGameStats();
      setGameAgg(aggregateGameStats(loadGameStats(bridge)));
      reload();
      setResetMessage('All learning data has been reset.');
    } catch (caught) {
      setResetError(errorMessage(caught, 'Could not reset your data.'));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1 className="page__title">Stats</h1>
        <p className="page__lede">
          How your vocabulary deck is doing in this bridge — due cards, retention, mature reviews,
          and matching-game performance.
        </p>
      </header>

      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading stats
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      {data && (
        <>
          <h2 className="stats-section__title">Study</h2>
          <dl className="stats-grid">
            <div className="stats-grid__item">
              <dt>Studied</dt>
              <dd>{data.studied}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Due new</dt>
              <dd>{data.due_new}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Due review</dt>
              <dd>{data.due_review}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Retention</dt>
              <dd>{pct(data.retention)}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Average ease</dt>
              <dd>{data.average_ease !== null ? data.average_ease.toFixed(2) : '—'}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Mature</dt>
              <dd>{data.mature}</dd>
            </div>
          </dl>

          <h2 className="stats-section__title">Matching games</h2>
          <dl className="stats-grid">
            <div className="stats-grid__item">
              <dt>Games played</dt>
              <dd>{gameAgg.games_played}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Mean accuracy</dt>
              <dd>{pct(gameAgg.mean_accuracy)}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Mean game time</dt>
              <dd>{formatMs(gameAgg.mean_total_ms)}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Words tracked</dt>
              <dd>{gameAgg.words_with_data}</dd>
            </div>
            <div className="stats-grid__item">
              <dt>Mean match time</dt>
              <dd>{formatMs(gameAgg.mean_avg_match_ms)}</dd>
            </div>
          </dl>
        </>
      )}

      <section className="stats-reset">
        <h2 className="stats-section__title">Danger zone</h2>
        <p className="stats-reset__lede">
          Permanently clear study progress, targets, preferences, and local game stats. Your login
          stays signed in.
        </p>
        <button
          type="button"
          className="btn btn--negative"
          disabled={resetting}
          onClick={() => void onResetAllData()}
        >
          {resetting ? (
            <>
              <Loader2 className="spinner-icon" size={16} /> Resetting…
            </>
          ) : (
            'Reset all user data'
          )}
        </button>
        {resetMessage && <p className="notice">{resetMessage}</p>}
        {resetError && <p className="notice notice--error">{resetError}</p>}
      </section>
    </main>
  );
}
