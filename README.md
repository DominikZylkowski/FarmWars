Pixel Farm Game

Pixelowa gra strategiczna osadzona w minimalistycznym świecie kafelków. Gracz zarządza swoją farmą, sadzi trawę, unika przeszkód i rozwija poziomy trudności w miarę postępów.

Jak grać
Plansza składa się z siatki kafelków (domyślnie 5x10).
Kliknij na kafelek, aby postawić trawę lub przeszkodę (np. kamień).
Celem gry jest pokrycie określonej liczby kafelków trawą na każdym poziomie, unikając przeszkód.
Po ukończeniu poziomu odblokowujesz kolejny, z większą liczbą trawy i przeszkód.
Naciśnięcie ESC wstrzymuje grę i pauzuje licznik poziomu.

System punktacji

Wartości punktowe określa `GAME_CONFIG.scoring` w `js/config.js`: 1 punkt za pełną sekundę aktywnej gry, 10 za postawiony przedmiot, 20 za zwykłego robaka i 35 za bossa. Sadzonka jest liczona po posadzeniu; jej wzrost w drzewo nie jest kolejnym wytworzeniem. Menu, samouczek i pauza nie naliczają czasu. Niepełne sekundy są zachowywane między pauzami. Wynik zostaje zamrożony po wygranej lub przegranej, a nowa gra go resetuje.

`js/score.js` zawiera logikę niezależną od DOM. `getScoreSummary()` zwraca kopię danych gotową do `JSON.stringify()`: wersję schematu, łączny wynik, aktywny czas w sekundach (z częścią ułamkową), liczby przedmiotów i przeciwników, ich podział według typów, punkty kategorii `time`, `items`, `enemies` oraz status `not_started`, `active`, `won` lub `lost`. Pauza zachowuje status `active`. Aktualizacja interfejsu znajduje się osobno w `updateScoreUI()` w `js/main.js`. Backend i ranking nie są jeszcze podłączone.

Testy punktacji i jej integracji z grą: `node tests/score.test.cjs`.

Zebranie dojrzałego drzewa daje dodatkowo 12 punktów, zgodnie z `GAME_CONFIG.scoring.resources.tree`. Eksport obejmuje też `resourcesCollected`, `resourcesByType` i kategorię punktów `resources`. Każde drzewo jest zaliczane tylko raz; ponownie wyhodowane drzewo na tym samym polu jest osobnym zbiorem.

Zapisywanie wyników i ranking lokalny

Po wygranej lub przegranej wpisz nazwę (3–20 znaków) i wybierz „ZAPISZ WYNIK”. Nie ma minimalnego wyniku. Ostatnia zatwierdzona nazwa jest podpowiadana przy kolejnym zapisie. Ranking można otworzyć z menu oraz z ekranu końcowego.

`js/ranking.js` udostępnia asynchroniczny adapter `rankingRepository`: `saveResult(nickname, summary)`, `getLeaderboard()`, `getHistory()` i `getLastNickname()`. Dane znajdują się w localStorage pod kluczem `farmwarsRankingV1`. Wszystkie zatwierdzone rozgrywki są zachowywane, a główna tabela pokazuje najlepszą rozgrywkę każdego `playerId`, malejąco według Score. Wygrana nie daje pierwszeństwa; remis oznacza wspólne miejsce.

Lokalne profile mają wygenerowane `playerId`. Powtórne użycie tej samej nazwy wybiera istniejący lokalny profil; inna nazwa tworzy nowy profil. Nazwa nie jest globalnym identyfikatorem ani kluczem rekordu. Każda rozgrywka otrzymuje osobny `runId`; ponowny zapis tego identyfikatora jest blokowany. Rekord zawiera pełne statystyki, nazwę, identyfikator gracza, datę zakończenia (`finishedAt`), datę zapisu (`savedAt`) i status `won` lub `lost`. Daty są przechowywane w ISO UTC, a wyświetlane w lokalnej strefie przeglądarki.

`js/ranking_ui.js` odpowiada za formularz i tabelę; pseudonimy wyświetla przez `textContent`. Adapter można później zastąpić wywołaniami backendu bez zmiany interfejsu. Obecny ranking obejmuje wyłącznie pamięć tej przeglądarki; globalna identyfikacja i weryfikacja wyników pozostają zadaniem przyszłego backendu.

Testy rankingu: `node tests/ranking.test.cjs`.
