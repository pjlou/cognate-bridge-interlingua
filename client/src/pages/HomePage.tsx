import { ArrowRight, BookMarked, Layers, Loader2, Puzzle } from 'lucide-react';
import { Link } from 'react-router-dom';
import TargetLanguagePicker from '../components/TargetLanguagePicker';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n/I18nContext';
import { getBridges, type BridgeLanguage } from '../services/api';
import './HomePage.css';

function BridgeDescription({ bridge }: { bridge: BridgeLanguage }) {
  if (!bridge.description) return null;
  return <p className="bridge__description">{bridge.description}</p>;
}

function BridgeCard({ bridge }: { bridge: BridgeLanguage }) {
  const { t } = useI18n();
  const family = bridge.family.toLowerCase();

  return (
    <article className="bridge card">
      <header className="bridge__header">
        <h2 className="bridge__name">{bridge.name}</h2>
        <div className="bridge__tags">
          <span className={`tag tag--${family}`}>
            {bridge.family === 'Germanic'
              ? t('nav.germanic')
              : bridge.family === 'Romance'
                ? t('nav.romance')
                : bridge.family === 'Uralic'
                  ? t('nav.uralic')
                  : bridge.family}
          </span>
        </div>
      </header>

      <BridgeDescription bridge={bridge} />

      {bridge.code === 'ia' && <p className="bridge__hint">{t('home.iaHint')}</p>}

      <dl className="bridge__stats">
        <div>
          <dt>{t('home.words')}</dt>
          <dd>{bridge.vocabulary_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t('home.grammarPatterns')}</dt>
          <dd>{bridge.grammar_pattern_count}</dd>
        </div>
        <div>
          <dt>{t('home.opensOnto')}</dt>
          <dd>{bridge.target_languages.map((target) => target.name).join(', ')}</dd>
        </div>
      </dl>

      <div className="bridge__actions">
        <Link to={`/b/${bridge.code}/study`} className="btn">
          <Layers size={15} aria-hidden="true" /> {t('home.studyWords')}
        </Link>
        <Link to={`/b/${bridge.code}/games`} className="btn btn--ghost">
          <Puzzle size={15} aria-hidden="true" /> {t('home.match')}
        </Link>
        <Link to={`/b/${bridge.code}/grammar`} className="btn btn--ghost">
          <BookMarked size={15} aria-hidden="true" /> {t('home.grammar')}
        </Link>
        <Link to={`/b/${bridge.code}/words`} className="bridge__browse">
          {t('home.browseAll')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="bridge__targets">
        <TargetLanguagePicker family={bridge.family} embedded />
      </div>
    </article>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const { data: bridges, isLoading, error } = useAsync(getBridges);

  return (
    <main className="page">
      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> {t('home.loading')}
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      <div className="bridge-grid">
        {bridges?.map((bridge) => (
          <BridgeCard key={bridge.id} bridge={bridge} />
        ))}
      </div>

      {bridges?.length === 0 && (
        <div className="empty-state">
          <h3>{t('home.emptyTitle')}</h3>
          <p>{t('home.emptyBody')}</p>
        </div>
      )}
    </main>
  );
}
