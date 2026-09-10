import { useEffect, useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import {
  deleteDeck,
  downloadDeckBackup,
  downloadDeckExport,
  downloadUntranslatedWords,
  getDeck,
} from '../services/api';
import './DeckDetailPage.css';

const POLL_MS = 2500;

export default function DeckDetailPage() {
  const { id } = useParams<{ id: string }>();
  const deckId = Number(id);
  const navigate = useNavigate();
  const { data: deck, isLoading, error, reload } = useAsync(() => getDeck(deckId), [deckId]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (deck?.status !== 'translating') return;
    const interval = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(interval);
  }, [deck?.status, reload]);

  const handleDelete = async () => {
    if (!deck || isDeleting) return;
    const confirmed = window.confirm(
      `Delete "${deck.name}"? This removes the deck, its cards, and all study progress on it. This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDeck(deck.id);
      navigate('/decks/import');
    } catch (caught) {
      setDeleteError(errorMessage(caught, 'Could not delete this deck.'));
      setIsDeleting(false);
    }
  };

  if (isLoading && !deck) {
    return (
      <main className="page">
        <p className="loading-block">
          <Loader2 className="spinner-icon" size={22} /> Loading deck…
        </p>
      </main>
    );
  }

  if (error || !deck) {
    return (
      <main className="page">
        <p className="notice notice--error" role="alert">
          {error ?? 'Deck not found.'}
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">{deck.name}</h1>
        <p className="page__lede">
          {deck.card_count} card{deck.card_count === 1 ? '' : 's'}
          {deck.bridge_language_code ? ` · bridge: ${deck.bridge_language_code}` : ''}
          {deck.target_language_name ? ` · target: ${deck.target_language_name}` : ''}
        </p>
      </header>

      <div className="deck-detail stack">
        <p className="deck-detail__status">
          Status: <strong>{deck.status}</strong>
        </p>

        {deck.status === 'mapping' && deck.bridge_language_code && deck.target_language_code && (
          <>
            <button type="button" className="btn" disabled>
              Translate
            </button>
            <p className="notice notice--info">
              Translation unavailable — no Interlingua translation engine is included in this
              build. See the <Link to="/translate">Translate page</Link> for options.
            </p>
          </>
        )}

        {deck.status === 'mapping' && (!deck.bridge_language_code || !deck.target_language_code) && (
          <p className="notice notice--info">
            Field mapping isn't finished for this deck yet, so it can't be translated.
          </p>
        )}

        {deck.status === 'translating' && (
          <p className="notice notice--info">
            <Loader2 size={15} className="deck-detail__spin" /> Translating… this page will
            update automatically.
          </p>
        )}

        {deck.status === 'failed' && (
          <p className="notice notice--error">
            Translation unavailable — no Interlingua translation engine is included in this
            build. See the <Link to="/translate">Translate page</Link> for options. Retrying
            will not help; this deck was not translated.
          </p>
        )}

        {deck.status === 'ready' && (
          <>
            <p className="notice notice--info">
              {deck.untranslated_count} word{deck.untranslated_count === 1 ? '' : 's'} could not
              be translated automatically.
            </p>
            <div className="deck-detail__actions">
              <button
                type="button"
                className="btn"
                onClick={() => void downloadDeckExport(deck.id, deck.name)}
              >
                <Download size={15} /> Download for Anki
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void downloadUntranslatedWords(deck.id, deck.name)}
              >
                <Download size={15} /> Download untranslated words
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void downloadDeckBackup(deck.id, deck.name)}
              >
                <Download size={15} /> Download full backup (with study progress)
              </button>
              {deck.bridge_language_code && (
                <Link
                  className="btn"
                  to={`/b/${deck.bridge_language_code}/study?deck=${deck.id}`}
                >
                  Study this deck
                </Link>
              )}
            </div>
          </>
        )}

        <div className="deck-detail__danger">
          <button
            type="button"
            className="btn btn--negative"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 size={15} className="deck-detail__spin" />}
            <Trash2 size={15} /> Delete deck
          </button>
          {deleteError && (
            <p className="notice notice--error" role="alert">
              {deleteError}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
