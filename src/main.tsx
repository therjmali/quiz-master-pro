import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/syne/latin-400.css';
import '@fontsource/syne/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './fonts.css';
import './index.css';
import './liquid-glass.css';
import { initPlatform } from './platform/runtime';
import { applyPerfMode, watchFrameRate } from './platform/perfMode';
import { installDiagnostics, recordError } from './platform/diagnostics';
import { initBackButton } from './platform/backButton';
import { initNativeInsets } from './platform/insets';
import App from "./App";
import { ErrorBoundary } from 'react-error-boundary';
import { HammerIcon } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function reloadApp() {
  if (window._ziteOnReload) {
    window._ziteOnReload();
  } else {
    location.reload();
  }
}

function RuntimeErrorFallback(props: { error: Error }) {
  const allowAiFix = window.__ziteAllowAiFix === true;
  // Keep the reason on the device: this is the only place a user-facing crash can be recorded.
  // In an effect, not during render, so a re-render never duplicates the entry.
  useEffect(() => {
    recordError({ kind: 'react', message: `${props.error?.name ?? 'Error'}: ${props.error?.message ?? 'unknown'}` });
  }, [props.error]);

  return (
    <div className="fixed inset-0 grid place-items-center">
      <div className="relative w-full max-w-xl rounded border-t-4 border-t-red-500 bg-white p-4 shadow-lg">
        <h3 className="mb-2 flex items-center gap-2 font-medium">
          Issue rendering app
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          {allowAiFix
            ? 'Try asking Zite to fix the issue or find a workaround.'
            : 'Something went wrong while loading this app. You can try reloading the page.'}
        </p>

        <pre className="overflow-auto rounded border-l-4 border-red-500 bg-red-50 p-4 font-mono text-sm text-red-900">
          {props.error.message}
        </pre>
        <div className="mt-4 flex gap-2">
          {allowAiFix ? (
            <button
              type="button"
              className="flex items-center gap-2 rounded border border-red-100 bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-100"
              onClick={() => window._ziteOnFixError?.(props.error)}
            >
              <HammerIcon className="h-4 w-4" />
              Fix it for me
            </button>
          ) : null}
          <button
            type="button"
            onClick={reloadApp}
            className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

import { setZoom, getZoom, ZOOM_KEY } from './platform/zoom';

// Default out-of-the-box zoom to 90% (10% zoom out) for optimal mobile layout visibility
if (typeof localStorage !== 'undefined' && localStorage.getItem(ZOOM_KEY) === null) {
  try {
    setZoom(90);
  } catch {}
}

// Decide the glass/motion budget before the first paint, so a low-end phone never pays for it at all.
applyPerfMode();
// Record failures from the very first frame (the crash a user reports is often the one at boot).
installDiagnostics();
// After the first screen is up, confirm the guess with real frames: if the device cannot hold 45 fps,
// drop to light mode for the rest of the session (never overrides an explicit Full/Light choice).
watchFrameRate();

initPlatform();
initNativeInsets();
initBackButton();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackRender={props => <RuntimeErrorFallback error={props.error} />}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support: register the service worker in production browser builds only.
// The Android app bundles every file natively, so it does not need (or register) one.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const isNativeShell = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  if (!isNativeShell) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .catch(err => console.warn('[sw] registration failed', err));
    });
  }
}
