import { createRoot } from 'react-dom/client';
import App from './components/App';
import RootErrorBoundary from './components/RootErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';
import './styles/motion.css';
import { registerSW } from 'virtual:pwa-register';
type ImportMetaEnvSafe = { PROD?: boolean };
const ENV: ImportMetaEnvSafe = (import.meta as unknown as { env?: ImportMetaEnvSafe }).env || {};

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </ToastProvider>
);

// Register service worker for offline capability and asset caching
if (ENV.PROD) {
  try {
    registerSW({ immediate: true, onRegistered: () => console.warn('PWA registered') });
  } catch (e) {
    console.warn('SW registration failed or unsupported:', e);
  }
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}
