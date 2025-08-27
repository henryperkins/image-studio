import { createRoot } from 'react-dom/client';
import App from './components/App';
import RootErrorBoundary from './components/RootErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </ToastProvider>
);
