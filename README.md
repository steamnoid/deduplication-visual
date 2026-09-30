# Deduplication for High Performance Storage Systems — prezentacja wizualna

Interaktywna prezentacja + 27 animowanych GIF-ów streszczających książkę **„Data Deduplication for High Performance Storage System"** (Dan Feng, Springer). Po polsku, z nazwami algorytmów po angielsku.

> Prezentacja to własne podsumowanie — nie cytaty. Rysunki i liczby w animacjach są poglądowe (ilustrują zależności, a nie są benchmarkami z książki). Do szczegółów mechanizmów sięgaj do oryginału.

## Uruchomienie

Deck jest czystym statycznym HTML-em — wystarczy otworzyć `index.html` w przeglądarce (działa też z `file://`).

```bash
npm start          # http://localhost:8080 — opcjonalnie, jeśli wolisz serwer
```

Strona z GIF-ami: **`gifs.html`** (galeria 27 animacji, kopiowanie ścieżek, `prefers-reduced-motion` zamienia je na miniatury).

### Sterowanie

| Klawisz | Działanie |
|---|---|
| `→` / spacja | następny slajd |
| `←` | poprzedni slajd |
| `O` | przegląd wszystkich slajdów |
| `F` | pełny ekran |
| klik w animację | pauza / wznowienie |

Animacje mają własne sterowanie: suwaki maski, progu, rozmiaru cache, liczby próbek, przełączniki wariantów. Każda scena ma podpis „co widać”, a liczby na slajdzie zgadzają się z tym, co widać na ekranie.

## Maszyna dedupu — interaktywny symulator

`simulator.html` (przycisk **Symulator** w dolnym pasku decku) to działający symulator systemu dedupu, a nie opis. Bajty są w nim prawdziwe: pula danych to jeden `Uint8Array`, pliki to widoki (offset, długość), więc redundancja jest realnym powtórzeniem bajtów, a granice chunków liczy autentyczny gear hash (tabela 32-bitowa, `h = (h << 1) + G[bajt]`).

Co widać na ekranie: pasek bajtów pliku z głowicą skanowania, lupę na 96 bajtów przy głowicy, stan hasza i maski, histogram długości chunków, filmstrip ostatnich chunków (pomarańczowe = nowe, zielone = znane), siatkę kontenerów na dysku z dziurami, wąski pasek 1024 kubełków indeksu, bilans i cztery wykresy przebiegu.

Czym sterujesz: typ plików (obrazy VM / kod / logi / zrzuty bazy), liczba plików, suwak redundancji, liczba bitów maski (rozmiar chunka), wielkość kontenera, ile plików wygasa przy retencji, prędkość skanu. Przycisk **⌫ Wygasz najstarsze pliki** zmniejsza referencje do chunków i zostawia dziury w kontenerach — czyli pokazuje, skąd bierze się potrzeba garbage collection.

**Trzy strategie indeksu (rozdział 4), wszystkie napisane jako symulacja odpytywania:**

| strategia | model | typowy wynik na 1,9 MB zbioru |
|---|---|---|
| pełna tablica hash | jeden wpis na chunk, jeden losowy odczyt RAM na chunk | 610 KB RAM, 0 seeków, 0 pominiętych duplikatów |
| Extreme Binning | jeden wpis RAM na plik (minimalny fingerprint); trafienie = jeden seek i odczyt indeksu podobnego pliku | 456 B RAM, 21 seeków, 416 pominiętych duplikatów |
| SiLo | reprezentant na segment pliku; trafienie = prefetch całego segmentu (1 seek + seria odczytów sekwencyjnych) | 39 KB RAM, 1721 seeków, 351 pominiętych duplikatów |

Przycisk **⇄ Porównaj strategie na tym zbiorze** liczy chunking raz, a potem przepuszcza te same granice przez wszystkie strategie — dzięki temu porównujesz indeks, a nie chunker. Wynik wychodzi w ~50 ms dla 47 tys. chunków.

### Pełen cykl: 30 dni (`js/sim/timeline.js`)

Przycisk **📅 Pełen cykl: 30 dni** przepuszcza przez symulator miesiąc pracy systemu tym samym chunkerem i indeksem co animacja, tylko bez malowania klatek (~1,3 s dla 40 plików × 30 dni):

