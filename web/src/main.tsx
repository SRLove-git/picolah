import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SessionProvider } from './lib/session';
import { CapyProvider } from './lib/capybara';
import './i18n';
import './styles.css';
import './tangmi.css';
import './picolah.css';
import './components/capybara.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <CapyProvider>
        <App />
      </CapyProvider>
    </SessionProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA caching is an enhancement; the app works without it.
    });
  });
}
