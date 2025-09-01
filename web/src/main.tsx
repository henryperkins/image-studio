import { createRoot } from 'react-dom/client';
import App from './components/App';
import RootErrorBoundary from './components/RootErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';
import './styles/motion.css';
import { registerSW } from 'virtual:pwa-register';

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </ToastProvider>
);

// Register service worker for offline capability and asset caching
try {
  registerSW({ immediate: true, onRegistered: () => console.log('PWA registered') });
} catch (e) {
  console.warn('SW registration failed or unsupported:', e);
}
