FarmWars

Pixelowa gra tower defense w HTML, JavaScript i SCSS. Gracz zbiera surowce, uprawia drzewa i buduje obronę domu przed dziesięcioma falami robaków.

Jak grać
Plansza składa się z siatki kafelków (domyślnie 5x10).
Klikaj trawę, kamień i dojrzałe drzewa, aby zbierać nasiona, kamień i drewno. Przeciągaj dostępne przedmioty ze sklepu na wolne pola. Armaty strzelają automatycznie; robaki można również atakować kliknięciem.
Po odparciu fali rozpoczyna się przygotowanie do kolejnej. Dotarcie robaka do domu kończy grę porażką; odparcie dziesiątej fali daje zwycięstwo.
Menu i ESC pauzują rozpoczętą grę. Ukrycie karty także włącza pauzę; po powrocie gracz sam wznawia rozgrywkę. Ukończony samouczek jest pomijany przy kolejnym starcie.

Uruchamianie i testy

`npm ci` instaluje narzędzie Sass. `npm run sass-compile` generuje CSS; `npm run watch` obserwuje zmiany SCSS. Frontend można otworzyć lokalnie lub uruchomić przez Apache/XAMPP z prywatnym zapisem PHP.

`npm test` uruchamia testy Score, rankingu, cyklu gry, walidacji danych i statyczne kontrole SQL. Nie instaluje bibliotek ani nie łączy się z bazą. Symulowany DOM i zegar nie zastępują testów rzeczywistej przeglądarki. Node.js musi obsługiwać wbudowany moduł `node:test` (testowano na Node.js 24).

`js/runtime.js` zarządza jedną pętlą animacji, zegarem aktywnej gry oraz timerami. Kolejność skryptów w HTML musi zostać zachowana.

Szybkość rozgrywki

Istniejący suwak menu wybiera dokładnie: 0,75×, 1,00×, 1,25×, 1,50×, 1,75×, 2,00×, 2,25×, 2,50×, 2,75× i 3,00×. Domyślnie jest 1,00×; poprawna preferencja jest odczytywana z localStorage (`gameSpeed`). Dawne ustawienie `gameVolume` nie steruje tym suwakiem i nie jest usuwane z pamięci.

Przedziały: Easy 0,75×, Normal 1,00×–1,50×, Hard 1,75×–2,25×, Very Hard 2,50×–3,00×. Wartość i przedział odświeżają się w menu, a mnożnik jest widoczny także obok czasu/fali w topbarze. Natywny `input[type=range]` zachowuje mysz, dotyk i klawiaturę; jego dotychczasowe ID `volumeRange` pozostaje dla zgodności DOM.

Jedynym mnożnikiem sterującym mechanikami jest `gameState.gameSpeed`, zmieniany przez `setGameSpeed()`. Zegar symulacji `getGameTime()` rozlicza każdy odcinek według obowiązującej w nim szybkości; delta ruchu pochodzi z tego samego zegara. Skalowane są ruch, pociski, ostrzał, generowanie przeciwników i zasobów, przygotowanie oraz wzrost. Animacja strzału i opcjonalna animacja obrotu korzystają z tej samej wartości przez CSS `--game-speed`; pauza zatrzymuje je. Ozdobne pulsowanie topbara pozostaje niezależne od mechanik.

Score mierzy osobno rzeczywisty aktywny czas, bez mnożnika: 60 sekund przy 3× daje 60 punktów za czas, choć symulacja upływa o 180 sekund. Pauza zatrzymuje oba zegary, a zmiana mnożnika nie przelicza wstecz wcześniejszych odcinków. Ceny, HP, obrażenia i stawki punktowe nie zmieniły się.

System punktacji

Wartości punktowe określa `GAME_CONFIG.scoring` w `js/config.js`: 1 punkt za pełną sekundę aktywnej gry, 10 za postawiony przedmiot, 20 za zwykłego robaka i 35 za bossa. Sadzonka jest liczona po posadzeniu; jej wzrost w drzewo nie jest kolejnym wytworzeniem. Menu, samouczek i pauza nie naliczają czasu. Niepełne sekundy są zachowywane między pauzami. Wynik zostaje zamrożony po wygranej lub przegranej, a nowa gra go resetuje.

`js/score.js` zawiera logikę niezależną od DOM. `getScoreSummary()` zwraca kopię danych gotową do `JSON.stringify()`: wersję schematu, `rulesetId`, identyfikator partii, łączny wynik, aktywny czas w sekundach (z częścią ułamkową), liczniki i punkty kategorii oraz status `not_started`, `active`, `won` lub `lost`. Pauza zachowuje status `active`. Aktualizacja interfejsu znajduje się osobno w `updateScoreUI()` w `js/main.js`. Tryb lokalny i tryb online korzystają z osobnych historii.

