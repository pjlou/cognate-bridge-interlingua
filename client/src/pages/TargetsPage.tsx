import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import TargetLanguagePicker from '../components/TargetLanguagePicker';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n/I18nContext';
import {
  getTargetCoverage,
  type BridgeCoverage,
  type CoverageBand,
  type TargetCoverage,
  type TargetCoverageReport,
} from '../services/api';
import './TargetsPage.css';

function BandRow({ band }: { band: CoverageBand }) {
  return (
    <div className="coverage__band">
      <div className="coverage__band-label">
        <span>{band.label}</span>
        <span className="coverage__band-count">
          {band.covered} / {band.total}
        </span>
      </div>
      <div
        className="coverage__meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={band.pct}
        aria-label={`${band.label}: ${band.pct}% covered`}
      >
        <div className="coverage__meter-fill" style={{ width: `${Math.min(100, band.pct)}%` }} />
      </div>
      <span className="coverage__pct">{band.pct}%</span>
    </div>
  );
}

function BridgeBlock({ bridge }: { bridge: BridgeCoverage }) {
  return (
    <section className="coverage__bridge">
      <h4 className="coverage__bridge-title">{bridge.name}</h4>
      <div className="coverage__bands">
        {bridge.bands.map((band) => (
          <BandRow key={`${band.kind}-${band.label}`} band={band} />
        ))}
      </div>
    </section>
  );
}

function TargetBlock({ target }: { target: TargetCoverage }) {
  return (
    <section className="coverage__target">
      <h3 className="coverage__target-title">{target.name}</h3>
      {!target.available ? (
        <p className="coverage__unavailable">
          No spoken frequency list is available for {target.name} yet, so coverage cannot be
          scored.
        </p>
      ) : (
        target.bridges.map((bridge) => <BridgeBlock key={bridge.code} bridge={bridge} />)
      )}
    </section>
  );
}

function CoverageSection({
  report,
  isLoading,
  error,
  signedIn,
  authPending,
}: {
  report: TargetCoverageReport | null;
  isLoading: boolean;
  error: string | null;
  signedIn: boolean;
  authPending: boolean;
}) {
  return (
    <section className="coverage" aria-labelledby="coverage-heading">
      <h2 id="coverage-heading" className="coverage__heading">
        Bridge coverage
      </h2>
      <p className="coverage__lede">
        How much of each selected target’s high-frequency vocabulary is already reachable as a
        cognate from Interlingua, or from the experimental Finnish module where enabled.
        Function words are scored separately;
        content lemmas follow in bands of 500 up to about {report?.horizon ?? 3200} lemmas.
        Ranks prefer spoken/subtitle frequency lists
        {report?.frequency_source ? ` (${report.frequency_source})` : ''}.
      </p>

      {authPending || isLoading ? (
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={18} /> Measuring coverage
        </div>
      ) : !signedIn ? (
        <p className="coverage__hint">
          <Link to="/auth">Sign in</Link> and pick target languages to see coverage for your
          selection.
        </p>
      ) : error ? (
        <p className="notice notice--error">{error}</p>
      ) : !report || report.targets.length === 0 ? (
        <p className="coverage__hint">
          Select one or more target languages above to see how far each bridge covers them.
        </p>
      ) : (
        <div className="coverage__targets">
          {report.targets.map((target) => (
            <TargetBlock key={target.code} target={target} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function TargetsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const [coverageNonce, setCoverageNonce] = useState(0);
  const coverage = useAsync(
    () => (user ? getTargetCoverage() : Promise.resolve(null)),
    [user?.id, coverageNonce],
    'Could not load target coverage.',
  );

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1 className="page__title">{t('targets.title')}</h1>
        <p className="page__lede">{t('targets.lede')}</p>
      </header>

      <TargetLanguagePicker onTargetsSaved={() => setCoverageNonce((n) => n + 1)} />
      <CoverageSection
        report={coverage.data}
        isLoading={authLoading || (Boolean(user) && coverage.isLoading)}
        error={user ? coverage.error : null}
        signedIn={Boolean(user)}
        authPending={authLoading}
      />
    </main>
  );
}
