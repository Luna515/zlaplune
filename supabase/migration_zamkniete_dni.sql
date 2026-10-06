-- =====================================================================
--  MIGRACJA: zamykanie dni (reszta dnia niedostępna, spotkania widoczne)
--  Wklej w Supabase: SQL Editor -> New query -> Run
-- =====================================================================

create table if not exists public.closed_days (
  day        date primary key,
  created_at timestamptz not null default now()
);
alter table public.closed_days enable row level security;
revoke all on public.closed_days from anon;

drop policy if exists "admin ma pelny dostep" on public.closed_days;
create policy "admin ma pelny dostep" on public.closed_days
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.closed_days_between(p_from date, p_to date)
returns table (day date)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_to - p_from > 62 then
    raise exception 'Zakres dat jest za duży';
  end if;
  return query
    select c.day from public.closed_days c
    where c.day between p_from and p_to
    order by c.day;
end;
$$;

revoke all on function public.closed_days_between(date, date) from public;
grant execute on function public.closed_days_between(date, date) to anon, authenticated;

-- Funkcja zapisu: odrzuca zapisy na zamknięte dni (reszta bez zmian)
create or replace function public.book_slot(
  p_day     date,
  p_start   time,
  p_end     time,
  p_all_day boolean,
  p_name    text,
  p_email   text,
  p_note    text default null,
  p_code    text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_start  time := p_start;
  v_end    time := p_end;
  v_now    timestamp := (now() at time zone 'Europe/Warsaw');
  v_code   text;
  v_token  uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Podaj imię (do 60 znaków)';
  end if;

  if char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Podaj poprawny adres e-mail';
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

  if not p_all_day and (v_end - v_start) < interval '60 minutes' then
    raise exception 'Wybierz początek i koniec: minimum 1 godzina';
  end if;

  if exists (select 1 from public.closed_days where day = p_day) then
    raise exception 'Ten dzień jest niedostępny';
  end if;

  if (p_day + v_start) < v_now then
    raise exception 'Nie można zapisać się na termin z przeszłości';
  end if;

  if p_day > (v_now::date + 365) then
    raise exception 'Termin jest zbyt odległy';
  end if;

  if (select count(*) from public.bookings
      where (lower(name) = lower(v_name) or lower(email) = v_email)
        and day >= v_now::date) >= 4 then
    raise exception 'Masz już maksymalną liczbę zapisów. Anuluj któryś lub napisz do mnie';
  end if;

  insert into public.bookings (day, start_time, end_time, all_day, name, email, note, status)
  values (
    p_day, v_start, v_end, coalesce(p_all_day, false), v_name, v_email,
    nullif(btrim(coalesce(p_note, '')), ''),
    'pending'
  )
  returning cancel_token into v_token;

  return v_token;
end;
$$;