1. **codzienny backup** wszystkich plików — plik ma tyle kopii, ile dni ma retencję;
2. **zmiana plików** — treść zmienia się naprawdę (nowe bajty w puli), więc chunking daje inne granice i na dysk ląduje prawdziwa delta; nowy plik wchodzi „od nowa", a nie dziedziczy po starym;
3. **retencja w rotacji per-plik** — codziennie wygasa najstarsza kopia kolejnych plików, więc dziury powstają stopniowo, a nie jednym klifem;
4. **GC** — gdy dziury przekroczą 25% dysku, żywe chunki jadą do nowych kontenerów, stare znikają. GC nie usuwa dziur, tylko przepisuje dane, więc wchodzi do licznika zapisu;
5. **restore** — pliki odtwarzane są ze sklejonych bajtów kontenerów i **porównywane z oryginałem bajt po bajcie**.

Populacja plików jest stała: pierwszego dnia wchodzą wszystkie, potem codziennie jeden znika z produkcji i jeden wchodzi z nową treścią. Bez tej rotacji retencja i GC nie miałyby czego sprzątać.

Co widać w liczbach (24 pliki × 32 KB, chunki 1 KB, retencja 7 dni):

| typ plików | oszczędność | write amplification | przebiegi GC |
|---|---|---|---|
| kod źródłowy | 12,3 : 1 | 1,17× | 2 |
| obrazy VM | 15,1 : 1 | 1,10× | 1 |
| logi | 4,7 : 1 | **1,52×** | 4 |

Logi wygrywają w kategorii „najwięcej przepisuje”: dużo się zmieniają, więc retencja ciągle uwalnia chunki, którym zostaje ostatnia referencja, i GC ma co przenosić. Wykres pokazuje ząb — dziury rosną, GC je zabiera, rosną od nowa.

**Write amplification** liczymy jako (zapis backupów + zapis GC) / (bajty, które faktycznie musiały powstać na dysku). Gdybyśmy podzielili to przez bajty wejściowe, wyszłaby oszczędność z dedupu, a nie koszt pisania.

### Kompresja delta (`js/sim/delta.js`)

Po dedupie chunk, którego nie ma w indeksie, i tak prawie nigdy nie jest nowy w całości — zwykle jest przesuniętą albo lekko zmienioną kopią czegoś, co już leży na dysku. Delta zapisuje operacje `COPY` (skąd skopiować z bajtu docelowego) i `INS` (bajty wstawiane, niesione wewnątrz rekordu). Rekord jest samowystarczalny: restore po miesiącu składa go z samego rekordu i bajtu docelowego, bez dostępu do pliku źródłowego.

Dopasowanie: okno 16 B podpisane gearem, kotwice w bajcie docelowym, dopasowanie rozszerzane w przód i w tył. Deltas zapisujemy tylko wtedy, gdy rekord jest mniejszy niż 85% surowych bajtów — nagłówek i operacje kosztują.

**Wybór celu to 90% sukcesu.** Treść sprzed zmiany siedzi w tym samym miejscu pliku, przesuwa się tylko granice chunków, więc celem jest chunk z poprzedniej wersji pliku o tym samym indeksie. Wariant „ostatni zapisany chunk" wybiera cel na ślepo i prawie nic nie ściska:

| typ plików | bez delty | cel po pozycji | cel: ostatnie chunki |
|---|---|---|---|
| obrazy VM | 687 KB | **471 KB** (−31%) | 663 KB (−3%) |
| kod źródłowy | 892 KB | **699 KB** (−22%) | 866 KB (−3%) |
| logi | 1050 KB | **981 KB** (−7%) | 1031 KB (−2%) |

Na 30 dniach z retencją 7 dni: 2341 prób, 164 zapisane delty, 73% oszczędności na bajtach objętych deltą — ale tylko 7% mniej zapisu w skali miesiąca, bo większość nowych chunków naprawdę jest nowa i delta na nich nie ma czego skrócić.

**Łańcuchy delt to realne ryzyko.** Delta wskazuje na inny chunk, więc gdy retencja zgubi ostatnią referencję do celu, fragment zostaje na bajtach, które GC zaraz usunie. Mamy dwa uczciwe warianty i symulator pokazuje oba:

