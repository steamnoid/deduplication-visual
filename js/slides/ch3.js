/* slides/ch3.js — rozdział 3: algorytmy podziału na chunki */

(function (D) {
  const L = 'Rozdział 3 · Chunking';

  D.slide({
    id: 'ch3-1', chapter: 3, chapterLabel: L, kicker: 'Problem', num: '3.1',
    title: 'Granice muszą wynikać z treści, nie z adresu',
    lead: 'Jeśli plik przesuniemy o jeden bajt albo wstawimy trzy bajty w środku, granice podziału na stałe bloki przesuną się w całym pliku. Wszystko poniżej miejsca zmiany staje się nowe.',
    scene: 'fixed-vs-cdc',
    caption: '<b>Co widać:</b> animacja wstawia trzy bajty w połowie pliku. Górny wiersz: podział na stałe bloki — ' +
      'zielone pasują, czerwone nie. Dolny wiersz: podział wg zawartości (CDC) — różni się tylko jeden chunk, reszta trafia do indeksu. ' +
      'Przełącznik „Tryb” pozwala zatrzymać się na wariancie przed lub po.',
    points: [
      'Właściwość, której szukamy, nazywa się <strong>dynektycznością</strong>: wstawienie danych nie niszczy podziału dalej.',
      'Druga własność to <strong>przywracanie granic</strong> — po perturbacji algorytm sam wraca do poprawnego podziału.',
      'Poza gear hashem rozdział 3.1 wymienia rodzinę <span class="tag">Rabin / TTTD</span> (opartą na polinomach), ' +
      '<span class="tag">Bimodal CDC</span> oraz podejścia <span class="tag">anchor-driven subchunk</span>. ' +
      'Osobno wyodrębnione są metody <strong>hashless</strong> — bez hasza, oparte na ekstremach — do których należy AE.'
    ]
  });

  D.slide({
    id: 'ch3-2', chapter: 3, chapterLabel: L, kicker: 'Gear hash', num: '3.1',
    title: 'CDC w jednym wzorze: przesunięcie i dodanie',
    lead: 'Gear hash to najczęściej używany punkt podziału w systemach dedupu: mała tablica wartości, jedno przesunięcie i jedno dodanie na bajt. Reszta to test kilku bitów.',
    scene: 'gear-hash',
    caption: '<b>Co widać:</b> okno przesuwa się po bajtach pliku, a pod nim rośnie hasz. ' +
      'Dolne bity hasza są rysowane pojedynczo — gdy wszystkie są zerowe, mamy punkt podziału. ' +
      'Suwak zmienia liczbę sprawdzanych bitów, czyli średni rozmiar chunka (2ⁿ bajtów).',
    points: [
      'Warunek „<span class="tag">h & maska == 0</span>” spełnia się z prawdopodobieństwem <strong>1 / 2ⁿ</strong>, więc średni chunk ma 2ⁿ bajtów.',
      'Gear hash działa, bo niskie bity hasza zmieniają się przy każdym nowym bajcie — hasz „nie pamięta” początku pliku.',
      'Koszt: <strong>jeden hasz na bajt wejścia</strong> — i dlatego przez lata to był główny problem chunkingu.'
    ]
  });

  D.slide({
    id: 'ch3-3', chapter: 3, chapterLabel: L, kicker: 'Własności', num: '3.1',
    title: 'Trzy własności dobrego chunkera',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Dynektyczność</h4>' +
      '<dl><dt>test</dt><dd>wstaw 1 B w połowie pliku</dd>' +
      '<dt>dobrze</dt><dd>tylko granice tuż obok zmiany są inne</dd>' +
      '<dt>źle</dt><dd>wszystkie granice przesunięte</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Szybkość</h4>' +
      '<dl><dt>metryka</dt><dd>MB/s samego chunkingu</dd>' +
      '<dt>koszt</dt><dd>przynajmniej jedna operacja na bajt wejścia</dd>' +
      '<dt>ryzyko</dt><dd>chunker bywa wąskim gardłem całego backupu</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">Rozkład rozmiarów</h4>' +
      '<dl><dt>chcemy</dt><dd>rozkład zbliżony do wykładniczego</dd>' +
      '<dt>źle</dt><dd>bardzo krótkie i bardzo długie chunki naraz</dd>' +
      '<dt>narzędzie</dt><dd>histogram rozmiarów na slajdach 3.5–3.6</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Te trzy własności <b>kolidują ze sobą</b>: szybki chunker robi duże chunky, ' +
      'duże chunki psują dedup ratio, a duże granice ułatwiają skok po indeksie. Dwa następne rozdziały ' +
      'szukają kompromisów na dwa różne sposoby: <b>AE</b> bez hasza i <b>FastCDC</b> z progami.</div>'
  });

  D.slide({
    id: 'ch3-4', chapter: 3, chapterLabel: L, kicker: 'AE', num: '3.2',
    title: 'Asymmetric Extremum: punkt podziału bez hasza',
    lead: 'Drugi kierunek rozwoju to całkowite porzucenie haszowania. Zamiast liczyć wartość dla każdego bajtu, AE szuka <strong>ekstremum</strong> w oknie o nietypowej szerokości.',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Jak to działa</h4>' +
      '<dl><dt>okno</dt><dd>asymetryczne: część lewa zmienia się, część prawa ma stałą szerokość w</dd>' +
      '<dt>test</dt><dd>bajt i jest maksimum w przedziale [punkt podziału, i+w)</dd>' +
      '<dt>cięcie</dt><dd>w punkcie i+w</dd>' +
      '<dt>hasz</dt><dd>żaden — stąd „hashless”</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Dlaczego to działa</h4>' +
      '<dl><dt>motywacja</dt><dd>chunk nie może być krótszy niż w</dd>' +
      '<dt>trik</dt><dd>minimalny fingerprint dostajemy z tego samego okna</dd>' +
      '<dt>skutek uboczny</dt><dd>chunki są nieco większe</dd>' +
      '<dt>wada</dt><dd>dedup ratio może spaść nawet o kilkanaście procent</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">Pozycja w rodzinie</h4>' +
      '<dl><dt>rodzina</dt><dd>metody hashless: AE, MAXP, Widodo</dd>' +
      '<dt>konkurencja</dt><dd>gear / Rabin + cut point skipping</dd>' +
      '<dt>w książce</dt><dd>3.2 jako pierwsza próba, 3.3 jako poprawka</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Warto zapamiętać: <b>AE nie ma maski</b>. Maska pojawia się dopiero w FastCDC, ' +
      'i to jest osobny mechanizm — część prezentacji myliła te dwie rodziny ze sobą.</div>'
  });

  D.slide({
    id: 'ch3-5', chapter: 3, chapterLabel: L, kicker: 'FastCDC', num: '3.3',
    title: 'FastCDC: trzy maski i progi zamiast jednej maski',
    lead: 'FastCDC wraca do hasza, ale zniekształca podział celowo tak, aby rozkład rozmiarów chunków był ciaśniejszy. Zamiast jednej maski używa trzech, przełączanych w zależności od tego, gdzie w chunku jesteśmy.',
    scene: 'fastcdc-masks',
    caption: '<b>Co widać:</b> suwak maski zmienia średni rozmiar chunka (2ⁿ B). Histogram pokazuje realny rozkład rozmiarów, ' +
      'a znacznik „wstawiony baj” pokazuje, ile danych przepada po jednym wstawieniu. ' +
      'Dwie miary po prawej to dedup ratio i przepustowość — jedna rośnie, druga spada. Na dole: trzy maski FastCDC.',
    points: [
      '<span class="tag">MaskS</span> (15 bitów) używana <strong>przed</strong> progiem średniej — trudniej wygenerować cięcie, więc chunki są dłuższe.',
      '<span class="tag">MaskA</span> (13 bitów) to maska domyślna, gdy Normalized Chunking jest wyłączony.',
      '<span class="tag">MaskL</span> (11 bitów) po progu średniej — łatwiej ciąć, więc ogony rozkładu się skracają.',
      'Progi w konfiguracji 8 KB: <strong>Min 2 KB, Avg 8 KB, Max 64 KB</strong> (czyli 8× średniej).'
    ]
  });

  D.slide({
    id: 'ch3-6', chapter: 3, chapterLabel: L, kicker: 'Cut point skipping', num: '3.3',
    title: 'Cut point skipping: nie haszuj tam, gdzie nie decydujesz',
    lead: 'Pierwszych Min bajtów chunka i tak nie może być punktem podziału. Nie ma sensu tam liczyć hasza — a mimo to większość klasycznych implementacji to robiła.',
    scene: 'cutpoint-skip',
    caption: '<b>Co widać:</b> skaner startuje na pozycji 64 (próg Min) zamiast od zera — pomarańczowy blok to bajty, ' +
      'które w ogóle nie są haszowane. Niebieskie kreski to faktycznie policzone hasze. Dwie niżej: porównanie kosztu ' +
      'z klasycznym gear CDC i realna oszczędność CPU.',
    points: [
      'Skok dotyczy tylko początku chunka — <strong>reszta bajtów nadal jest haszowana</strong>, więc poprawa nie jest wielokrotna.',
      'Dla chunków rzędu kilku KB efekt jest wyraźny, bo pomijany blok to istotna część długości chunka.',
      'Razem z Normalized Chunking daje to kilkukrotnie niższy koszt haszowania niż w klasycznym gear CDC.'
    ]
  });

  D.slide({
    id: 'ch3-7', chapter: 3, chapterLabel: L, kicker: 'Praktyka', num: '3.4',
    title: 'Jak dobierać parametry w realnym systemie',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Większe chunki</h4>' +
      '<dl><dt>zysk</dt><dd>mniej wpisów w indeksie, wyższa prędkość</dd>' +
      '<dt>strata</dt><dd>po wstawieniu bajta tracisz cały chunk</dd>' +
      '<dt>typowo</dt><dd>4–64 KB, zależnie od typu danych</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">Mniejsze chunki</h4>' +
      '<dl><dt>zysk</dt><dd>lepszy dedup ratio, mniejsza szkoda po edycji</dd>' +
      '<dt>strata</dt><dd>większy indeks, wolniejsze haszowanie</dd>' +
      '<dt>ryzyko</dt><dd>przesadnie małe chunki to same metadane</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">Typy danych</h4>' +
      '<dl><dt>VM images</dt><dd>duże chunki — pliki i tak bardzo podobne</dd>' +
      '<dt>logi / tekst</dt><dd>mniejsze — dużo drobnych różnic</dd>' +
      '<dt>archiwa</dt><dd>średnie, zależnie od kompresji źródła</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Nie ma ustawienia optymalnego dla wszystkich zbiorów. To, co wygląda na detal, ' +
      'w innym miejscu potoku jest wąskim gardłem: <b>chunking</b> na CPU, <b>indeks</b> w pamięci, <b>GC</b> na zapisie.</div>'
  });

  D.slide({
    id: 'ch3-8', chapter: 3, chapterLabel: L, kicker: 'Podsumowanie', num: '3.4',
    title: 'Co zostaje z rozdziału 3',
    points: [
      'Podział musi wynikać z <strong>zawartości</strong> — inaczej jedna edycja kasuje dedup w całym pliku.',
      'Są <strong>dwie rodziny</strong>: z haszem (gear, Rabin) i bez hasza (AE, MAXP). FastCDC to optymalizacja pierwszej rodziny.',
      'Chunking zużywa CPU na <strong>każdym bajcie</strong> — dlatego optymalizacja haszowania jest tu warta tyle, ' +
      'ile optymalizacja indeksu w rozdziale 4.',
      'Efekt uboczny: <strong>chunki stają się różnej długości</strong>, co za chwilę okaże się problemem ' +
      'dla indeksu i dla cache.'
    ],
    html: '<div class="callout">Następny rozdział zaczyna się od zdania: „mamy już chunki różnej wielkości — ' +
      'i teraz każdy z nich musi zostać znaleziony w indeksie, który akurat nie mieści się w pamięci”.</div>'
  });

})(window.DECK);
