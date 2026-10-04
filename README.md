# Umów się ze mną

Strona, na której znajomi zapisują się na spotkania bez zakładania kont, a Ty zarządzasz terminami w panelu admina.

- Kalendarz: zielony = wolny cały dzień, żółty = wolne tylko niektóre godziny, czerwony = zajęty
- Zapis na przedział godzin (co 30 min), w jednym czasie tylko jedna osoba
- Zajęcie całego dnia checkboxem
- Panel admina z logowaniem: dodawanie spotkań, podgląd imion i kontaktów, usuwanie
- Znajomi dostają link do odwołania swojego zapisu

Stack: Vite + React + Supabase (baza i logowanie) + Vercel (hosting).

## 1. Supabase (baza i logowanie)

1. Załóż darmowy projekt na https://supabase.com
2. **SQL Editor -> New query**: wklej całą zawartość `supabase/schema.sql` i kliknij **Run**
3. **Authentication -> Users -> Add user**: podaj swój e-mail i hasło (zaznacz "Auto Confirm User")
4. W SQL Editorze uruchom (wpisz swój e-mail):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TWOJ_EMAIL@example.com';
   ```

5. **Authentication -> Sign In / Providers -> Email**: wyłącz "Allow new users to sign up",
   żeby nikt poza Tobą nie mógł założyć konta
6. **Project Settings -> API**: skopiuj `Project URL` oraz klucz `anon public`
project url https://burdqhahuefvipoqsbwv.supabase.co/rest/v1/
anon public eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cmRxaGFodWVmdmlwb3FzYnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNDA3NTcsImV4cCI6MjEwNjcxNjc1N30.OHGQTTJ-BoNpS_264lkkAdw4GvTylvSBX_ACoNDF8XI

## 2. Uruchomienie lokalnie

```bash
npm install
cp .env.example .env     # wpisz URL i klucz z Supabase
npm run dev
```

Strona publiczna: `http://localhost:5173/`, panel: `http://localhost:5173/#/admin`

## 3. Wdrożenie na Vercel

1. Wrzuć folder na GitHub (plik `.env` jest w `.gitignore`, nie trafi do repo)
2. Na https://vercel.com: **Add New -> Project**, wybierz repo (framework Vite wykryje się sam)
3. **Environment Variables**: dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`
4. **Deploy**

Klucz `anon` jest publiczny z założenia. Dane chronią reguły w bazie (RLS): bez logowania nikt nie odczyta
imion ani kontaktów i nie usunie cudzych zapisów.

## Ustawienia

W `src/config.js`: tytuł i opis strony, godziny, w których można się umawiać (`DAY_START`, `DAY_END`),
długość pola godzinowego (`STEP`).

## Ochrona przed spamem

- Jedno imię może mieć maksymalnie 4 przyszłe zapisy
- Ukryte pole-pułapka na boty
- Opcjonalny kod zaproszenia, który znajomi wpisują przy zapisie. Włączysz go w SQL Editorze:

  ```sql
  insert into public.app_settings (key, value) values ('invite_code', 'twoj-kod')
  on conflict (key) do update set value = excluded.value;
  ```

  Wyłączysz: `delete from public.app_settings where key = 'invite_code';`

## Testy

`npm test` uruchamia testy interfejsu (kalendarz, wybór godzin, zapis, panel admina).
