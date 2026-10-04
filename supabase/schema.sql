-- =====================================================================
--  Schemat bazy dla strony z zapisami na spotkania
--  Wklej całość w Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- ---------- Tabele ---------------------------------------------------

-- Lista adminów (tylko Ty). Uzupełnisz ją w kroku "konto admina" niżej.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

-- Ustawienia aplikacji (np. opcjonalny kod zaproszenia dla znajomych)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;

-- Zapisy / spotkania
create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,
  start_time   time not null,
  end_time     time not null,
  all_day      boolean not null default false,
  name         text not null check (char_length(name) between 1 and 60),
  contact      text check (char_length(contact) <= 100),
  note         text check (char_length(note) <= 300),
  cancel_token uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  check (end_time > start_time),
  -- w jednym czasie może być zapisana tylko jedna osoba
  exclude using gist (tsrange(day + start_time, day + end_time) with &&)
);
alter table public.bookings enable row level security;

create index if not exists bookings_day_idx on public.bookings (day);

-- Anonimowi użytkownicy nie mają bezpośredniego dostępu do tabel.
revoke all on public.bookings     from anon;
revoke all on public.admins       from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

-- ---------- Kto jest adminem -----------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Admin ma pełny dostęp do zapisów (podgląd, dodawanie, edycja, usuwanie)
drop policy if exists "admin ma pelny dostep" on public.bookings;
create policy "admin ma pelny dostep" on public.bookings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Funkcje publiczne (dla znajomych bez kont) ----------------

-- Zajęte terminy w zakresie dat - bez imion i kontaktów.
create or replace function public.busy_slots(p_from date, p_to date)
returns table (day date, start_time time, end_time time, all_day boolean)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_to - p_from > 62 then
    raise exception 'Zakres dat jest za duży';
  end if;
  return query
    select b.day, b.start_time, b.end_time, b.all_day
    from public.bookings b
    where b.day between p_from and p_to
    order by b.day, b.start_time;
end;
$$;

-- Czy do zapisu potrzebny jest kod zaproszenia?
create or replace function public.requires_code()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_settings
    where key = 'invite_code' and btrim(value) <> ''
  );
$$;

-- Zapis na termin. Zwraca token do anulowania zapisu.
create or replace function public.book_slot(
  p_day     date,
  p_start   time,
  p_end     time,
  p_all_day boolean,
  p_name    text,
  p_contact text default null,
  p_note    text default null,
  p_code    text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_start  time := p_start;
  v_end    time := p_end;
  v_now    timestamp := (now() at time zone 'Europe/Warsaw');
  v_code   text;
  v_token  uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Podaj imię (do 60 znaków)';
  end if;

  select value into v_code from public.app_settings where key = 'invite_code';
  if v_code is not null and btrim(v_code) <> '' and btrim(coalesce(p_code, '')) <> btrim(v_code) then
    raise exception 'Nieprawidłowy kod zaproszenia';
  end if;

  if p_all_day then
    v_start := time '00:00';
    v_end   := time '23:59:59';
  end if;

  if v_end <= v_start then
    raise exception 'Godzina końca musi być po godzinie początku';
  end if;

  if (p_day + v_start) < v_now then
    raise exception 'Nie można zapisać się na termin z przeszłości';
  end if;

  if p_day > (v_now::date + 365) then
    raise exception 'Termin jest zbyt odległy';
  end if;

  if (select count(*) from public.bookings
      where lower(name) = lower(v_name) and day >= v_now::date) >= 4 then
    raise exception 'Masz już maksymalną liczbę zapisów. Anuluj któryś lub napisz do mnie';
  end if;

  insert into public.bookings (day, start_time, end_time, all_day, name, contact, note)
  values (
    p_day, v_start, v_end, coalesce(p_all_day, false), v_name,
    nullif(btrim(coalesce(p_contact, '')), ''),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning cancel_token into v_token;

  return v_token;
end;
$$;

-- Podgląd zapisu po tokenie (strona anulowania)
create or replace function public.booking_by_token(p_token uuid)
returns table (day date, start_time time, end_time time, all_day boolean)
language sql stable security definer
set search_path = public
as $$
  select b.day, b.start_time, b.end_time, b.all_day
  from public.bookings b
  where b.cancel_token = p_token;
$$;

-- Anulowanie zapisu po tokenie
create or replace function public.cancel_booking(p_token uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.bookings where cancel_token = p_token;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- Uprawnienia: tylko to, co potrzebne
revoke all on function public.busy_slots(date, date)                                   from public;
revoke all on function public.requires_code()                                          from public;
revoke all on function public.book_slot(date, time, time, boolean, text, text, text, text) from public;
revoke all on function public.booking_by_token(uuid)                                   from public;
revoke all on function public.cancel_booking(uuid)                                     from public;

grant execute on function public.busy_slots(date, date)                                   to anon, authenticated;
grant execute on function public.requires_code()                                          to anon, authenticated;
grant execute on function public.book_slot(date, time, time, boolean, text, text, text, text) to anon, authenticated;
grant execute on function public.booking_by_token(uuid)                                   to anon, authenticated;
grant execute on function public.cancel_booking(uuid)                                     to anon, authenticated;

-- =====================================================================
--  KONTO ADMINA (zrób po utworzeniu użytkownika w Supabase)
--  1. Supabase -> Authentication -> Users -> Add user (Twój e-mail + hasło)
--  2. Wpisz swój e-mail poniżej i uruchom to jedno zapytanie:
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'TWOJ_EMAIL@example.com';
--
--  Opcjonalnie: kod zaproszenia, który znajomi wpisują przy zapisie
--  (usuń wiersz, żeby wyłączyć):
--
--  insert into public.app_settings (key, value) values ('invite_code', 'twoj-kod')
--  on conflict (key) do update set value = excluded.value;
-- =====================================================================
