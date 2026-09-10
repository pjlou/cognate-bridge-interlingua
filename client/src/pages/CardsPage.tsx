import { Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import {
  getMyVocabulary,
  setVocabularyRemoved,
  type VocabularyCardState,
  type VocabularyItem,
} from '../services/api';
import './CardsPage.css';

type StateFilter = 'all' | VocabularyCardState | 'due' | 'removed';

function cardKey(item: VocabularyItem): string {
  return `${item.id}:${item.tier ?? 1}`;
}

function isDue(item: VocabularyItem): boolean {
  if (item.progress?.removed) return false;
  const at = item.progress?.next_review_at;
  if (!at) return item.progress?.card_state === 'new';
  return new Date(at).getTime() <= Date.now();
}

function formatDue(at: string | null | undefined): string {
  if (!at) return '—';
  const date = new Date(at);
  if (date.getTime() <= Date.now()) return 'due';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatInterval(days: number | undefined): string {
  if (days === undefined || days === null) return '—';
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return minutes <= 1 ? '1m' : `${minutes}m`;
  }
  if (days < 30) return `${Math.round(days * 10) / 10}d`;
  return `${Math.round(days / 30)}mo`;
}

export default function CardsPage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { data, isLoading, error, setData } = useAsync(() => getMyVocabulary(bridge), [bridge]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      const removed = item.progress?.removed === true;
      const state = item.progress?.card_state ?? 'new';

      if (stateFilter === 'removed') {
        if (!removed) return false;
      } else if (removed) {
        return false;
      } else if (stateFilter === 'due') {
        if (!isDue(item)) return false;
      } else if (stateFilter !== 'all' && state !== stateFilter) {
        return false;
      }

      if (!needle) return true;
      return (
        item.headword.toLowerCase().includes(needle) ||
        item.gloss_en.toLowerCase().includes(needle) ||
        item.glosses_en.some((g) => g.toLowerCase().includes(needle))
      );
    });
  }, [data, search, stateFilter]);

  const showingRemoved = stateFilter === 'removed';

  function toggleSelected(key: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible(): void {
    setSelected((current) => {
      const visibleKeys = filtered.map(cardKey);
      const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => current.has(key));
      if (allSelected) return new Set();
      return new Set(visibleKeys);
    });
  }

  async function restoreSelected(): Promise<void> {
    if (!data || selected.size === 0 || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const targets = data.filter(
        (item) => selected.has(cardKey(item)) && item.progress?.removed === true,
      );
      await Promise.all(
        targets.map((item) => setVocabularyRemoved(item.id, item.tier === 2 ? 2 : 1, false)),
      );
      setData(
        data.map((item) => {
          if (!selected.has(cardKey(item)) || !item.progress?.removed) return item;
          return {
            ...item,
            progress: item.progress ? { ...item.progress, removed: false } : item.progress,
          };
        }),
      );
      setSelected(new Set());
    } catch (caught) {
      setRestoreError(errorMessage(caught, 'Could not restore the selected cards.'));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Your cards</h1>
        <p className="page__lede">
          The vocabulary you have started studying in this bridge — state, due date, interval, and
          ease. The full lexicon stays under Words.
        </p>
      </header>

      <div className="cards__toolbar">
        <div className="cards__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search headword or gloss"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search cards"
          />
        </div>
        <label className="cards__filter">
          <span>State</span>
          <select
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value as StateFilter);
              setSelected(new Set());
              setRestoreError(null);
            }}
            aria-label="Filter by state"
          >
            <option value="all">All</option>
            <option value="due">Due</option>
            <option value="new">New</option>
            <option value="learning">Learning</option>
            <option value="review">Review</option>
            <option value="relearning">Relearning</option>
            <option value="removed">Removed</option>
          </select>
        </label>
        <span className="cards__count">{filtered.length} cards</span>
        {showingRemoved && (
          <button
            type="button"
            className="btn"
            disabled={selected.size === 0 || restoring}
            onClick={() => void restoreSelected()}
          >
            {restoring ? 'Re-adding…' : `Re-add selected (${selected.size})`}
          </button>
        )}
      </div>

      {restoreError && <p className="notice notice--error">{restoreError}</p>}

      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading cards
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <h3>{showingRemoved ? 'No removed cards' : 'No cards yet'}</h3>
          <p>
            {showingRemoved
              ? 'Cards you remove during study will show up here so you can put them back.'
              : 'Study a few words and they will show up here with their SM-2 schedule.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="cards-table-wrap">
          <table className="cards-table">
            <thead>
              <tr>
                {showingRemoved && (
                  <th className="cards-table__check">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 && filtered.every((item) => selected.has(cardKey(item)))
                      }
                      onChange={toggleAllVisible}
                      aria-label="Select all visible removed cards"
                    />
                  </th>
                )}
                <th>Headword</th>
                <th>Gloss</th>
                <th>State</th>
                <th>Due</th>
                <th>Interval</th>
                <th>Ease</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const progress = item.progress;
                const key = cardKey(item);
                return (
                  <tr key={key}>
                    {showingRemoved && (
                      <td className="cards-table__check">
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggleSelected(key)}
                          aria-label={`Select ${item.headword}`}
                        />
                      </td>
                    )}
                    <td className="cards-table__headword">{item.headword}</td>
                    <td>{item.gloss_en}</td>
                    <td>
                      <span className="tag">
                        {progress?.removed ? 'removed' : (progress?.card_state ?? 'new')}
                      </span>
                      {item.tier === 2 && <span className="tag">tier 2</span>}
                    </td>
                    <td>{formatDue(progress?.next_review_at)}</td>
                    <td>{formatInterval(progress?.interval_days)}</td>
                    <td>
                      {progress?.ease_factor !== undefined
                        ? progress.ease_factor.toFixed(2)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
