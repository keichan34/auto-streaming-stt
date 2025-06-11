import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';
import { SWRConfig } from 'swr';

registerSW({immediate: true});

// Expose a global function to reset the cache
declare global {
  interface Window {
    __resetCache: () => void;
  }
}

function localStorageProvider() {
  // When initializing, we restore the data from `localStorage` into a map.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>(JSON.parse(localStorage.getItem('app-cache') || '[]'))

  // Before unloading the app, we write back all the data into `localStorage`.
  window.addEventListener('beforeunload', () => {
    let appCache = JSON.stringify(Array.from(map.entries()))
    if (appCache.length > 2 ** 17) {
      // if the cache gets too big, let's clear it
      appCache = '[]';
    }
    localStorage.setItem('app-cache', appCache)
  })

  // Add the reset cache function to the window object
  window.__resetCache = () => {
    localStorage.removeItem('app-cache');
    // Clear our local cache
    map.clear();
    console.log('Cache has been reset');
  };

  // We still use the map for write & read for performance.
  return map
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SWRConfig value={{ provider: localStorageProvider }}>
      <App />
    </SWRConfig>
  </StrictMode>,
);
