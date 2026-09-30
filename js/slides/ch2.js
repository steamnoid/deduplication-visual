/* slides/ch2.js — rozdział 2: przegląd dedupu */

(function (D) {
  const L = 'Rozdział 2 · Przegląd';

  D.slide({
    id: 'ch2-1', chapter: 2, chapterLabel: L, kicker: 'Podstawa', num: '2.1',
    title: 'Plik czy chunk? Wszystko rozstrzyga się tutaj',
    lead: 'Najprostszy dedup porównuje całe pliki. Działa tylko wtedy, gdy te same pliki wracają co do bajtu. Wystarczy jeden zmieniony nagłówek i cała oszczędność znika.',
    scene: 'file-vs-chunk',
    caption: '<b>Co widać:</b> górna połowa to porównanie plików — plik B jest zapisany w całości, bo różni się choćby trzema bajtami. ' +
      'Dolna połowa to podział na chunki: różni się tylko pierwszy z jedenastu, reszta trafia do indeksu jako referencja.',
    points: [
      '<strong>Chunk-level</strong> daje dużo lepszy dedup ratio i jest standardem w backupach.',
      'Ale wymaga: chunkera, hasza i indeksu — czyli trzech nowych komponentów w ścieżce zapisu.'
    ]
  });

  D.slide({
    id: 'ch2-2', chapter: 2, chapterLabel: L, kicker: 'Taksonomia', num: '2.1',
    title: 'Cztery osie, po których opisuje się każdy system dedupu',
    lead: 'Literatura porównuje systemy hasłami z czterech niezależnych osi. Wybór na każdej z nich to kompromis — nic nie jest „najlepsze”.',
    scene: 'dedup-taxonomy',
    caption: '<b>Co widać:</b> dwie karty to przeciwne końce jednej osi, na dole wniosek. ' +
      'Przełącznik „Oś” i przycisk Auto pozwalają przejrzeć wszystkie cztery; wybór ręczny wyłącza przewijanie.',
    points: [
      'Każda z osi działa jednocześnie w systemie, który naprawdę istnieje — i to właśnie dlatego porównania bywają mylące.'
    ]
  });

  D.slide({
    id: 'ch2-3', chapter: 2, chapterLabel: L, kicker: 'Workflow', num: '2.2',
    title: 'Ścieżka pojedynczego chunka',
    lead: 'Cały system sprowadza się do jednego pytania powtarzanego dla każdego fragmentu pliku: czy już go mamy?',
    scene: 'dedup-workflow',
    caption: '<b>Co widać:</b> pięć stacji pipeline’u i dziesięć chunków pliku. ' +
      'Chunki zielone oznaczone ↺ to trafienia w indeksie (zero bajtów zapisu), pomarańczowe z literą N — nowe dane do zapisania. ' +
      'Licznik na dole pokazuje, ile realnie trafia na dysk.',
    points: [
      'Każda stacja ma <strong>koszt</strong>: chunking to CPU na każdym bajcie, indeks to losowy odczyt RAM.',
      'Domyślny indeks to hash table odcisk → lokalizacja. Alternatywy to drzewo, cuckoo hashing, cuckoo table — o tym rozdział 4.'
    ]
  });

  D.slide({
    id: 'ch2-4', chapter: 2, chapterLabel: L, kicker: 'Pojęcia', num: '2.2',
    title: 'Trzy pojęcia, których używamy do końca prezentacji',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#f4a261"><h4 style="color:#f4a261">Chunk</h4>' +
      '<dl><dt>typowo</dt><dd>1–64 KB, zależnie od systemu</dd>' +
      '<dt>granica</dt><dd>wynika z zawartości (CDC), a nie z adresu</dd>' +
      '<dt>nośnik</dt><dd>zapisujemy do kontenera, zwykle MB</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Hash (odcisk palca)</h4>' +
      '<dl><dt>wejście</dt><dd>zawartość chunka</dd>' +
      '<dt>wyjście</dt><dd>krótka liczba, np. 160 bitów</dd>' +
      '<dt>kolizja</dt><dd>przy porównaniu sprawdzamy treść, nie sam odcisk</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Dedup ratio</h4>' +
      '<dl><dt>definicja</dt><dd>dane logiczne ÷ dane na dysku</dd>' +
      '<dt>5:1</dt><dd>tylko jedna piąta miejsca zajmuje dane</dd>' +
      '<dt>nie jest</dt><dd>miernikiem szybkości ani poprawności</dd></dl></div>' +
      '</div>' +
      '<div class="callout">System ocenia się <b>dwoma liczbami naraz</b>: dedup ratio (ile miejsca oszczędzamy) ' +
      'i dedup throughput (ile MB/s przetwarzamy). Wszystkie algorytmy w książce to kompromis między nimi ' +
      'oraz między nimi a rozmiarem indeksu.</div>'
  });

  D.slide({
    id: 'ch2-5', chapter: 2, chapterLabel: L, kicker: 'Scenariusze', num: '2.3',
    title: 'Gdzie dedup w ogóle ma sens',
    lead: 'Nie wszędzie. Tam, gdzie dane są powtarzalne, a miejsce lub przepustowość zapisu są drogie.',
    scene: 'dedup-scenarios',
    caption: '<b>Co widać:</b> sześć miejsc zastosowań w kolejności pojawiania się. ' +
      'Każde z nich ma inny profil danych — i dlatego inne systemy wybierają inne priorytety.',
    points: [
      'Największe zyski: kopie zapasowe i maszyny wirtualne z jednego szablonu.',
      'W chmurze problem jest inny: te same obrazy wgrywane przez różne konta.'
    ]
  });

  D.slide({
    id: 'ch2-6', chapter: 2, chapterLabel: L, kicker: 'Mapa', num: '2.4',
    title: 'Pięć technologii, które trzeba znać, żeby czytać dalszą część',
    lead: 'Książka jest właściwie opisem tych pięciu filarów plus frameworku, który je scala.',
    scene: 'key-tech-map',
    caption: '<b>Co widać:</b> pięć technologii w kolejności rozdziałów 3–7 i framework z rozdziału 8, ' +
      'który łączy je w cały system. Pytania po prawej to sedno każdego rozdziału.',
    points: [
      'Każdy z rozdziałów 3–7 odpowiada na jedno pytanie. Warto wracać do tej planszy przy nauce.'
    ]
  });

})(window.DECK);
