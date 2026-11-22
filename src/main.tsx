import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { notifyPwaUpdateAvailable, setPwaUpdateHandler } from './services/pwaUpdate';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyPwaUpdateAvailable(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForUpdates = () => {
      registration.update().catch(() => {
        // Ignora falhas de rede offline ao verificar atualizações
      });
    };
    window.setInterval(checkForUpdates, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });
  },
});

setPwaUpdateHandler(updateSW);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