Testy punktacji i jej integracji z grą: `node tests/score.test.cjs`.

Zebranie dojrzałego drzewa daje dodatkowo 12 punktów, zgodnie z `GAME_CONFIG.scoring.resources.tree`. Eksport obejmuje też `resourcesCollected`, `resourcesByType` i kategorię punktów `resources`. Każde drzewo jest zaliczane tylko raz; ponownie wyhodowane drzewo na tym samym polu jest osobnym zbiorem.

Zapisywanie wyników i ranking lokalny

Po wygranej lub przegranej wpisz nazwę (3–20 znaków) i wybierz „ZAPISZ WYNIK”. Nie ma minimalnego wyniku. Ostatnia zatwierdzona nazwa jest podpowiadana przy kolejnym zapisie. Ranking można otworzyć z menu oraz z ekranu końcowego.

`js/ranking.js` udostępnia asynchroniczny adapter `rankingRepository`: `saveResult(nickname, summary)`, `getLeaderboard()`, `getHistory()` i `getLastNickname()`. Dane znajdują się w localStorage pod kluczem `farmwarsRankingV1`. Wszystkie zatwierdzone rozgrywki są zachowywane, a główna tabela pokazuje najlepszą rozgrywkę każdego `playerId`, malejąco według Score. Wygrana nie daje pierwszeństwa; remis oznacza wspólne miejsce.

Lokalne profile mają wygenerowane `playerId`. Powtórne użycie tej samej nazwy wybiera istniejący lokalny profil; inna nazwa tworzy nowy profil. Nazwa nie jest globalnym identyfikatorem ani kluczem rekordu. Każda rozgrywka otrzymuje osobny `runId`; ponowny zapis tego identyfikatora jest blokowany. Rekord zawiera pełne statystyki, nazwę, identyfikator gracza, datę zakończenia (`finishedAt`), datę zapisu (`savedAt`) i status `won` lub `lost`. Daty są przechowywane w ISO UTC, a wyświetlane w lokalnej strefie przeglądarki.

`js/ranking_ui.js` odpowiada za formularz i tabelę; pseudonimy wyświetla przez `textContent`. Adapter przełącza się między lokalną pamięcią i API. Publiczna weryfikacja wyników pozostaje zadaniem późniejszego etapu.

Testy rankingu: `node tests/ranking.test.cjs`.

Nowe wyniki są sprawdzane pod kątem zgodności punktów, liczników, wersji reguł i typów danych. Stare wyniki bez wersji reguł pozostają odczytywane i nie są przeliczane według aktualnych stawek. Uszkodzony JSON lub niespójna historia powodują komunikat błędu; gra nie nadpisuje ani nie usuwa takich danych.

Zapisy są kolejkowane; gdy przeglądarka udostępnia Web Locks, blokada obejmuje również inne karty. Przy niedostępnym API pozostaje serializacja w jednej karcie, bez gwarancji transakcji między kartami. Jest to ochrona przed przypadkowymi konfliktami, nie zabezpieczenie przed użytkownikiem modyfikującym JavaScript lub pamięć przeglądarki.

`database/farmwars.sql` to niewykonany schemat do przyszłego importu. Wyniki są domyślnie niezweryfikowane i wyłączone z rankingu; przyszły PHP musi jawnie zatwierdzić je w transakcji. `database/.htaccess` blokuje publiczny dostęp do tego katalogu w Apache, jeśli serwer respektuje pliki `.htaccess`.


Metadane szybkości i przyszły backend

Nowe podsumowania mają `schemaVersion: 2` oraz `initialGameSpeed`, `gameSpeed` (ostatnia szybkość tej partii), `simulationTimeSeconds` i `speedHistory`. Historia zaczyna się od czasu 0, a każda rzeczywista zmiana dodaje wpis, np.:

```json
[
  { "atActiveSeconds": 0, "atSimulationSeconds": 0, "gameSpeed": 1 },
  { "atActiveSeconds": 20, "atSimulationSeconds": 20, "gameSpeed": 2 }
]
```

Zmiany w pauzie mają ten sam aktywny czas i nie zwiększają obu liczników. Po zakończeniu historii nie zmienia nawet wybór innej preferencji dla następnej gry. `rankingRepository` zachowuje te dane i sprawdza ciągłość historii oraz zgodność całkowitego czasu symulacji z jej odcinkami. Wersja 1 nadal jest obsługiwana; dla starych wyników szybkość jest nieznana, nie dopisywana jako 1×.