| | rozwijamy łańcuchy | nie zabezpieczamy |
|---|---|---|
| zapis w miesiącu | 2,0 MB | 1,7 MB |
| dodatkowy zapis na rozwijanie | 320 KB (197 chunków) | 0 |
| pliki nie do odtworzenia po wymuszonym GC | 0 | **22** |

Symulator nie udaje, że problemu nie ma: przycisk **🧹 Wymuś GC i sprawdź restore** zbiera wszystko, co straciło ostatnią referencję, i przelicza restore — część plików przechodzi z ✓ na ✗ RÓŻNICA. Rezygnacja z zabezpieczenia oszczędza 300 KB zapisu i psuje 22 pliki, których już nie da się złożyć.

### Odtwarzanie dnia (`view.drawDay`)

Batch 30 dni nagrywa **ślad dnia**: zdarzenia chunków (nowy na dysk / duplikat pominięty / delta) z ich rozmiarem i pozycją, plus znaczniki tego, co robił system (wygaśnięte kopie, GC). Ślad jest przycięty w locie do ~1400 zdarzeń na dzień, żeby równomiernie pokrywał cały dzień i nie ważył wiele.

W panelu 30 dni klikasz słupek wybranego dnia i patrzysz, jak ten dzień przebiegał: pas zdarzeń (wysokość to realny rozmiar chunka), dwie krzywe narastające — bajty wchodzące i zapisane na dysk — oraz głowa odtwarzania z odczytem na żywo. Przycisk ⏵ odtwarza dzień od zera, suwak przewija.

Dzień 1 i dzień 30 wyglądają zupełnie inaczej i to jest sedno: pierwszego dnia zapisujemy 569 KB przy ratio 1,4:1, trzydziestego 142 KB przy 5,5:1. Backup przestaje pisać i zostaje sam indeks.

### Sprawdzanie bez przeglądarki

`npm test` uruchamia `tools/smoke-drawing.cjs`, który wczytuje silnik w atrapie `window`, przepuszcza 30 dni i sprawdza funkcje rysujące na atrapie kontekstu 2D: layout wykresu, monotoniczność głowy odtwarzania, etykiety, to że dzień 1 zapisuje więcej niż dzień 30, a także to, że **każdy identyfikator używany w `app.js` istnieje w `simulator.html`** i że wszystkie skrypty na stronie są na dysku. Ten ostatni test złapał eksport `drawDay`, którego brakowało w `NS.view`.

`npm run check` dodatkowo robi `node --check` na wszystkich modułach symulatora.

### Warstwa wyjaśnień

Kursor nad słupkiem wykresu 30 dni pokazuje tip z liczbami tego dnia i **jednym zdaniem, co ten dzień znaczył** — pierwszy pełny backup, prawie wszystko duplikat, delta skróciła większość nowych chunków, dziury przekroczyły próg. Zdania są pisane z danych (`view.cozSieDzialo`), a nie z szablonu: gdy model się zmieni, zmienią się razem z nim.

Kursor nad pasem zdarzeń przebiegu dnia pokazuje konkretny chunk: nowy na dysk, duplikat pominięty czy delta, jego rozmiar, ile z tego realnie trafiło na dysk oraz plik i pozycję, z której pochodzi.

`npm test` sprawdza też, że rysowanie i tipy mieszczą się w panelu od 320 do 1400 px — przy 1366×768 szerokość arkusza to ok. 900 px i każda ramka musi w niej zostać.

Etapy symulatora: **S1** bajty → chunki → indeks, **S2** zapis do kontenerów, retencja i dziury, **S3** strategie indeksu i porównanie, **S4** GC, restore i oś czasu 30 dni, **S5** kompresja delta, **S6** odtwarzanie przebiegu dnia, **S7** warstwa wyjaśnień (zrobione).

## Co w środku

53 slajdy, 8 rozdziałów, 27 animacji:

