-- =====================================================================
--  MIGRACJA: tło strony ustawiane z panelu admina
--  Wklej w Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- ---------- Tło strony (obraz, GIF albo wideo) ----------

-- Jeden wiersz z ustawieniami tła. Odczyt jest publiczny (strona musi je znać),
-- zapis tylko dla admina.
create table if not exists public.site_background (
  id           boolean primary key default true check (id),
  url          text,
  kind         text check (kind in ('image', 'video')),
  storage_path text,
  opacity      numeric not null default 0.35 check (opacity >= 0 and opacity <= 1),
  updated_at   timestamptz not null default now()
);
alter table public.site_background enable row level security;
revoke all on public.site_background from anon;
grant select on public.site_background to anon, authenticated;

insert into public.site_background (id) values (true) on conflict (id) do nothing;

drop policy if exists "tlo: odczyt publiczny" on public.site_background;
create policy "tlo: odczyt publiczny" on public.site_background
  for select to anon, authenticated using (true);

drop policy if exists "tlo: admin zapisuje" on public.site_background;
create policy "tlo: admin zapisuje" on public.site_background
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Pliki tła trafiają do publicznego kubełka "backgrounds" (limit 20 MB na plik).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'backgrounds', 'backgrounds', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pliki są publiczne (adres działa dla każdego), ale wgrywać, listować i usuwać może tylko admin.
drop policy if exists "tla: admin odczyt" on storage.objects;
create policy "tla: admin odczyt" on storage.objects
  for select to authenticated
  using (bucket_id = 'backgrounds' and public.is_admin());

drop policy if exists "tla: admin dodaje" on storage.objects;
create policy "tla: admin dodaje" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backgrounds' and public.is_admin());

drop policy if exists "tla: admin zmienia" on storage.objects;
create policy "tla: admin zmienia" on storage.objects
  for update to authenticated
  using (bucket_id = 'backgrounds' and public.is_admin())
  with check (bucket_id = 'backgrounds' and public.is_admin());

drop policy if exists "tla: admin usuwa" on storage.objects;
create policy "tla: admin usuwa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'backgrounds' and public.is_admin());
