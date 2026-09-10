import { ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { apiUrl, getAttribution, type AttributionSource } from '../services/api';
import './AboutPage.css';

/**
 * Sources and credits.
 *
 * This page is a licence obligation, not a courtesy. IEDICT, the Interlingua dictionary
 * this project is built on, is CC BY 3.0 and requires attribution; several other sources
 * carry their own attribution or research-use terms. The notices come from the API rather
 * than being written into this component, so the running app and `docs/SOURCES.md` cannot
 * drift apart.
 *
 * It is also the one page reachable without signing in, since a notice nobody can read
 * is not a notice.
 */

function SourceCard({ source }: { source: AttributionSource }) {
  return (
    <article className="source card">
      <header className="source__header">
        <h3 className="source__title">{source.title}</h3>
        <p className="source__byline">
          {source.author} &middot; {source.year}
        </p>
      </header>

      <p className="source__licence">
        {source.licence_url ? (
          <a href={source.licence_url} target="_blank" rel="noreferrer noopener">
            {source.licence} <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : (
          source.licence
        )}
        {source.licence_text_path && (
          <>
            <span className="source__dot" aria-hidden="true">
              &middot;
            </span>
            {/* Our own copy, which is what the GFDL actually asks us to include. */}
            <a href={apiUrl(source.licence_text_path)} target="_blank" rel="noreferrer noopener">
              full text
            </a>
          </>
        )}
        {source.source_url && (
          <>
            <span className="source__dot" aria-hidden="true">
              &middot;
            </span>
            <a href={source.source_url} target="_blank" rel="noreferrer noopener">
              source <ExternalLink size={11} aria-hidden="true" />
            </a>
          </>
        )}
      </p>

      <p className="source__usage">{source.usage}</p>

      {source.notice && <blockquote className="source__notice">{source.notice}</blockquote>}
    </article>
  );
}

export default function AboutPage() {
  const { data, isLoading, error } = useAsync(getAttribution);

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1 className="page__title">Sources and credits</h1>
        <p className="page__lede">
          Cognate Bridge contains almost no original language data. The Interlingua vocabulary
          is Paul Denisowski&rsquo;s; what this project adds is the correspondence layer, the
          drills, and the software around them. Everything below states which source supplied
          what, on what terms.
        </p>
      </header>

      {isLoading && (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Loading
        </div>
      )}
      {error && <p className="notice notice--error">{error}</p>}

      {data && (
        <>
          <section className="about__modifications">
            <h2 className="section-heading">Statement of modifications</h2>
            <p>{data.modification_notice}</p>
          </section>

          <h2 className="section-heading about__sources-heading">Sources</h2>
          <div className="source-list">
            {data.sources.map((source) => (
              <SourceCard key={source.title} source={source} />
            ))}
          </div>
        </>
      )}

      <p className="about__home">
        <Link to="/">Back to the bridges</Link>
      </p>
    </main>
  );
}
