import { ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CorrespondencePanel from '../components/CorrespondencePanel';
import { useAsync } from '../hooks/useAsync';
import {
  loadGameStats,
  readShowGameStats,
  writeShowGameStats,
  type WordGameStats,
} from '../lib/gameStats';
import { browseVocabulary, type VocabularyItem } from '../services/api';
import './BrowsePage.css';

const PAGE_SIZE = 40;

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'transparent',
  2: 'widely shared',
  3: 'partly shared',
  4: 'bridge-only',
  5: 'bridge-only, long',
};

type BrowseSort = 'headword' | 'frequency';
type EnglishCognateFilter = 'all' | 'with' | 'without';

function formatMatchTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function WordRow({
  item,
  showRank,
  gameStats,
}: {
  item: VocabularyItem;
  showRank: boolean;
  gameStats: WordGameStats | null;
}) {
  const [open, setOpen] = useState(false);
  const languages = new Set(item.cognates.map((cognate) => cognate.target_language.code));

  return (
    <li className={`word ${open ? 'is-open' : ''}`}>
      <button type="button" className="word__summary" onClick={() => setOpen(!open)}>
        {showRank && (
          <span className="word__rank" title="Frequency rank (lower = more common)">
            {item.frequency_rank ?? '—'}
          </span>
        )}
        <span className="word__headword">{item.headword}</span>
        <span className="tag tag--pos">{item.part_of_speech}</span>
        <span className="word__gloss">{item.gloss_en}</span>
        {gameStats && (
          <span
            className="word__game-stats"
            title="Matching game: average successful match time · incorrect attempts"
          >
            {gameStats.match_count > 0 ? formatMatchTime(gameStats.avg_match_ms) : '—'}
            {' · '}
            {gameStats.incorrect} miss{gameStats.incorrect === 1 ? '' : 'es'}
          </span>
        )}
        <span className="word__coverage" title={DIFFICULTY_LABELS[item.difficulty_level]}>
          {languages.size > 0 ? `${languages.size} cognates` : 'no cognates'}
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div className="word__detail">
          {item.glosses_en.length > 1 && (
            <p className="word__synonyms">{item.glosses_en.join(', ')}</p>
          )}
          <CorrespondencePanel cognates={item.cognates} bare />
          <p className="word__source">{item.source_ref}</p>
        </div>
      )}
    </li>
  );
}

export default function BrowsePage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<BrowseSort>('headword');
  const [englishCognates, setEnglishCognates] = useState<EnglishCognateFilter>('all');
  const [showGameStats, setShowGameStats] = useState(readShowGameStats);

  const deferredSearch = useDeferredValue(search);
  const gameWords = useMemo(() => loadGameStats(bridge).words, [bridge, showGameStats]);

  const { data, isLoading, error } = useAsync(
    () =>
      browseVocabulary(bridge, {
        search: deferredSearch || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort,
        englishCognates,
      }),
    [bridge, deferredSearch, page, sort, englishCognates],
  );

  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);
  const showRank = sort === 'frequency';

  function onToggleGameStats(next: boolean): void {
    setShowGameStats(next);
    writeShowGameStats(next);
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Dictionary</h1>
        <p className="page__lede">
          Every headword with its English gloss and its cognates. Open a row to see the
          correspondences and, for generated forms, the rule behind them.
        </p>
      </header>

      <div className="browse__toolbar">
        <div className="browse__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Search headwords and glosses"
            aria-label="Search vocabulary"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
          {total > 0 && <span className="browse__count">{total.toLocaleString()} words</span>}
        </div>

        <div className="browse__filters">
          <label className="browse__filter">
            <span>Sort</span>
            <select
              aria-label="Sort dictionary"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as BrowseSort);
                setPage(0);
              }}
            >
              <option value="headword">A–Z</option>
              <option value="frequency">Frequency</option>
            </select>
          </label>
          <label className="browse__filter">
            <span>English cognate</span>
            <select
              aria-label="English cognate filter"
              value={englishCognates}
              onChange={(event) => {
                setEnglishCognates(event.target.value as EnglishCognateFilter);
                setPage(0);
              }}
            >
              <option value="all">All words</option>
              <option value="with">With English cognate</option>
              <option value="without">Without English cognate</option>
            </select>
          </label>
          <label className="browse__filter browse__filter--check">
            <input
              type="checkbox"
              checked={showGameStats}
              onChange={(event) => onToggleGameStats(event.target.checked)}
            />
            Show game stats
          </label>
        </div>
      </div>

      {error && <p className="notice notice--error">{error}</p>}

      {isLoading && !data ? (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading
        </div>
      ) : data?.items.length === 0 ? (
        <div className="empty-state">
          <h3>No matches</h3>
          <p>
            {deferredSearch
              ? `Nothing in this dictionary matches “${deferredSearch}”.`
              : 'Nothing in this dictionary matches the current filters.'}
          </p>
        </div>
      ) : (
        <ul
          className={`word-list card${showRank ? ' word-list--ranked' : ''}${showGameStats ? ' word-list--game' : ''}`}
        >
          {data?.items.map((item) => (
            <WordRow
              key={item.id}
              item={item}
              showRank={showRank}
              gameStats={showGameStats ? (gameWords[String(item.id)] ?? null) : null}
            />
          ))}
        </ul>
      )}

      {lastPage > 0 && (
        <nav className="browse__pager">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {lastPage + 1}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </main>
  );
}