Przyszłe PHP może zapisać te metadane w już zaprojektowanym `run_statistics.extra_stats` jako obiekt `speed` z własną wersją formatu, a `game_runs.active_time_ms` pozostawić czasem rzeczywistym. Nie wymaga to obecnie zmiany SQL. Serwer powinien sprawdzać dopuszczalne mnożniki, kolejność i czasy wpisów oraz całkę szybkości; sam spójny dziennik przesłany przez JavaScript nadal nie dowodzi uczciwości gry. Polityka porównywania partii o różnych szybkościach pozostaje decyzją przyszłego rankingu — bieżący Score nie jest normalizowany mnożnikiem.

Regresje szybkości: `node --test tests/speed.test.cjs`. Testy używają symulowanego zegara i DOM; kontrola natywnego suwaka i reguł responsywnych nie jest testem fizycznego telefonu. Próba otwarcia lokalnego podglądu w przeglądarce narzędziowej zakończyła się timeoutem; wygląd i fizyczne gesty dotyku wymagają weryfikacji w przeglądarce użytkownika.

## Etap 1 — prywatny zapis w XAMPP

Tryb online zapisuje historię sesji gościa w MariaDB/MySQL. Widok „Ranking” pokazuje najlepsze prywatne wyniki profili tej sesji. Pełną historię udostępnia API. Wyniki mają `validation_level=client_reported` i `is_ranked=0`.

1. W XAMPP Control Panel uruchom Apache i MySQL. Wymagane są PHP 8+, aktywne `pdo_mysql` oraz MariaDB 10.4+ lub MySQL 8.0.16+.
2. Otwórz `http://localhost/phpmyadmin/`. Wybierz **Import**, wskaż `database/farmwars.sql`, wybierz format **SQL** i wykonaj import. Plik tworzy bazę `farmwars` i jest przeznaczony do pustej instalacji. Jeśli masz już dane, zachowaj bazę i przygotuj osobną migrację. Aby importować pod inną nazwą, usuń polecenia `CREATE DATABASE` i `USE` w kopii pliku i wybierz docelową bazę przed importem.
3. W phpMyAdmin na karcie **SQL** utwórz konto aplikacji. Zastąp tekst w nawiasach ostrych własnym hasłem.

   ```sql
   CREATE USER 'farmwars_app'@'localhost' IDENTIFIED BY '<własne-hasło>';
   GRANT SELECT, INSERT, UPDATE ON farmwars.* TO 'farmwars_app'@'localhost';
   ```

4. Utwórz katalog `C:/xampp/farmwars-sessions` poza `htdocs` i przyznaj zapis użytkownikowi Apache. Utwórz `C:/xampp/apache/conf/extra/farmwars-local.conf` z poniższą konfiguracją. W `C:/xampp/apache/conf/httpd.conf` dodaj `Include "conf/extra/farmwars-local.conf"`, po czym uruchom ponownie Apache. Dopasuj port w DSN do swojego XAMPP.

   ```apache
   <Location "/farmwars/api/">
       Require local
       SetEnv FARMWARS_DSN "mysql:host=localhost;port=3306;dbname=farmwars;charset=utf8mb4"
       SetEnv FARMWARS_DB_USER "farmwars_app"
       SetEnv FARMWARS_DB_PASSWORD "<własne-hasło>"
       SetEnv FARMWARS_SESSION_PATH "C:/xampp/farmwars-sessions"
   </Location>

   <LocationMatch "^/farmwars/(?:backend|database|tests)(?:/|$)">
       Require all denied
   </LocationMatch>
   ```

5. W repozytorium wykonaj `npm ci` i `npm run sass-compile`. Do `C:/xampp/htdocs/farmwars` skopiuj `index.html` oraz katalogi `api/`, `backend/`, `js/`, `assets/` i wygenerowany `styles/css/`. Zachowaj strukturę i `backend/.htaccess`. Otwórz `http://localhost/farmwars/`.
6. Rozegraj partię, zapisz wynik i otwórz „Ranking”. W phpMyAdmin sprawdź `game_runs`, `run_statistics` i `run_scores`. Okno prywatne utworzy osobną sesję z pustą historią.

