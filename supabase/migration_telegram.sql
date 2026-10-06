-- =====================================================================
--  MIGRACJA: powiadomienia na Telegramie
--  Wklej w Supabase: SQL Editor -> New query -> Run
--  Dodaje kolumnę, dzięki której każda prośba wywoła tylko jedno powiadomienie.
-- =====================================================================

alter table public.bookings add column if not exists telegram_notified_at timestamptz;
