# Umów się ze mną

Strona, na której znajomi proszą o spotkanie bez zakładania kont, a Ty je zatwierdzasz w panelu admina.

- Kalendarz: zielony = wolny cały dzień, żółty = wolne tylko niektóre godziny, **pomarańczowy = oczekuje na zatwierdzenie**, czerwony = zajęty
- Zapis: wybór godziny początku i końca (co 30 min, całą dobę, minimum 1 godzina), w jednym czasie tylko jedna osoba
- Nowa prośba ma status **oczekuje**: termin jest zajęty, ale czeka na Twoją decyzję
- Po zatwierdzeniu status zmienia się na zajęty, a znajomy dostaje e-mail
- Zajęcie całego dnia checkboxem
- **Zamknięcie dnia** w panelu admina: reszta godzin jest niedostępna dla znajomych, a umówione spotkania nadal widać
- Panel admina z logowaniem: lista „Do zatwierdzenia”, dodawanie spotkań (od razu zatwierdzonych), usuwanie
- Znajomi dostają link do odwołania swojego zapisu
- Powiadomienie na Telegramie o każdej nowej prośbie, z przyciskami Zaakceptuj i Odrzuć (opcjonalne, patrz niżej)
- Animacje (litery nagłówka, kalendarz, panel, znaczek po wysłaniu). Wyłączają się same, gdy w systemie włączono ograniczenie ruchu

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

## Wybór początku i końca (minimum 1 godzina)

W formularzu klikasz godzinę początku, a potem godzinę końca. Godziny krótsze niż 1 h od początku są zablokowane,
a koniec nie może wejść na zajęty termin (może kończyć się tuż przed nim). Kliknięcie początku jeszcze raz zdejmuje wybór.
Alternatywa to „Cały dzień”. Zasada jest sprawdzana w formularzu i w bazie (dotyczy też spotkań dodawanych w panelu admina).

Jeśli baza działa od wcześniej, uruchom raz w SQL Editorze `supabase/migration_min_1h.sql`
(istniejące zapisy zostają bez zmian). Jeśli wcześniej uruchomiłaś `migration_min_30_min.sql`, ta migracja ją zastępuje.

Minimalną długość zmienisz w `src/config.js` (`MIN_DURATION`) i w `supabase/schema.sql` (liczba 60 minut).

## Powiadomienia na Telegramie (z przyciskami Zaakceptuj / Odrzuć)

Po każdej nowej prośbie bot wysyła Ci wiadomość (imię, termin, notatka; bez e-maila znajomego).
**Zaakceptuj** zmienia status i od razu wysyła znajomemu e-mail. **Odrzuć** pyta jeszcze o potwierdzenie,
potem usuwa prośbę (termin znów jest wolny) i, jeśli skonfigurujesz drugi szablon, wysyła znajomemu informację.
Wszystko działa też równolegle z panelem na stronie.

**1. Bot.** W Telegramie napisz do **@BotFather**: `/newbot`, podaj nazwę i login (kończy się na `bot`).
Dostaniesz **token** (`123456:ABC...`). To hasło do bota, nikomu go nie pokazuj.

**2. Sekret webhooka.** Wymyśl losowy ciąg liter i cyfr (np. 24 znaki). Zapisz go.

**3. EmailJS.**
- **Account -> API keys:** skopiuj **Private Key** (potrzebny, bo mail wychodzi z serwera). Opcję „Allow EmailJS API for non-browser applications” w Account -> Security już masz włączoną.
- Opcjonalnie drugi szablon na odrzucenie: **To Email** `{{to_email}}`, temat `Spotkanie {{date}}, {{time}}: zmiana`,
  treść np. „Cześć {{to_name}}, niestety nie mogę się spotkać w tym terminie ({{date}}, {{time}}). Napisz, jeśli chcesz umówić się inaczej. {{site_title}}”.
  Skopiuj jego **Template ID**. (Darmowy plan ma 2 szablony: jeden na zatwierdzenie, drugi na odrzucenie.)

**3a. Baza.** W Supabase (SQL Editor) uruchom `supabase/migration_telegram.sql`.

