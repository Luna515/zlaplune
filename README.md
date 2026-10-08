# Złap Lunę

Strona, na której znajomi proszą o spotkanie bez zakładania kont, a Ty zatwierdzasz je w panelu admina
albo jednym kliknięciem na Telegramie.

**Spis treści**

1. [Co potrafi](#1-co-potrafi)
2. [Czego potrzebujesz](#2-czego-potrzebujesz)
3. [Instalacja od zera](#3-instalacja-od-zera) (kroki 1 do 5, w tej kolejności)
4. [Dodatki (opcjonalne)](#4-dodatki-opcjonalne): Telegram, tło strony, zamykanie dni, aplikacja na telefonie, kod zaproszenia
5. [Obsługa na co dzień](#5-obsługa-na-co-dzień)
6. [Aktualizacja działającej strony](#6-aktualizacja-działającej-strony)
7. [Ustawienia i własny wygląd](#7-ustawienia-i-własny-wygląd)
8. [Rozwiązywanie problemów](#8-rozwiązywanie-problemów)
9. [Bezpieczeństwo](#9-bezpieczeństwo)
10. [Dla programistów](#10-dla-programistów)

---

## 1. Co potrafi

**Dla znajomych (bez kont i haseł)**
- Kalendarz z kolorami: zielony (wolny cały dzień), żółty (wolne tylko niektóre godziny), pomarańczowy (czeka na zatwierdzenie), czerwony (zajęty).
- Wybór godziny początku i końca (co 30 minut, całą dobę, minimum 1 godzina) albo zaznaczenie „Cały dzień”.
- W jednym czasie może być zapisana tylko jedna osoba.
- Po wysłaniu prośby dostają informację, że termin czeka na zatwierdzenie, i link do odwołania zapisu.
- Po zatwierdzeniu dostają e-mail.

**Dla Ciebie (panel admina, logowanie)**
- Lista „Do zatwierdzenia” ze wszystkich miesięcy, przyciski Zaakceptuj i Usuń.
- Dodawanie własnych spotkań (od razu zatwierdzonych) i zamykanie całych dni.
- Powiadomienia na Telegramie z przyciskami Zaakceptuj i Odrzuć.
- Tło strony (obraz, GIF lub wideo) ze suwakiem widoczności.

**Dodatki:** ciemny wygląd z animacjami, instalacja na telefonie jak aplikacja (PWA), ochrona przed spamem.

---

## 2. Czego potrzebujesz

| Konto | Do czego | Koszt | Wymagane |
|---|---|---|---|
| **Supabase** | baza danych, logowanie, pliki tła | darmowy plan | tak |
| **GitHub** | przechowanie kodu | darmowy | tak |
| **Vercel** | publikacja strony | darmowy plan Hobby (do użytku osobistego, niekomercyjnego) | tak |
| **EmailJS** | e-maile do znajomych | darmowy plan, 200 wiadomości miesięcznie | tak |
| **Telegram** | powiadomienia z przyciskami | darmowy | nie |

Do uruchomienia lokalnie (krok 3) potrzebny jest jeszcze zainstalowany **Node.js** (aktualna wersja LTS).
Pierwsza instalacja zajmuje orientacyjnie około godziny.

### Ściągawka: gdzie co wpisać

W trakcie instalacji zbierzesz kilka wartości. Ta tabela pokazuje, skąd je wziąć i gdzie wkleić.

| Wartość | Skąd | Gdzie wpisać |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase: Project Settings, API, Project URL | `.env` i Vercel |
| `VITE_SUPABASE_ANON_KEY` | Supabase: Project Settings, API, klucz `anon public` | `.env` i Vercel |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS: Email Services | `.env` i Vercel |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS: Email Templates | `.env` i Vercel |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS: Account, General | `.env` i Vercel |
| sekrety bota Telegram | patrz [sekcja 4.1](#41-powiadomienia-na-telegramie-z-przyciskami) | Supabase: Edge Functions, Secrets |

---

## 3. Instalacja od zera

Rób kroki po kolei. Przy nowej instalacji potrzebujesz **tylko jednego pliku SQL**: `supabase/schema.sql`.
Zawiera całą bazę (moderację, zamykanie dni, tło, minimum 1 godziny, powiadomienia). Pliki `migration_*.sql`
służą wyłącznie do aktualizacji starszych instalacji (sekcja 6), przy nowej ich nie uruchamiaj.

### Krok 1. Supabase: baza i logowanie

1. Załóż darmowy projekt na https://supabase.com i poczekaj, aż się utworzy.
2. **SQL Editor, New query:** wklej całą zawartość `supabase/schema.sql` i kliknij **Run**.
3. **Authentication, Users, Add user:** podaj swój e-mail i hasło, zaznacz „Auto Confirm User”.
   Tym kontem będziesz się logować do panelu.
4. Nadaj temu kontu uprawnienia admina. W SQL Editorze uruchom poniższe polecenie, wpisując **swój** e-mail
   (ten z punktu 3, w apostrofach). Wklejaj tylko dwie linie SQL, bez znaczników z trzema apostrofami odwrotnymi:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TWOJ_EMAIL@example.com';
   ```

   Powinno pokazać się „Success” i 1 dodany wiersz. Przy 0 wierszy e-mail nie zgadza się z kontem z punktu 3.
5. **Authentication, Sign In / Providers, Email:** wyłącz „Allow new users to sign up”, żeby nikt poza Tobą
   nie mógł założyć konta. (Nazwy w panelu Supabase potrafią się lekko zmieniać.)
6. **Project Settings, API:** zapisz **Project URL** oraz klucz **anon public**
   (w nowszym wyglądzie może się nazywać „publishable”). Nie bierz klucza `service_role`.

### Krok 2. EmailJS: e-maile do znajomych

Mail z potwierdzeniem wysyła EmailJS z Twojego konta pocztowego (np. Gmail).

1. Załóż konto na https://www.emailjs.com
2. **Email Services, Add New Service:** wybierz Gmail (lub inną pocztę) i połącz konto.
   Zapisz **Service ID** (`service_...`).
3. **Email Templates, Create New Template.** W ustawieniach szablonu:
   - **To Email:** dokładnie `{{to_email}}`, z podwójnymi nawiasami, bez spacji. To najczęstsze źródło błędów.
   - **Reply To:** Twój adres, żeby odpowiedź znajomego trafiała do Ciebie.
   - **From Name:** np. Twoje imię.
   - **Subject:** `Zatwierdzone: spotkanie {{date}}, {{time}}`
   - **Content**, przykład:

     ```
     Cześć {{to_name}},

     Twoje spotkanie zostało zatwierdzone.

     Termin: {{date}}, {{time}}

     Jeśli plany się zmienią, możesz je odwołać tutaj:
     {{cancel_link}}

     {{site_title}}
     ```

   Zapisz szablon (**Save**) i skopiuj jego **Template ID** (`template_...`).
4. **Account, General:** skopiuj **Public Key**.

Zmienne dostępne w szablonie: `to_email`, `to_name`, `date`, `time`, `cancel_link`, `site_title`.

### Krok 3. Plik `.env` i test lokalny

Ten krok jest opcjonalny, ale pozwala sprawdzić stronę, zanim ją opublikujesz.

1. W folderze projektu skopiuj `.env.example` jako `.env`
   (Windows: `copy .env.example .env`, Mac i Linux: `cp .env.example .env`).
2. Otwórz `.env` i wpisz pięć wartości, bez cudzysłowów i bez spacji wokół `=`:

   ```
   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
   VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
   VITE_EMAILJS_PUBLIC_KEY=twoj_public_key
   ```

3. W terminalu, w folderze projektu:

   ```
   npm install
   npm run dev
   ```

4. Strona publiczna: `http://localhost:5173/`. Panel admina: `http://localhost:5173/#/admin`.
   Po każdej zmianie `.env` zatrzymaj `npm run dev` (Ctrl+C) i uruchom go ponownie.

### Krok 4. GitHub i Vercel: publikacja

1. Utwórz repozytorium na GitHubie i wrzuć do niego pliki projektu. Plik `.env` jest w `.gitignore`,
   więc nie trafi do repozytorium (i tak ma być).
2. Na https://vercel.com: **Add New, Project**, wybierz to repozytorium. Framework (Vite) wykryje się sam.
3. W **Environment Variables** dodaj te same pięć zmiennych co w `.env` (te z `VITE_`).
4. Kliknij **Deploy**. Po chwili dostaniesz adres strony.

Zasada na przyszłość: po **każdej** zmianie zmiennych w Vercelu trzeba wdrożyć stronę ponownie (Deployments, Redeploy),
bo wartości trafiają do strony podczas budowania.

### Krok 5. Pierwszy test

1. Otwórz stronę w oknie incognito, wybierz dzień, godziny, wpisz imię i swój drugi adres e-mail, wyślij prośbę.
   Powinno pojawić się „Czeka na zatwierdzenie”.
2. W zwykłym oknie wejdź na `adres-strony/#/admin`, zaloguj się. Prośba jest na liście „Do zatwierdzenia”.
3. Kliknij **Zaakceptuj**. Pod spodem powinno pojawić się „E-mail wysłano na ...”.
   Sprawdź skrzynkę (także folder spam).

Jeśli któryś punkt nie działa, zajrzyj do [rozwiązywania problemów](#8-rozwiązywanie-problemów).
Na tym kończy się podstawowa instalacja. Reszta jest opcjonalna.

---

## 4. Dodatki (opcjonalne)

### 4.1. Powiadomienia na Telegramie z przyciskami

Po każdej nowej prośbie bot wysyła Ci wiadomość (imię, termin, notatka, bez e-maila znajomego) z przyciskami:
- **Zaakceptuj** zmienia status i od razu wysyła znajomemu e-mail,
- **Odrzuć** pyta jeszcze o potwierdzenie, potem usuwa prośbę (termin znów jest wolny)
  i, jeśli skonfigurujesz drugi szablon, wysyła znajomemu informację.

Strony nie trzeba zmieniać: ona sama zgłasza nowe zapisy botowi. Rób kroki po kolei.

1. **Bot.** W Telegramie napisz do **@BotFather**: `/newbot`, podaj nazwę i login (kończy się na `bot`).
   Dostaniesz **token** (`123456:ABC...`). To hasło do bota, nikomu go nie pokazuj.
2. **Sekret webhooka.** Wymyśl losowy ciąg liter i cyfr (np. 24 znaki) i zapisz go.
3. **EmailJS dla serwera.**
   - **Account, Security:** włącz „Allow EmailJS API for non-browser applications”, bo e-mail po kliknięciu
     w Telegramie wychodzi z serwera, a nie z przeglądarki.
   - **Account, API keys:** skopiuj **Private Key**.
   - Opcjonalnie drugi szablon na odrzucenie: **To Email** `{{to_email}}`, temat np. `Spotkanie {{date}}, {{time}}: zmiana`,
     treść np. „Cześć {{to_name}}, niestety nie mogę się spotkać w tym terminie ({{date}}, {{time}}). Napisz, jeśli chcesz
     umówić się inaczej. {{site_title}}”. Skopiuj jego **Template ID**. Bez tego szablonu odrzucenie niczego nie wyśle.
4. **Funkcja w Supabase.**
   - **Edge Functions, Deploy a new function** (edytor w przeglądarce). Nazwa dokładnie: `booking-bot`.
     Wklej całą zawartość `supabase/functions/booking-bot/index.ts` i wdróż.
     (Z terminala: `npx supabase functions deploy booking-bot --no-verify-jwt`, wymaga zainstalowanego Supabase CLI.)
   - W ustawieniach tej funkcji **wyłącz „Verify JWT”**. Telegram nie wysyła tokena Supabase,
     a funkcja zabezpiecza się sama (sekret webhooka i Twoje ID czatu).
5. **Sekrety funkcji.** **Edge Functions, Secrets**, dodaj:

   | Nazwa | Wartość |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | token z kroku 1 |
   | `TELEGRAM_WEBHOOK_SECRET` | sekret z kroku 2 |
   | `EMAILJS_SERVICE_ID` | Service ID z EmailJS |
   | `EMAILJS_TEMPLATE_ID` | Template ID szablonu zatwierdzenia |
   | `EMAILJS_PUBLIC_KEY` | Public Key |
   | `EMAILJS_PRIVATE_KEY` | Private Key z kroku 3 |
   | `SITE_URL` | adres Twojej strony, np. `https://twoja-strona.vercel.app` |
   | `EMAILJS_REJECT_TEMPLATE_ID` | (opcjonalnie) szablon odrzucenia |
   | `TELEGRAM_CHAT_ID` | dodasz w kroku 7 |

   `SUPABASE_URL` i klucz serwisowy funkcja dostaje automatycznie.
6. **Webhook.** Wklej w przeglądarkę jako **jeden adres w jednej linii** (podmień TOKEN, SEKRET i PROJEKT,
   czyli część Twojego adresu Supabase przed `.supabase.co`):

   ```
   https://api.telegram.org/botTOKEN/setWebhook?url=https://PROJEKT.supabase.co/functions/v1/booking-bot&secret_token=SEKRET
   ```

   Odpowiedź powinna zawierać `"ok":true`. Najczęstsze błędy: `https://` wpisane dwa razy, zostawione słowa
   TOKEN, SEKRET lub PROJEKT, spacje lub nawiasy w adresie.
7. **Twoje ID czatu.** Otwórz swojego bota w Telegramie i naciśnij **Start**. Bot odpowie „Twoje ID czatu: ...”.
   Dodaj je jako sekret `TELEGRAM_CHAT_ID`. Jeśli bot nie reaguje po dodaniu sekretów, wdróż funkcję jeszcze raz.
8. **Test.** Zrób testową prośbę na stronie. Wiadomość powinna przyjść po kilku sekundach.

Uwagi:
- Powiadomienie wysyła strona tuż po zapisie. Jeśli znajomy zamknie kartę w tej sekundzie, wiadomość może nie dojść,
  ale prośba i tak jest na liście „Do zatwierdzenia” w panelu.
- Każdy mail (zatwierdzenie i odrzucenie) liczy się do limitu 200 miesięcznie w EmailJS.
- Gdyby token bota wyciekł, w BotFather użyj `/revoke` i wpisz nowy token w sekretach.

### 4.2. Tło strony (obraz, GIF, wideo)

W panelu admina, nad kalendarzem, jest rozwijana sekcja **„Tło strony”**:
- **Plik:** JPG, PNG, WebP, GIF, MP4 lub WebM, do 20 MB. Wideo i GIF odtwarzają się w pętli, bez dźwięku.
- **Widoczność tła:** suwak 0 do 100% (opacity). Podgląd zmienia się od razu, a zapis idzie sam po chwili.
  Dobrze sprawdza się 20 do 40%, żeby nagłówek był czytelny.
- **Usuń tło** kasuje plik i ustawienia. Zamiana tła na nowe usuwa stary plik automatycznie.

Przy nowej instalacji kubełek na pliki tworzy `schema.sql`. Gdyby się nie utworzył, dodaj go ręcznie:
**Storage, New bucket**, nazwa `backgrounds`, zaznaczone **Public bucket**.

**Rozmiar pliku ma znaczenie.** Każdy odwiedzający pobiera tło, a darmowy plan Supabase ma limit transferu
(na dziś 5 GB miesięcznie, sprawdź aktualne zasady). Plik 20 MB pobrany 250 razy zużywa cały limit. Dlatego:
- trzymaj tło małe, najlepiej do 5 MB,
- zamiast GIF-a użyj krótkiego MP4 lub WebM, bo jest wielokrotnie lżejszy,
- obrazy zmniejsz wcześniej (np. szerokość 1920 px).

U osób z włączonym w systemie ograniczeniem ruchu wideo i GIF-y nie pokazują się (zwykły obraz tak).
Jeśli masz je włączone u siebie, możesz nie widzieć animacji.

### 4.3. Zamykanie dni

W panelu admina kliknij dzień i zaznacz **„Oznacz dzień jako zajęty”**, gdy reszta dnia ma być niedostępna
(np. zostały 3 godziny w nocy). Wtedy:
- w kalendarzu dzień jest czerwony,
- znajomi widzą tylko umówione spotkania (czerwone w paski, oczekujące pomarańczowe), a resztę godzin jako szarą i nieaktywną,
- formularz zapisu jest ukryty, a baza odrzuca próby zapisu na ten dzień,
- Ty nadal możesz dodawać spotkania w zamkniętym dniu. Odznaczenie pola otwiera dzień z powrotem.

### 4.4. Aplikacja na telefonie (PWA)

Strona da się zainstalować jak aplikacja: ma własną ikonę i otwiera się bez paska przeglądarki.
Nadal potrzebuje internetu, bo kalendarz zawsze pobiera aktualne dane (nieaktualny kalendarz pozwoliłby wybrać zajęty termin).
Na telefon trafiają tylko pliki wyglądu, więc po wdrożeniu nowa wersja pojawia się sama przy następnym otwarciu.

- **Android (Chrome):** menu `⋮`, „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”. Po przytrzymaniu ikony jest skrót „Panel admina”.
- **iPhone (Safari):** Udostępnij, „Dodaj do ekranu głównego”. Aplikacja na iPhonie ma osobną pamięć niż Safari,
  więc w panelu admina zalogujesz się w niej od nowa. Skrótu do panelu na iPhonie nie ma.

**Własna ikona.** Teraz jest tymczasowa (litera L). Podmień pliki w `public/` na swoje, **z tymi samymi nazwami i rozmiarami**:

| Plik | Rozmiar | Uwagi |
|---|---|---|
| `icons/icon-512.png` | 512x512 | ikona główna |
| `icons/icon-192.png` | 192x192 | ta sama grafika, mniejsza |
| `icons/maskable-512.png` | 512x512 | pełne tło do krawędzi, ważne elementy w środkowych 80% (Android przycina ikonę) |
| `icons/apple-touch-icon.png` | 180x180 | iPhone, **bez przezroczystości** (przezroczyste miejsca zrobią się czarne) |
| `icons/favicon-48.png` | 48x48 | karta przeglądarki |
| `favicon.svg` | dowolny | karta przeglądarki |

Po wdrożeniu nowej ikony na telefonie trzeba aplikację odinstalować i dodać jeszcze raz, bo system pamięta starą.

**Jak sprawdzić, że działa:** w Chrome na komputerze F12, zakładka **Application**: w **Manifest** nie powinno być błędów,
a w **Service Workers** status ma być „activated”. Instalacja działa tylko na `https` (czyli na Vercelu),
a service worker włącza się tylko w wersji opublikowanej, nie w `npm run dev`.

### 4.5. Ochrona przed spamem

Działa od razu:
- jedno imię lub jeden e-mail może mieć maksymalnie 4 przyszłe zapisy (także oczekujące),
- ukryte pole-pułapka na boty.

Opcjonalnie **kod zaproszenia**, który znajomi wpisują przy zapisie. Włączysz go w SQL Editorze:

```sql
insert into public.app_settings (key, value) values ('invite_code', 'twoj-kod')
on conflict (key) do update set value = excluded.value;
```

Wyłączysz: `delete from public.app_settings where key = 'invite_code';`

---

## 5. Obsługa na co dzień

**Nowa prośba.** Dostajesz wiadomość na Telegramie (jeśli skonfigurowany) albo widzisz ją w panelu na liście „Do zatwierdzenia”
(klik przenosi do dnia).
- **Zaakceptuj** zmienia status na zajęty i wysyła e-mail. Jeśli wysyłka się nie uda, spotkanie i tak zostaje zatwierdzone,
  a przy zapisie pojawia się przycisk **„Wyślij e-mail ponownie”**.
- **Usuń** (w panelu) kasuje prośbę po cichu, znajomy nie dostaje wiadomości. **Odrzuć** (na Telegramie) może wysłać mu informację.

**Własne spotkania.** W panelu kliknij dzień, wybierz początek i koniec (albo „Zajmij cały dzień”), wpisz tytuł i dodaj.
Takie spotkanie jest od razu zatwierdzone.

**Odwołanie przez znajomego.** Używa linku, który dostał po zapisie i w mailu. Termin od razu robi się wolny.
Ty możesz usunąć dowolny zapis w panelu.

**Jak działa wybór godzin.** Klikasz godzinę początku, potem godzinę końca. Godziny krótsze niż 1 h od początku są
zablokowane, a koniec nie może wejść na zajęty termin (może kończyć się tuż przed nim). Kliknięcie początku jeszcze raz
zdejmuje wybór.

---

## 6. Aktualizacja działającej strony

Jeśli strona już działa i dostajesz nową wersję plików, zrób to w tej kolejności:

1. **Migracje SQL.** W Supabase (SQL Editor) uruchom **tylko te z poniższej tabeli, których jeszcze nie uruchamiałaś**,
   zawsze od góry do dołu. Każdy plik wklejasz w osobnym zapytaniu.
2. **Nowe zmienne i sekrety**, jeśli nowa wersja ich wymaga (np. EmailJS albo sekrety bota).
3. **Funkcja bota:** jeśli zmienił się `supabase/functions/booking-bot/index.ts`, wklej go ponownie w edytorze funkcji i wdróż.
4. **Strona:** podmień pliki w repozytorium. Vercel wdroży sam po wrzuceniu na GitHub.

| Kolejność | Plik | Co dodaje | Gdy pominiesz |
|---|---|---|---|
| 1 | `migration_moderacja.sql` | statusy „oczekuje” i „zatwierdzone”, e-mail znajomego | zapisy przestaną działać |
| 2 | `migration_min_1h.sql` | minimum 1 godzina w bazie (zastępuje dawną wersję na 30 minut) | baza przyjmie krótsze zapisy z pominięciem formularza |
| 3 | `migration_telegram.sql` | kolumna do powiadomień Telegram | bot nie wyśle powiadomień |
| 4 | `migration_zamkniete_dni.sql` | zamykanie dni | zamknięte dni nie będą widoczne |
| 5 | `migration_tlo.sql` | tło strony i kubełek na pliki | nie wgrasz tła |

**Ważne:** nigdy nie uruchamiaj starszej migracji po nowszej. Nowsze pliki zawierają pełniejszą wersję funkcji zapisu,
a starsza ją nadpisze i część zabezpieczeń przestanie działać.

Nowa strona wdrożona **przed** migracją nie psuje się, ale funkcje z brakującej migracji po prostu nie działają,
dopóki jej nie uruchomisz.

---

## 7. Ustawienia i własny wygląd

W `src/config.js`:
- `SITE_TITLE`, `SITE_LEDE`: nazwa i opis strony (nazwa jest też w `index.html` i `public/manifest.webmanifest`),
- `DAY_START`, `DAY_END`: godziny, w których można się umawiać (domyślnie całą dobę, 0 do 24),
- `STEP`: co ile minut wybiera się godziny (30 albo 60),
- `MIN_DURATION`: minimalna długość spotkania w minutach (domyślnie 60). Tę samą wartość ma baza, więc zmiana wymaga też
  poprawienia liczby `60` w `supabase/schema.sql` (ograniczenie `bookings_min_duration` i funkcja `book_slot`) oraz uruchomienia poprawionego SQL.

Wygląd (kolory, animacje) jest w `src/styles.css`. Kolory statusów to zmienne na początku pliku
(`--free`, `--partial`, `--pending`, `--full`).

---

## 8. Rozwiązywanie problemów

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| Strona pokazuje „Brakuje konfiguracji” | Brakuje zmiennych `VITE_SUPABASE_URL` lub `VITE_SUPABASE_ANON_KEY`. Dodaj je w `.env` (lokalnie) albo w Vercelu i **wdróż ponownie**. |
| „Nie udało się wczytać kalendarza” | Zły adres lub klucz Supabase albo nie uruchomiono `schema.sql`. Sprawdź krok 1 i zmienne. |
| Po zalogowaniu „Brak dostępu” | Konto nie jest na liście adminów. Wykonaj krok 1.4 (polecenie `insert into public.admins`) z poprawnym e-mailem. |
| Błąd SQL `syntax error at or near "```"` | Wkleiłaś razem z poleceniem znaczniki bloku kodu. Wklej tylko linie SQL. |
| Zatwierdzone, ale „nie udało się wysłać e-maila” | Komunikat zawiera kod i opis błędu z EmailJS, np. `422: The recipients address is empty`. Zwykle w szablonie pole **To Email** nie ma dokładnie `{{to_email}}` albo w Vercelu jest ID innego szablonu niż ten, który edytujesz. Zapisz szablon (Save), porównaj ID. Przy błędach „service ID is invalid” lub „Template not found” sprawdź ID, a przy Gmailu użyj „Reconnect” w Email Services. Potem kliknij **Wyślij e-mail ponownie**. |
| Zmieniłaś zmienne i nic się nie zmieniło | Po zmianie zmiennych w Vercelu trzeba wdrożyć stronę ponownie. Lokalnie zrestartuj `npm run dev`. |
| Mail trafia do spamu | Zdarza się przy pierwszych wiadomościach z nowego nadawcy. Odbiorca klika „To nie jest spam” i dodaje Cię do kontaktów, a w szablonie lepiej zadziała dłuższa, zwykła treść niż sam link. Strona przy potwierdzeniu prosi też o sprawdzenie folderu spam. |
| Telegram: „invalid webhook URL” | Adres `setWebhook` ma błąd: podwójne `https://`, zostawione słowa TOKEN, SEKRET lub PROJEKT, spacje albo nawiasy. |
| Telegram: brak wiadomości o prośbach | Sprawdź: wyłączone „Verify JWT” w funkcji, wszystkie sekrety, wynik `https://api.telegram.org/botTOKEN/getWebhookInfo`, logi (Edge Functions, `booking-bot`, Logs). Kod `401` w logach oznacza niezgodny sekret webhooka. |
| Telegram: „Brak uprawnień” po kliknięciu | Zły `TELEGRAM_CHAT_ID`. Napisz do bota `/start` i wpisz ID, które poda. |
| Nie wgrywa się tło | Nie uruchomiono `migration_tlo.sql` (albo `schema.sql`), plik jest za duży (limit 20 MB) lub ma nieobsługiwany format. |
| Zamknięte dni nie są widoczne | Nie uruchomiono `migration_zamkniete_dni.sql`. |
| Wersja zbudowana bez zmiennych pokazuje tylko ekran konfiguracji | To normalne: zmienne `VITE_` trafiają do strony podczas budowania, więc muszą być ustawione przed `npm run build` lub wdrożeniem. |
| Strona przestała działać po dłuższej przerwie | Darmowe projekty Supabase mogą być wstrzymywane po dłuższym braku aktywności. Wejdź do panelu Supabase i wznów projekt. Aktualne zasady sprawdź na supabase.com. |

---

## 9. Bezpieczeństwo

- Klucz `anon` Supabase jest publiczny z założenia. Dane chronią reguły w bazie (RLS): bez logowania nikt nie odczyta
  imion i e-maili, nie zatwierdzi ani nie usunie cudzych zapisów.
- **Tajne** są: token bota Telegram, Private Key EmailJS i klucz `service_role` Supabase. Nie wklejaj ich w publicznych
  miejscach ani w rozmowach, nie dodawaj do repozytorium. Jeśli któryś wyciekł, wygeneruj nowy (token bota: `/revoke` w BotFather).
- Plik `.env` jest w `.gitignore`.
- Klucze EmailJS używane w przeglądarce są widoczne dla każdego, kto zajrzy w kod strony. Ktoś zaawansowany mógłby użyć ich
  do wysłania Twojego szablonu na dowolny adres i zużyć miesięczny limit (treści nie da się podmienić). Z tego, co wiem, ograniczenie
  do domeny jest funkcją płatnych planów EmailJS. Gdyby doszło do nadużyć, wygeneruj nowy Public Key w panelu EmailJS.
- Dane znajomych (imię, e-mail, notatka) widzi tylko admin. Gdy ktoś poprosi o usunięcie, usuń jego zapisy w panelu.

---

## 10. Dla programistów

Stack: Vite + React, Supabase (baza, logowanie, pliki, funkcja Edge), EmailJS, Vercel.

```
index.html, package.json, .env.example
public/                      manifest, service worker, ikony
src/
  config.js                  ustawienia strony
  App.jsx, main.jsx, pwa.js
  components/                kalendarz, panel dnia, wybór godzin, tło
  pages/                     strona publiczna, panel admina, odwołanie zapisu
  lib/                       daty, e-mail, bot, tło
supabase/
  schema.sql                 cała baza (nowa instalacja)
  migration_*.sql            aktualizacje starszych instalacji
  functions/booking-bot/     bot Telegram (jeden plik index.ts)
tests/                       testy interfejsu, bota i PWA
```

- `npm run dev` uruchamia stronę lokalnie, `npm run build` buduje wersję produkcyjną, `npm test` uruchamia testy.
- Testy sprawdzają interfejs, logikę bota (na atrapach Telegrama, EmailJS i bazy) oraz manifest i service worker.
  Nie łączą się z prawdziwym Supabase, EmailJS ani Telegramem.
- Routing opiera się na haszu: `#/` strona publiczna, `#/admin` panel, `#/anuluj/<token>` odwołanie zapisu.
