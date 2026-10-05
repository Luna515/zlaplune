# Umów się ze mną

Strona, na której znajomi proszą o spotkanie bez zakładania kont, a Ty je zatwierdzasz w panelu admina.

- Kalendarz: zielony = wolny cały dzień, żółty = wolne tylko niektóre godziny, **pomarańczowy = oczekuje na zatwierdzenie**, czerwony = zajęty
- Zapis na przedział godzin (co 30 min, całą dobę), w jednym czasie tylko jedna osoba
- Nowa prośba ma status **oczekuje**: termin jest zajęty, ale czeka na Twoją decyzję
- Po zatwierdzeniu status zmienia się na zajęty, a znajomy dostaje e-mail
- Zajęcie całego dnia checkboxem
- Panel admina z logowaniem: lista „Do zatwierdzenia”, dodawanie spotkań (od razu zatwierdzonych), usuwanie
- Znajomi dostają link do odwołania swojego zapisu

Stack: Vite + React + Supabase (baza i logowanie) + EmailJS (e-maile) + Vercel (hosting).

---

## AKTUALIZACJA do moderacji (jeśli strona już działa)

Zrób w tej kolejności:

1. **Baza:** Supabase -> SQL Editor -> New query: wklej całą zawartość `supabase/migration_moderacja.sql` i kliknij Run.
   Dotychczasowe zapisy dostaną status „zatwierdzone”. Plik `schema.sql` jest już zaktualizowany, ale dla działającej bazy uruchamiasz **tylko migrację**.
2. **EmailJS:** skonfiguruj zgodnie z sekcją „E-maile” niżej i zdobądź 3 wartości.
3. **Zmienne:** dopisz je w `.env` (lokalnie) oraz w Vercel (Settings -> Environment Variables).
4. **Kod:** podmień pliki projektu na nowe i uruchom `npm install` (doszła paczka `@emailjs/browser`). Na Vercel zrób nowe wdrożenie (push na GitHub wystarczy).

Kolejność ma znaczenie: nowy kod wywołuje funkcje bazy w nowej wersji, więc migracja musi być przed wdrożeniem.

---

## 1. Supabase (baza i logowanie), pierwsza instalacja

1. Załóż darmowy projekt na https://supabase.com
2. **SQL Editor -> New query**: wklej całą zawartość `supabase/schema.sql` i kliknij **Run**
3. **Authentication -> Users -> Add user**: podaj swój e-mail i hasło (zaznacz "Auto Confirm User")
4. W SQL Editorze uruchom (wpisz swój e-mail, bez znaczników ```):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TWOJ_EMAIL@example.com';
   ```

5. **Authentication -> Sign In / Providers -> Email**: wyłącz "Allow new users to sign up",
   żeby nikt poza Tobą nie mógł założyć konta
6. **Project Settings -> API**: skopiuj `Project URL` oraz klucz `anon public`

## 2. E-maile (EmailJS)

EmailJS wysyła e-maile z Twojego konta pocztowego (np. Gmail), bez własnego serwera. Darmowy plan: 200 wiadomości miesięcznie.

1. Załóż konto na https://www.emailjs.com
2. **Email Services -> Add New Service**: wybierz Gmail (lub inną pocztę), połącz konto. Zapisz **Service ID** (`service_...`).
         kod service_tpwng8z
3. **Email Templates -> Create New Template**. W ustawieniach szablonu:
   - **To Email:** `{{to_email}}`
   - **Reply To:** Twój adres (żeby odpowiedź znajomego trafiła do Ciebie)
   - **From Name:** np. Twoje imię
   - **Subject:** `Zatwierdzone: spotkanie {{date}}, {{time}}`
   - **Content** (treść), przykład:

     ```
     Cześć {{to_name}},

     Twoje spotkanie zostało zatwierdzone.

     Termin: {{date}}, {{time}}

     Jeśli plany się zmienią, możesz je odwołać tutaj:
     {{cancel_link}}

     {{site_title}}
     ```

   Zapisz szablon i skopiuj jego **Template ID** (`template_...`).
4. **Account -> General**: skopiuj **Public Key**.

5. Wpisz te trzy wartości do `.env` jako `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`.

Zmienne dostępne w szablonie: `to_email`, `to_name`, `date`, `time`, `cancel_link`, `site_title`.

**Uwaga o bezpieczeństwie:** klucze EmailJS w aplikacji frontendowej są publiczne z założenia (każdy może je zobaczyć w przeglądarce).
Ktoś zaawansowany mógłby użyć ich do wysłania Twojego szablonu na dowolny adres i zużyć miesięczny limit 200 wiadomości.
Treść jest stała (szablon), więc nie da się wysłać własnego tekstu. Z tego, co wyczytałam, ograniczanie do domeny
jest funkcją płatnych planów EmailJS. Gdyby doszło do nadużyć, w panelu EmailJS wygeneruj nowy Public Key.
Przy kilku znajomych to rozsądny kompromis. Gdyby strona rosła, lepsza będzie wysyłka po stronie serwera (np. funkcja Supabase).

## 3. Uruchomienie lokalnie

```bash
npm install
cp .env.example .env     # (Windows: copy .env.example .env) i wpisz wartości
npm run dev
```

Strona publiczna: `http://localhost:5173/`, panel: `http://localhost:5173/#/admin`

## 4. Wdrożenie na Vercel

1. Wrzuć folder na GitHub (plik `.env` jest w `.gitignore`, nie trafi do repo)
2. Na https://vercel.com: **Add New -> Project**, wybierz repo (framework Vite wykryje się sam)
3. **Environment Variables**: dodaj wszystkie 5 zmiennych:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`
4. **Deploy**. Po każdej zmianie zmiennych trzeba wdrożyć stronę ponownie.

Klucz `anon` jest publiczny z założenia. Dane chronią reguły w bazie (RLS): bez logowania nikt nie odczyta
imion ani e-maili, nie zatwierdzi i nie usunie cudzych zapisów.

## Jak działa moderacja

- Znajomy wysyła formularz (imię, e-mail, godziny). Zapis dostaje status `pending`, termin jest od razu zajęty dla innych.
- W panelu admina widzisz listę „Do zatwierdzenia” ze wszystkich miesięcy. Klik przenosi do dnia.
- **Zaakceptuj** zmienia status na `accepted` i wysyła e-mail. Jeśli wysyłka się nie uda, spotkanie i tak zostaje zatwierdzone,
  a przy zapisie pojawia się przycisk „Wyślij e-mail ponownie”.
- **Usuń** kasuje prośbę (odrzucenie). Znajomy nie dostaje o tym wiadomości.
- Spotkania dodane przez Ciebie w panelu są od razu zatwierdzone.

## Ustawienia

W `src/config.js`: tytuł i opis strony, godziny, w których można się umawiać (`DAY_START`, `DAY_END`; domyślnie całą dobę, 0–24),
długość pola godzinowego (`STEP`).

## Ochrona przed spamem

- Jedno imię lub jeden e-mail może mieć maksymalnie 4 przyszłe zapisy (także oczekujące)
- Ukryte pole-pułapka na boty
- Opcjonalny kod zaproszenia, który znajomi wpisują przy zapisie. Włączysz go w SQL Editorze:

  ```sql
  insert into public.app_settings (key, value) values ('invite_code', 'twoj-kod')
  on conflict (key) do update set value = excluded.value;
  ```

  Wyłączysz: `delete from public.app_settings where key = 'invite_code';`

## Testy

`npm test` uruchamia testy interfejsu (kalendarz, statusy, zapis, zatwierdzanie, e-mail, panel admina).