API działa pod `/farmwars/api/index.php?action=…`. `POST session` przyjmuje `{}` i zwraca CSRF. `POST start` przyjmuje `clientRunId` i zwraca serwerowy `runId`. `POST result` przyjmuje `runId`, `nickname` i `summary`. Start i zapis wymagają `X-CSRF-Token`. `GET history&offset=0` zwraca do 100 wyników i `nextOffset`. Prywatne operacje wymagają ciasteczka sesji.

Tryb lokalny działa po otwarciu `index.html` z dysku lub przez `http://localhost/farmwars/?mode=local`. Korzysta z dotychczasowego localStorage. Po awarii API rozgrywka trwa, a formularz pokazuje błąd i pozwala ponowić zapis. Przełączenie na tryb lokalny przez adres otwiera nową stronę. Historia online należy do bieżącej sesji gościa. Usunięcie ciasteczka lub wygaśnięcie sesji oznacza utratę dostępu do tej historii.

### Testy etapu 1

- `npm test` uruchamia testy gry.
- `C:/xampp/php/php.exe tests/result-validation.php` sprawdza obliczenia i odrzucanie błędnych podsumowań.
- W PowerShell ustaw `$env:FARMWARS_TEST_URL = 'http://localhost/farmwars/api/index.php'` na instalację z **testową bazą**. Opcjonalne `FARMWARS_TEST_FAILURE_URL` wskazuje drugą instancję API z niedostępną bazą. Uruchom `node --test tests/api.integration.test.cjs`. Test bez odpowiedniego adresu zostanie pominięty. Scenariusz zapisu tworzy testowe sesje i rekordy.

## Etap 2 — model rozgrywki

`js/game_model.js` przechowuje pola i przetwarza akcje, a `js/war_logic.js` obsługuje walkę i fale. Pola mają stałe ID według kolejności wierszy. Obiekty, wrogowie i pociski dostają rosnące identyfikatory w obrębie partii. Sadzonka zachowuje ID po wzroście. `js/game_view.js` odwzorowuje stan na istniejące elementy i klasy CSS.

Silnik przyjmuje czas monotoniczny w milisekundach przez `advanceGameTo(now)` i używa kroku symulacji 10 ms. Pętla przeglądarki dostarcza czas i odświeża widok. Skrypt bez DOM może wywoływać tę samą funkcję według własnego harmonogramu. Przy długim zastoju w aktywnej karcie silnik rozlicza kolejne kroki zamiast stosować dawny limit ruchu pojedynczej klatki. Pauza i ukrycie karty nadal zatrzymują zegar. Do powtórzenia partii potrzebne są to samo ziarno xorshift32, geometria, reguły, czasy akcji i ich kolejność. Tasowanie kolejki fal używa Fishera–Yatesa, więc konkretna kolejność bossów może różnić się od wcześniejszego losowania. Skład fal i stawki pozostały te same.

Geometria używa wymiarów odniesienia przekazanych przez widok przy starcie. Zachowuje dotychczasowy próg wejścia na pole i oblicza prostokąt obróconego pocisku w jednostkach logicznych. Zmiana rozmiaru okna w trakcie partii skaluje rysowanie i pozostawia kolizje w geometrii zapisanej na starcie. Testy porównują próg kontaktu i kolizję dla pól o szerokości 48, 100 i 135. Trafienie jest rozliczane względem pozycji symulowanej. Wcześniej odczyt prostokąta wroga mógł uwzględniać opóźnienie animacji CSS, dlatego dokładna chwila trafienia może się różnić.

`exportGameState()` zwraca kopię migawki JSON w wersji 1. Zawiera stan planszy, zasobów, walki, punktów, kolejkę timerów, zegary, ID i stan generatora. `restoreGameState(snapshot, now)` odtwarza migawkę z czasem monotonicznym nowego środowiska. W przeglądarce `restoreGameView(snapshot)` odświeża też widok. Migawki są interfejsem silnika i są oddzielne od formatu podsumowania v2 zapisywanego przez PHP.

## Etap 3 — podgląd ekonomii serwerowej

Po instalacji etapu 1 zaimportuj `database/003-economy.sql` do wybranej bazy FarmWars. Otwórz `http://localhost/farmwars/?mode=economy`. Podgląd rozlicza ekonomię przygotowań w PHP i kończy się przed walką. Pełna gra z lokalną walką i niezweryfikowanym zapisem jest dostępna pod dotychczasowym adresem.


## Etap 4 — pełna gra online

Po migracji 003 zaimportuj `database/004-online.sql` do bazy FarmWars. Otwórz `http://localhost/farmwars/?mode=online` lub wybierz link w menu. PHP rozstrzyga pełną partię i zapisuje wynik automatycznie w prywatnej historii.
