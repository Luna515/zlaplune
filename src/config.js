// Ustawienia, które możesz zmienić

export const SITE_TITLE = 'Złap Lune';
export const SITE_LEDE =
  'Wybierz dzień w kalendarzu, potem godziny, w których możemy się spotkać. Konto nie jest potrzebne.';

// Godziny, w których można się umawiać (0 i 24 = całą dobę)
export const DAY_START = 0;
export const DAY_END = 24;

// Co ile minut można wybrać godzinę początku i końca (30 albo 60)
export const STEP = 30;

// Minimalna długość rezerwacji w minutach (od początku do końca).
// Uwaga: ta sama wartość jest w bazie, w supabase/schema.sql (60 minut).
export const MIN_DURATION = 60;
