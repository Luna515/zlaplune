// Rejestruje service worker (tylko w wersji produkcyjnej, nie w npm run dev).
export function registerServiceWorker({
  nav = typeof navigator !== 'undefined' ? navigator : null,
  win = typeof window !== 'undefined' ? window : null,
  prod = import.meta.env.PROD,
} = {}) {
  if (!prod || !nav || !win || !('serviceWorker' in nav)) return false;
  win.addEventListener('load', () => {
    nav.serviceWorker.register('/sw.js').catch(() => {});
  });
  return true;
}
