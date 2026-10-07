// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { registerServiceWorker } from '../src/pwa.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));
const pngSize = (p) => {
  const b = fs.readFileSync(new URL(`../${p}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('manifest i ikony', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));

  it('ma wymagane pola aplikacji', () => {
    expect(m.name).toBe('Złap Lunę');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.lang).toBe('pl');
    expect(m.background_color).toBe('#0a0b0d');
  });

  it('każda ikona z manifestu istnieje i ma deklarowany rozmiar', () => {
    for (const icon of m.icons) {
      const path = `public${icon.src}`;
      expect(exists(path), path).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(path)).toEqual([w, h]);
    }
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  });

  it('skrót do panelu admina prowadzi na #/admin', () => {
    expect(m.shortcuts[0].url).toBe('/#/admin');
  });

  it('index.html wskazuje manifest i ikony, a pliki istnieją', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('name="theme-color" content="#0a0b0d"');
    for (const href of html.match(/href="(\/[^"]+)"/g).map((s) => s.slice(6, -1))) {
      expect(exists(`public${href}`), href).toBe(true);
    }
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180]);
  });
});

describe('rejestracja service workera', () => {
  const mk = () => {
    const handlers = {};
    const win = { addEventListener: (e, f) => { handlers[e] = f; } };
    const register = vi.fn(() => Promise.resolve());
    return { handlers, win, nav: { serviceWorker: { register } }, register };
  };

  it('w produkcji rejestruje /sw.js po załadowaniu strony', () => {
    const { handlers, win, nav, register } = mk();
    expect(registerServiceWorker({ nav, win, prod: true })).toBe(true);
    expect(register).not.toHaveBeenCalled();
    handlers.load();
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('poza produkcją (npm run dev) nic nie rejestruje', () => {
    const { win, nav, register } = mk();
    expect(registerServiceWorker({ nav, win, prod: false })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('przeglądarka bez obsługi service workera: bez błędu', () => {
    expect(registerServiceWorker({ nav: {}, win: { addEventListener() {} }, prod: true })).toBe(false);
  });

  it('błąd rejestracji jest ignorowany', async () => {
    const { handlers, win } = mk();
    const nav = { serviceWorker: { register: () => Promise.reject(new Error('x')) } };
    registerServiceWorker({ nav, win, prod: true });
    expect(() => handlers.load()).not.toThrow();
  });
});

// ---- logika samego service workera, uruchomiona na atrapie środowiska ----
function loadSW() {
  const listeners = {};
  const store = new Map(); // nazwa cache -> Map(klucz -> Response)
  const keyOf = (r) => (typeof r === 'string' ? r : new URL(r.url).pathname);
  const caches = {
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        match: async (r) => m.get(keyOf(r)),
        put: async (r, res) => { m.set(keyOf(r), res); },
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
  const net = { calls: [], online: true, ok: true };
  const fetchFn = async (req) => {
    net.calls.push(req.url);
    if (!net.online) throw new Error('offline');
    return new Response('x', { status: net.ok ? 200 : 500 });
  };
  const self = {
    location: { origin: 'https://strona.example' },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (e, f) => { listeners[e] = f; },
  };
  vm.runInNewContext(read('public/sw.js'), { self, caches, fetch: fetchFn, Response, URL });

  const fire = async (req) => {
    let out;
    listeners.fetch({ request: req, respondWith: (p) => { out = p; } });
    return out === undefined ? undefined : await out;
  };
  const req = (url, extra = {}) => ({ method: 'GET', mode: 'cors', url, ...extra });
  return { listeners, store, net, self, fire, req };
}

describe('service worker', () => {
  it('install: przejmuje kontrolę od razu', () => {
    const { listeners, self } = loadSW();
    listeners.install();
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it('nie dotyka zapytań do innych domen (Supabase, EmailJS, Telegram)', async () => {
    const { fire, req, net } = loadSW();
    expect(await fire(req('https://abc.supabase.co/rest/v1/rpc/busy_slots'))).toBeUndefined();
    expect(await fire(req('https://api.emailjs.com/api/v1.0/email/send'))).toBeUndefined();
    expect(net.calls).toHaveLength(0);
  });

  it('nie dotyka zapytań innych niż GET ani zwykłych zasobów spoza assets/icons', async () => {
    const { fire, req } = loadSW();
    expect(await fire(req('https://strona.example/assets/a.js', { method: 'POST' }))).toBeUndefined();
    expect(await fire(req('https://strona.example/api/dane'))).toBeUndefined();
  });

  it('pliki /assets/: za drugim razem z pamięci, bez sieci', async () => {
    const { fire, req, net } = loadSW();
    await fire(req('https://strona.example/assets/index-abc.js'));
    await fire(req('https://strona.example/assets/index-abc.js'));
    expect(net.calls).toHaveLength(1);
  });

  it('błędnej odpowiedzi (500) nie zapamiętuje', async () => {
    const { fire, req, net } = loadSW();
    net.ok = false;
    await fire(req('https://strona.example/assets/b.js'));
    net.ok = true;
    await fire(req('https://strona.example/assets/b.js'));
    expect(net.calls).toHaveLength(2);
  });

  it('strona: zawsze próbuje sieci (świeża wersja po wdrożeniu)', async () => {
    const { fire, req, net } = loadSW();
    const nav = req('https://strona.example/', { mode: 'navigate' });
    await fire(nav);
    await fire(nav);
    expect(net.calls).toHaveLength(2);
  });

  it('strona bez internetu: ostatnia zapamiętana wersja', async () => {
    const { fire, req, net } = loadSW();
    const nav = req('https://strona.example/', { mode: 'navigate' });
    await fire(nav);
    net.online = false;
    const res = await fire(nav);
    expect(await res.text()).toBe('x');
  });

  it('activate: usuwa stare wersje pamięci, cudzych nie rusza', async () => {
    const { listeners, store, self } = loadSW();
    store.set('zaplune-shell-v0', new Map());
    store.set('inna-aplikacja', new Map());
    let p;
    listeners.activate({ waitUntil: (x) => { p = x; } });
    await p;
    expect([...store.keys()]).toEqual(['inna-aplikacja']);
    expect(self.clients.claim).toHaveBeenCalled();
  });
});
