import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useBackground } from './BackgroundContext';
import { BUCKET, DEFAULT_OPACITY, isAnimated, kindOf, storageName, validateFile } from '../lib/background';

const SAVE_DELAY = 600;

// Panel admina: wgranie pliku, suwak widoczności (z podglądem na żywo), usunięcie tła.
export default function BackgroundEditor() {
  const { bg, setBg } = useBackground();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const timer = useRef(null);
  const opacity = bg?.opacity ?? DEFAULT_OPACITY;

  useEffect(() => () => clearTimeout(timer.current), []);

  const saveRow = (fields) =>
    supabase.from('site_background').upsert({ id: true, ...fields, updated_at: new Date().toISOString() });

  function onSlider(e) {
    const value = Number(e.target.value) / 100;
    setBg({ ...(bg || { url: null, kind: null, path: null }), opacity: value });
    setNote('');
    setError('');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error: err } = await saveRow({ opacity: value });
      if (err) setError('Nie udało się zapisać widoczności.');
      else setNote('Zapisano.');
    }, SAVE_DELAY);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setError('');
    setNote('');
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    const path = storageName(file);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { cacheControl: '31536000', contentType: file.type || undefined, upsert: false });
    if (upErr) {
      setBusy(false);
      setError('Nie udało się wgrać pliku. Sprawdź, czy migracja tła została uruchomiona i czy jesteś zalogowana.');
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const next = { url: data.publicUrl, kind: kindOf(file), storage_path: path, opacity };
    const { error: rowErr } = await saveRow(next);
    if (rowErr) {
      await supabase.storage.from(BUCKET).remove([path]); // nie zostawiamy sierot
      setBusy(false);
      setError('Plik wgrany, ale nie udało się zapisać ustawień. Spróbuj ponownie.');
      return;
    }

    const oldPath = bg?.path;
    setBg({ url: next.url, kind: next.kind, path, opacity });
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]); // stary plik już niepotrzebny
    setBusy(false);
    setNote('Tło ustawione.');
  }

  async function onRemove() {
    if (!window.confirm('Usunąć tło strony?')) return;
    setBusy(true);
    setError('');
    setNote('');
    const { error: rowErr } = await saveRow({ url: null, kind: null, storage_path: null });
    if (rowErr) {
      setBusy(false);
      setError('Nie udało się usunąć tła.');
      return;
    }
    if (bg?.path) await supabase.storage.from(BUCKET).remove([bg.path]);
    setBg({ url: null, kind: null, path: null, opacity });
    setBusy(false);
    setNote('Tło usunięte.');
  }

  const has = Boolean(bg?.url);
  const kindLabel = !has ? 'brak' : bg.kind === 'video' ? 'wideo' : /\.gif($|\?)/i.test(bg.url) ? 'GIF' : 'obraz';

  return (
    <details className="panel bgedit">
      <summary>
        Tło strony <span className="muted">({kindLabel})</span>
      </summary>

      <div className="bgedit__body">
        <label className="field">
          <span>Plik: JPG, PNG, WebP, GIF, MP4 lub WebM (do 20 MB)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            disabled={busy}
            onChange={onFile}
          />
        </label>

        <label className="field">
          <span>Widoczność tła: {Math.round(opacity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(opacity * 100)}
            onChange={onSlider}
            aria-label="Widoczność tła"
          />
        </label>

        {has && (
          <button type="button" className="btn btn--danger" disabled={busy} onClick={onRemove}>
            Usuń tło
          </button>
        )}

        {busy && <p className="muted">Wysyłam…</p>}
        {note && (
          <p className="msg msg--ok" role="status">
            {note}
          </p>
        )}
        {error && (
          <p className="msg msg--error" role="alert">
            {error}
          </p>
        )}

        <p className="hint">
          Podgląd widzisz od razu na tej stronie. Najlepiej sprawdza się 20 do 40% widoczności, żeby tekst był czytelny.
          Wideo i GIF-y odtwarzają się w pętli bez dźwięku. Każdy odwiedzający pobiera ten plik, więc trzymaj go małego
          (najlepiej do 5 MB, a krótkie MP4 lub WebM są wielokrotnie lżejsze od GIF-a). U osób z włączonym w systemie
          ograniczeniem ruchu animowane tło się nie pokazuje{has && isAnimated(bg) ? ', Ty też możesz go przez to nie widzieć' : ''}.
        </p>
      </div>
    </details>
  );
}
