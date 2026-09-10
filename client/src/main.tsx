import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider locale="en">
          <App />
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
