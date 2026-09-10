import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { useAuth } from './context/AuthContext';
import { useI18n } from './i18n/I18nContext';
import AboutPage from './pages/AboutPage';
import AuthPage from './pages/AuthPage';
import BrowsePage from './pages/BrowsePage';
import CardsPage from './pages/CardsPage';
import GamesPage from './pages/GamesPage';
import GrammarDrillPage from './pages/GrammarDrillPage';
import GrammarListPage from './pages/GrammarListPage';
import HomePage from './pages/HomePage';
import RuleCardDrillPage from './pages/RuleCardDrillPage';
import RuleCardsPage from './pages/RuleCardsPage';
import StatsPage from './pages/StatsPage';
import StudyPage from './pages/StudyPage';
import TargetsPage from './pages/TargetsPage';

export default function App() {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="loading-block">
        <Loader2 className="spinner-icon" size={22} /> {t('common.loading')}
      </div>
    );
  }

  // Signing in is required, but the About page is not gated: the GFDL and CC BY notices
  // have to be reachable by anyone who can reach the app.
  if (!user) {
    return (
      <Routes>
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/targets" element={<TargetsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/rules" element={<RuleCardsPage />} />
        <Route path="/rules/:slug" element={<RuleCardDrillPage />} />
      </Route>

      {/* Nested under :bridge so the shell can render bridge-scoped navigation. */}
      <Route path="/b/:bridge" element={<AppShell />}>
        <Route index element={<Navigate to="study" replace />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="words" element={<BrowsePage />} />
        <Route path="grammar" element={<GrammarListPage />} />
        <Route path="grammar/:slug" element={<GrammarDrillPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