| Rozdział | Animacje |
|---|---|
| Wprowadzenie i backup | `why-dedup`, `file-vs-chunk`, `backup-evolution` |
| Przegląd | `dedup-taxonomy`, `dedup-workflow`, `dedup-scenarios`, `key-tech-map` |
| Chunking | `fixed-vs-cdc`, `gear-hash`, `fastcdc-masks`, `cutpoint-skip` |
| Indeksowanie | `index-bottleneck`, `extreme-binning-similarity`, `bloom-gate`, `silo-two-levels` |
| Rewriting | `fragmentation`, `har-rewrite`, `cabdedup` |
| Bezpieczeństwo | `dedup-leak`, `key-hierarchy` |
| Delta compression | `delta-encoding`, `ddelta`, `dare` |
| Framework | `inline-pipeline`, `gc-amplification`, `near-exact-physical`, `near-exact-logical` |

## Jak to zbudowane

```
index.html            # shell decku
css/deck.css          # design system
js/scenes/core.js     # przestrzeń DECK, paleta, helpery rysujące, gear hash
js/scenes/ch0..8.js   # animacje per rozdział
js/scenes/extra.js    # animacje Extreme Binning i SiLo
js/slides/ch0..8.js   # treść slajdów
js/deck.js            # router, host sceny, przegląd
simulator.html        # interaktywny symulator (S1–S2)
js/sim/engine.js      # pula bajtów, gear hash, odcisk 64-bit, chunker, indeks, kontenery
js/sim/view.js        # warstwa wizualna symulatora (canvas)
js/sim/app.js         # okno, sterowanie, pętla
render.html           # strona-renderka dla eksportu GIF
tools/export-gifs.mjs # headless Chrome -> PNG -> gifenc -> GIF
tools/shots.mjs       # zrzuty slajdów do QA
tools/sheet.py        # kontaktówka posterów
```

Ta sama funkcja `draw(ctx, t, params)` napędza żywy canvas w decku i eksport GIF-ów, więc animacja na slajdzie i GIF wyglądają identycznie. Sceny są deterministyczne (seedowany PRNG, zero `Math.random`), dzięki czemu build jest powtarzalny.

### Ponowne wygenerowanie GIF-ów

```bash
npm install
npm run gifs                 # wszystkie sceny
npm run gifs -- --scene silo-two-levels
npm run gifs -- --poster-only
```

Pipeline: headless Chrome renderuje każdą klatkę → `pngjs` dekoduje → `gifenc` koduje z jedną paletą globalną i różnicowaniem klatek przez przezroczystość. Klatki identyczne scala się w jedną z dłuższym opóźnieniem. Rozmiar: ~5,3 MB dla 27 animacji.

## Dostępność i użyteczność

- ciemny motyw, kontrasty dobrane pod czytanie z dystansu
- animacja nigdy nie jest jedyną informacją — pod każdym kadrem jest jedno zdanie opisujące, co widać
- `prefers-reduced-motion` zatrzymuje animacje w statycznej klatce
- pełna nawigacja klawiaturą, widoczny fokus, `aria-label` na nawigacji

## Uwagi o rzetelności treści

Opisy mechanizmów rozdziałów 3–7 były weryfikowane w literaturze, bo kilka rodzin rozwiązań łatwo pomylić z podobnie wyglądającą. W szczególności:

- **AE** (Asymmetric Extremum) działa **bez hasza** — maksimum w asymetrycznym oknie. Maski pojawiają się dopiero w FastCDC (`MaskS` / `MaskA` / `MaskL`).
- **DDFS** to podejście *lokalnościowe*, **Extreme Binning** — *podobieństwowe* (jeden wpis indeksu na plik, kluczem jest minimalny fingerprint pliku).
- **SiLo** to similarity (reprezentanci segmentów w RAM) + locality (prefetch segmentu), a nie sortowanie wpisów według rozmiaru.
- **HAR** opiera się na danych z poprzedniego backupu i dziedziczeniu rzadkich kontenerów, a nie na klasyfikacji „gorące/ciepłe/zimne”.
- **Near-exact dedup** nie wprowadza fałszywych trafień — indeks trzyma próbki, więc część duplikatów *przepada*; próg to ≥97% dedup ratio wersji dokładnej.

## Licencja

Kod prezentacji: MIT (patrz `LICENSE`). Książka i cytowane prace należą do ich autorów.