**4. Funkcja w Supabase.**
- **Edge Functions -> Deploy a new function** (edytor w przeglądarce). Nazwa dokładnie: `booking-bot`.
  Wklej całą zawartość `supabase/functions/booking-bot/index.ts` i wdróż.
  (Alternatywa z terminala: `supabase functions deploy booking-bot --no-verify-jwt`.)
- W ustawieniach tej funkcji **wyłącz weryfikację JWT** („Verify JWT”). Telegram nie wysyła tokena Supabase,
  a funkcja zabezpiecza się sama (sekret webhooka i Twoje ID czatu).
- **Edge Functions -> Secrets**, dodaj:

  | Nazwa | Wartość |
  |---|---|
  | `TELEGRAM_BOT_TOKEN` | token z BotFather |
  | `TELEGRAM_WEBHOOK_SECRET` | sekret z kroku 2 |
  | `TELEGRAM_CHAT_ID` | Twoje ID czatu (krok 6) |
  | `EMAILJS_SERVICE_ID` | jak w `.env` |
  | `EMAILJS_TEMPLATE_ID` | szablon zatwierdzenia |
  | `EMAILJS_PUBLIC_KEY` | jak w `.env` |
  | `EMAILJS_PRIVATE_KEY` | Private Key z kroku 3 |
  | `SITE_URL` | adres Twojej strony, np. `https://twoja-strona.vercel.app` |
  | `EMAILJS_REJECT_TEMPLATE_ID` | (opcjonalnie) szablon odrzucenia |

  `SUPABASE_URL` i klucz serwisowy funkcja dostaje automatycznie.

**5. Webhook.** Wklej w przeglądarkę jako jeden adres (podmień TOKEN, SEKRET i PROJEKT, czyli część przed `.supabase.co`):

```
https://api.telegram.org/botTOKEN/setWebhook?url=https://PROJEKT.supabase.co/functions/v1/booking-bot&secret_token=SEKRET
```

Odpowiedź powinna zawierać `"ok":true`.

**6. Twoje ID czatu.** Otwórz swojego bota w Telegramie i naciśnij **Start**. Bot odpowie „Twoje ID czatu: ...”.
Dodaj je jako sekret `TELEGRAM_CHAT_ID` (krok 4). Jeśli po dodaniu sekretów bot nie reaguje, wdróż funkcję jeszcze raz.

**7. Wdróż stronę ponownie** (kod strony zgłasza teraz zapisy botowi) i zrób testowy zapis. Wiadomość powinna przyjść po kilku sekundach.

Gdy coś nie działa: **Edge Functions -> booking-bot -> Logs**. `401` oznacza niezgodny sekret webhooka,
„Brak uprawnień” po kliknięciu to zły `TELEGRAM_CHAT_ID`. Stan webhooka sprawdzisz adresem
`https://api.telegram.org/botTOKEN/getWebhookInfo`. Gdyby token wyciekł, w BotFather użyj `/revoke`.

Uwaga: powiadomienie wysyła strona tuż po zapisie. Jeśli znajomy zamknie kartę w tej sekundzie, wiadomość może nie dojść,
ale prośba i tak jest na liście „Do zatwierdzenia” w panelu. Każdy mail (zatwierdzenie i odrzucenie) liczy się do limitu 200 miesięcznie w EmailJS.

## Zamykanie dni

W panelu admina, po kliknięciu dnia, zaznacz **„Oznacz dzień jako zajęty”**. Wtedy:
- w kalendarzu dzień jest czerwony z przekreśloną liczbą (wyróżnia się od dnia zapełnionego spotkaniami),
- znajomi widzą tylko umówione spotkania (czerwone w paski, oczekujące pomarańczowe), a pozostałe godziny są szare i nieaktywne,
- formularz zapisu jest ukryty, a baza odrzuca próby zapisu na ten dzień,
- Ty nadal możesz dodawać spotkania w zamkniętym dniu. Odznaczenie pola otwiera dzień z powrotem.

Do działania potrzebna jest migracja `supabase/migration_zamkniete_dni.sql` (uruchom raz w SQL Editorze, **przed** wdrożeniem nowej wersji strony).
Bez niej strona działa, ale zamknięte dni nie będą widoczne.

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

`npm test` uruchamia testy interfejsu (kalendarz, statusy, wybór początku i końca, zapis, zatwierdzanie, e-mail, panel admina).
