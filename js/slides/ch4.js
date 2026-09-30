/* slides/ch4.js — rozdział 4: schematy indeksowania */

(function (D) {
  const L = 'Rozdział 4 · Indeksowanie';

  D.slide({
    id: 'ch4-1', chapter: 4, chapterLabel: L, kicker: 'Wąskie gardło', num: '4.2',
    title: 'Indeks jest mały jako ułamek danych — i bardzo drogi',
    lead: 'Typowy wpis indeksu to kilkanaście bajtów na chunk kilku-kilometrowy. Procentowo to ułamek procenta. Ale każde sprawdzenie duplikatu to losowy odczyt pamięci, a nie sekwencyjne czytanie strumienia.',
    scene: 'index-bottleneck',
    caption: '<b>Co widać:</b> lewy wykres (skala log) — ile RAM potrzebuje indeks dla 1 TB do 1 PB danych przy wybranym rozmiarze chunka. ' +
      'Prawy panel — koszt pojedynczego sprawdzenia, gdy indeks mieści się w cache i gdy nie. ' +
      'Suwak zmienia rozmiar chunka, czyli liczbę wpisów.',
    points: [
      'Zwykła hash table: odcisk → lokalizacja. Alternatywy to drzewo (B+/LSM), tablica cuckoo — inne kompromisy.',
      'Rozdział 4 odpowiada na pytanie: <strong>jak zrobić indeks małym i trafnym</strong>.'
    ]
  });

  D.slide({
    id: 'ch4-2', chapter: 4, chapterLabel: L, kicker: 'Extreme Binning', num: '4.1',
    title: 'Extreme Binning: jeden wpis na plik, nie na chunk',
    lead: 'Schematy indeksowania dzielą się na dwa obce podejścia. Extreme Binning należy do <strong>podobieństwowych</strong>: zamiast trzymać w RAM-ie wpis dla każdego chunka, trzyma wpis dla każdego pliku — jego minimalny fingerprint.',
    scene: 'extreme-binning-similarity',
    caption: '<b>Co widać:</b> po lewej pliki na dysku, każdy z zaznaczonym minimalnym fingerprintem. ' +
      'W środku RAM z jednym wpisem na plik. Po prawej nowy chunk porównywany z reprezentantami. ' +
      'Trafienie nie oznacza „duplikatu”, tylko „ten plik jest podobny, więc warto przeczytać jego indeks z dysku”.',
    points: [
      'Klucz kubełka to <strong>reprezentatywny fragment pliku</strong>, a nie fragment przestrzeni hashy.',
      'Efekt: indeks w RAM rośnie z liczbą <strong>plików</strong>, nie chunków; typowo <strong>jeden odczyt indeksu z dysku na plik</strong>.',
      'Cena: trafienie w podobieństwo nie jest trafieniem w duplikat — trzeba później sprawdzić indeks właściwego pliku.'
    ]
  });

  D.slide({
    id: 'ch4-3', chapter: 4, chapterLabel: L, kicker: 'DDFS', num: '4.1',
    title: 'DDFS: to podejście drugie — lokalnościowe',
    lead: 'Data Domain File System reprezentuje stan inaczej: zamiast opisywać każdy chunk, opisuje <strong>pliki i relacje między nimi</strong>, korzystając z tego, że dane o podobnej zawartości zwykle trafiają do systemu razem.',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">Locality Preserved Caching</h4>' +
      '<dl><dt>założenie</dt><dd>pliki podobne leżą obok siebie na dysku</dd>' +
      '<dt>indeks</dt><dd>opis stanu pliku zamiast opisu każdego chunka</dd>' +
      '<dt>skutek</dt><dd>przy podobnym pliku wystarczy odczytać jego sąsiadów</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">SISL</h4>' +
      '<dl><dt>co</dt><dd>indeks dla fragmentów z indeksu społecznościowego, pamiętający podobieństwo plików</dd>' +
      '<dt>po co</dt><dd>żeby nie indeksować tysięcy plików osobno</dd>' +
      '<dt>wspólna idea</dt><dd>podobieństwo jest informacją, którą warto zapamiętać</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">Jak to się ma do SiLo</h4>' +
      '<dl><dt>DDFS</dt><dd>lokalność na poziomie plików i segmentów</dd>' +
      '<dt>Extreme Binning</dt><dd>podobieństwo na poziomie plików</dd>' +
      '<dt>SiLo</dt><dd>łączy obie strony: podobieństwo dla RAM-u i lokalność dla odczytów</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Rozdział 4.1 świadomie zestawia te dwa podejścia obok siebie, bo kosztują odwrotnie: ' +
      'DDFS oszczędza opisując pliki zamiast chunków, Extreme Binning oszczędza <b>odczyty</b>. SiLo w rozdziale 4.3 ' +
      'bierze z obu to, co da się połączyć.</div>'
  });

  D.slide({
    id: 'ch4-4', chapter: 4, chapterLabel: L, kicker: 'SiLo', num: '4.3',
    title: 'SiLo: dwa poziomy, dwa zyski',
    lead: 'SiLo (Similarity + Locality) nie sortuje wpisów według rozmiaru. Ono działa na dwóch poziomach: <strong>podobieństwo</strong> zmniejsza to, co siedzi w RAM-ie, a <strong>lokalność</strong> zmniejsza liczbę losowych odczytów.',
    scene: 'silo-two-levels',
    caption: '<b>Co widać:</b> górna połowa — similarity: dane leżą w segmentach, a w RAM trafiają tylko reprezentanci każdego segmentu. ' +
      'Dolna połowa — locality: trafienie w reprezentanta wyznacza segment, który zostaje wczytany w całości (prefetch). ' +
      'Na dole porównanie z klasyczną hash table i efektywność w chunkach na jeden losowy odczyt.',
    points: [
      'Similarity zmniejsza indeks RAM: zamiast wpisu na każdy chunk mamy wpis na każdy <strong>segment</strong>.',
      'Locality zamienia wiele losowych odczytów w jeden odczyt + sekwencyjne dociągnięcie całego segmentu.',
      'To rozwiązanie w pierwszej kolejności <strong>zmienia indeks</strong> — dlatego stosuje się je świadomie, a nie przypadkiem.'
    ]
  });

  D.slide({
    id: 'ch4-5', chapter: 4, chapterLabel: L, kicker: 'Bloom', num: '4.2',
    title: 'Najtańszy filtr: sprawdź, zanim dotkniesz indeksu',
    lead: 'Skoro większość chunków jest nowa, większość odczytów indeksu i tak nic nie znajdzie. Bloom filter pozwala odfiltrować te przypadki taniej niż pełne sprawdzenie.',
    scene: 'bloom-gate',
    caption: '<b>Co widać:</b> góra to chunki pliku, poniżej bramka Bloom. Część odpada z odpowiedzią „nie ma” i trafia ' +
      'prosto do zapisu, część trafia do droższego sprawdzenia. Pasek na dole pokazuje, ile procent decyzji ' +
      'zostało podjętych tanio.',
    points: [
      'Własność, która robi to możliwym: <strong>brak fałszywych „nie ma”</strong>. Może powiedzieć „może jest”, ' +
      'nigdy „na pewno nie ma, a jest”.',
      'Ten sam wzorzec co w Bloom Filterze z rozdziału 4.1: <strong>odpowiedź fałszywa w jedną stronę jest bezpieczna</strong>, ' +
      'w drugą nie.',
      'Koszt: sam filtr potrzebuje pamięci, ale znacznie mniej niż indeks, który przed nim chroni.'
    ]
  });

  D.slide({
    id: 'ch4-6', chapter: 4, chapterLabel: L, kicker: 'Porównanie', num: '4.4',
    title: 'Co zyskujemy, a co tracimy',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Extreme Binning</h4>' +
      '<dl><dt>podejście</dt><dd>podobieństwowe</dd>' +
      '<dt>dostajesz</dt><dd>indeks RAM proporcjonalny do liczby plików</dd>' +
      '<dt>płacisz</dt><dd>odczyt indeksu pliku z dysku przy każdym trafieniu</dd>' +
      '<dt>ratio</dt><dd>bez zmian</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">DDFS</h4>' +
      '<dl><dt>podejście</dt><dd>lokalnościowe</dd>' +
      '<dt>dostajesz</dt><dd>opis stanu pliku zamiast opisu chunków</dd>' +
      '<dt>płacisz</dt><dd>zależność od tego, czy podobne pliki leżą obok siebie</dd>' +
      '<dt>ratio</dt><dd>lekko lepszy przy podobnych zbiorach</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#48cae4"><h4 style="color:#48cae4">SiLo</h4>' +
      '<dl><dt>podejście</dt><dd>oba naraz</dd>' +
      '<dt>dostajesz</dt><dd>mały indeks RAM i mało losowych odczytów</dd>' +
      '<dt>płacisz</dt><dd>przeprojektowanie indeksu, nie tylko kolejności wpisów</dd>' +
      '<dt>ratio</dt><dd>blisko wersji dokładnej</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">Bloom / przybliżenie</h4>' +
      '<dl><dt>podejście</dt><dd>warstwa ochronna</dd>' +
      '<dt>dostajesz</dt><dd>tańsze odfiltrowanie większości chunków</dd>' +
      '<dt>płacisz</dt><dd>fałszywe „jest” i dodatkowa pamięć</dd>' +
      '<dt>ratio</dt><dd>bez zmian</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Te pomysły <b>nie konfliktują</b> — książka traktuje je jako warstwy. ' +
      'Najpierw redukujemy to, co siedzi w RAM (Extreme Binning, SiLo), potem dokładamy tani filtr (Bloom). ' +
      'DDFS i SiLo dotyczą tego samego problemu z dwóch stron i warto je rozumieć razem.</div>'
  });

  D.slide({
    id: 'ch4-7', chapter: 4, chapterLabel: L, kicker: 'Podsumowanie', num: '4.5',
    title: 'Co zostaje z rozdziału 4',
    points: [
      'Indeks jest <strong>mały procentowo, ale losowy</strong> — i właśnie „losowy” jest problemem, nie rozmiar.',
      'Są dwie rodziny strategii: <strong>lokalnościowe</strong> (DDFS) i <strong>podobieństwowe</strong> (Extreme Binning); ' +
      'SiLo łączy je, bo podobieństwo kurczy indeks, a lokalność kurczy liczbę odczytów.',
      'Wszystkie te decyzje dotyczą <strong>wydajności</strong>, a nie poprawności: trafienie nadal rozstrzyga porównanie treści chunków.',
      'Dlatego wynik to zawsze kompromis: <strong>dedup throughput</strong> kontra <strong>dedup ratio</strong>.'
    ]
  });

})(window.DECK);
