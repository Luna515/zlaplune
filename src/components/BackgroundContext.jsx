import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { DEFAULT_OPACITY } from '../lib/background';

const Ctx = createContext({ bg: null, setBg: () => {} });
export const useBackground = () => useContext(Ctx);

// Wczytuje ustawienia tła raz przy starcie. Brak tabeli (przed migracją) = brak tła.
export function BackgroundProvider({ children }) {
  const [bg, setBg] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('site_background')
      .select('url, kind, storage_path, opacity')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setBg({
          url: data.url || null,
          kind: data.kind || null,
          path: data.storage_path || null,
          opacity: data.opacity == null ? DEFAULT_OPACITY : Number(data.opacity),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ bg, setBg }), [bg]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
