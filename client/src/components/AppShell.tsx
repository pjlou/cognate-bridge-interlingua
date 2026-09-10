import { Globe2, Info, LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n/I18nContext';
import {
  bridgeCodeForFamily,
  familyForBridgeCode,
  readStoredNavFamily,
  writeStoredNavFamily,
  type NavFamily,
} from '../lib/navFamily';
import { getBridges } from '../services/api';

const STUDY_TAB_KEYS = [
  { segment: 'study', labelKey: 'nav.study' as const },
  { segment: 'games', labelKey: 'nav.games' as const },
  { segment: 'cards', labelKey: 'nav.cards' as const },
  { segment: 'stats', labelKey: 'nav.stats' as const },
  { segment: 'words', labelKey: 'nav.words' as const },
  { segment: 'grammar', labelKey: 'nav.grammar' as const },
] as const;

function parseBridgePath(pathname: string): { bridge: string | null; section: string } {
  const match = pathname.match(/^\/b\/([^/]+)(?:\/([^/]+))?/);
  return {
    bridge: match?.[1] ?? null,
    section: match?.[2] ?? 'study',
  };
}

/**
 * The persistent frame: brand, family selector, per-bridge study tabs, account controls.
 *
 * Study tabs always show. The family buttons to their left pick which bridge those tabs
 * open (Germanic is currently unused scaffold, Romance → Interlingua, Uralic → Finnish
 * when that experimental bridge is available).
 */
export default function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { bridge: paramBridge } = useParams<{ bridge: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: bridges } = useAsync(getBridges);

  const availableCodes = useMemo(
    () => new Set((bridges ?? []).map((bridge) => bridge.code)),
    [bridges],
  );
  const uralicEnabled = availableCodes.has('fin');

  const pathInfo = parseBridgePath(location.pathname);
  const urlBridge = paramBridge ?? pathInfo.bridge;

  const [navFamily, setNavFamily] = useState<NavFamily>(() => readStoredNavFamily());

  useEffect(() => {
    if (!urlBridge) return;
    const fromUrl = familyForBridgeCode(urlBridge);
    if (!fromUrl) return;
    if (fromUrl === 'Uralic' && !uralicEnabled) return;
    setNavFamily((prev) => {
      if (prev === fromUrl) return prev;
      writeStoredNavFamily(fromUrl);
      return fromUrl;
    });
  }, [urlBridge, uralicEnabled]);

  useEffect(() => {
    if (navFamily === 'Uralic' && !uralicEnabled) {
      setNavFamily('Germanic');
      writeStoredNavFamily('Germanic');
    }
  }, [navFamily, uralicEnabled]);

  const activeBridgeCode = bridgeCodeForFamily(navFamily, availableCodes);

  function selectFamily(family: NavFamily): void {
    if (family === 'Uralic' && !uralicEnabled) return;
    setNavFamily(family);
    writeStoredNavFamily(family);
    const code = bridgeCodeForFamily(family, availableCodes);
    if (code && urlBridge) {
      navigate(`/b/${code}/${pathInfo.section}${location.search}`);
    }
  }

  function tabTo(segment: string): string {
    if (activeBridgeCode) return `/b/${activeBridgeCode}/${segment}`;
    return '/';
  }

  const familyButtons: { family: NavFamily; labelKey: 'nav.germanic' | 'nav.romance' | 'nav.uralic'; show: boolean }[] =
    [
      {
        family: 'Germanic',
        labelKey: 'nav.germanic',
        show: [...availableCodes].some((code) => familyForBridgeCode(code) === 'Germanic'),
      },
      { family: 'Romance', labelKey: 'nav.romance', show: true },
      { family: 'Uralic', labelKey: 'nav.uralic', show: uralicEnabled },
    ];

  return (
    <div className="app-shell">
      <header className="masthead">
        <Link to="/" className="masthead__brand">
          {t('brand.cognate')} <span>{t('brand.bridge')}</span>
        </Link>

        <nav className="masthead__nav" aria-label={t('nav.primary')}>
          <div className="masthead__families" role="group" aria-label={t('nav.family')}>
            {familyButtons
              .filter((entry) => entry.show)
              .map(({ family, labelKey }) => (
                <button
                  key={family}
                  type="button"
                  className={`masthead__family ${navFamily === family ? 'is-active' : ''}`}
                  aria-pressed={navFamily === family}
                  onClick={() => selectFamily(family)}
                >
                  {t(labelKey)}
                </button>
              ))}
          </div>

          <div className="masthead__divider" aria-hidden="true" />

          <div className="masthead__tabs">
            {STUDY_TAB_KEYS.map((tab) =>
              activeBridgeCode ? (
                <NavLink
                  key={tab.segment}
                  to={tabTo(tab.segment)}
                  className={({ isActive }) => `masthead__link ${isActive ? 'is-active' : ''}`}
                  end={tab.segment !== 'grammar'}
                >
                  {t(tab.labelKey)}
                </NavLink>
              ) : (
                <Link
                  key={tab.segment}
                  to="/"
                  className="masthead__link masthead__link--muted"
                  title={t('nav.chooseRomance')}
                >
                  {t(tab.labelKey)}
                </Link>
              ),
            )}
          </div>

          <NavLink to="/rules" className="masthead__link">
            {t('nav.rules')}
          </NavLink>
          <NavLink to="/targets" className="masthead__link">
            <Globe2 size={15} aria-hidden="true" />
            {t('nav.targets')}
          </NavLink>
          <NavLink to="/about" className="masthead__link" title={t('nav.about')}>
            <Info size={15} aria-hidden="true" />
          </NavLink>
          {user && (
            <button type="button" className="masthead__link" onClick={logout} title={t('nav.signOut')}>
              <LogOut size={15} aria-hidden="true" />
            </button>
          )}
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
