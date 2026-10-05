-- =====================================================================
--  MIGRACJA: moderacja spotkań (statusy, e-mail znajomego)
--  Dla bazy, w której już uruchomiłaś pierwszy schema.sql.
--  Wklej całość w Supabase: SQL Editor -> New query -> Run
--  Istniejące już zapisy dostaną status "accepted" (zatwierdzone).
-- =====================================================================

-- ---------- Nowe kolumny ---------------------------------------------

-- najpierw domyślnie 'accepted', żeby stare zapisy zostały zatwierdzone...
alter table public.bookings
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted'));

-- ...a od teraz nowe zapisy z formularza są domyślnie 'pending'
alter table public.bookings alter column status set default 'pending';

alter table public.bookings
  add column if not exists email text check (char_length(email) <= 200);

-- kiedy wysłano e-mail o zatwierdzeniu (pusto = jeszcze nie wysłano)
alter table public.bookings add column if not exists notified_at timestamptz;

create index if not exists bookings_status_idx on public.bookings (status);

-- ---------- Zajęte terminy (teraz ze statusem) ------------------------

drop function if exists public.busy_slots(date, date);

create function public.busy_slots(p_from date, p_to date)
returns table (day date, start_time time, end_time time, all_day boolean, status text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_to - p_from > 62 then
    raise exception 'Zakres dat jest za duży';
  end if;
  return query
    select b.day, b.start_time, b.end_time, b.all_day, b.status
    from public.bookings b
    where b.day between p_from and p_to
    order by b.day, b.start_time;
end;
$$;

-- ---------- Zapis (teraz z e-mailem, status "pending") ----------------

drop function if exists public.book_slot(date, time, time, boolean, text, text, text, text);

create function public.book_slot(
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

-- ---------- Uprawnienia ----------------------------------------------

revoke all on function public.busy_slots(date, date)                                   from public;
revoke all on function public.book_slot(date, time, time, boolean, text, text, text, text) from public;

grant execute on function public.busy_slots(date, date)                                   to anon, authenticated;
grant execute on function public.book_slot(date, time, time, boolean, text, text, text, text) to anon, authenticated;
