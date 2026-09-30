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
