export const BUCKET = 'backgrounds';
export const MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_OPACITY = 0.35;

const TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
};

const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };

export function mimeOf(file) {
  if (TYPES[file.type]) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT[ext] || null;
}

// zwraca komunikat błędu albo null, gdy plik jest w porządku
export function validateFile(file) {
  if (!file) return 'Wybierz plik.';
  const mime = mimeOf(file);
  if (!mime) return 'Obsługiwane pliki: JPG, PNG, WebP, GIF, MP4 i WebM.';
  if (file.size > MAX_BYTES) {
    return `Plik jest za duży (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum to 20 MB, a najlepiej do 5 MB.`;
  }
  return null;
}

export const kindOf = (file) => TYPES[mimeOf(file)];

export function storageName(file) {
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tlo';
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${Date.now()}-${base}.${ext}`;
}

// animowane tło (wideo, GIF) wyłączamy, gdy użytkownik prosi o mniej ruchu
export const isAnimated = (bg) => bg?.kind === 'video' || /\.gif($|\?)/i.test(bg?.url || '');

export const isSafeUrl = (url) => typeof url === 'string' && url.startsWith('https://');
