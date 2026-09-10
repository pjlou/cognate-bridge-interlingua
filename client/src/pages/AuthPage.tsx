import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { errorMessage } from '../lib/errorMessage';
import './AuthPage.css';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'register' && password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (caught) {
      setError(errorMessage(caught, t('auth.genericError')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__intro">
        <h1 className="auth__wordmark">
          {t('brand.cognate')} <span>{t('brand.bridge')}</span>
        </h1>
        <p className="auth__pitch">{t('auth.pitch')}</p>
        <ul className="auth__families">
          <li>
            <span className="tag tag--romance">{t('nav.romance')}</span>
            <strong>
              <a href="https://interlingua.com/" target="_blank" rel="noreferrer">
                Interlingua
              </a>
            </strong>
            <span>{t('auth.romanceTargets')}</span>
          </li>
        </ul>
        <p className="auth__note">{t('auth.uralicNote')}</p>
      </div>

      <div className="auth__panel card">
        <div className="auth__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => switchMode('login')}
          >
            {t('auth.signIn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => switchMode('register')}
          >
            {t('auth.createAccount')}
          </button>
        </div>

        <form className="auth__form stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {mode === 'register' && <small>{t('auth.passwordTooShort')}</small>}
          </div>

          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn--block btn--lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="auth__spin" />}
            {isSubmitting
              ? t('auth.submitting')
              : mode === 'login'
                ? t('auth.submitSignIn')
                : t('auth.submitRegister')}
          </button>
        </form>

        <p className="auth__credits">
          <Link to="/about">{t('nav.about')}</Link>
        </p>
      </div>
    </div>
  );
}
