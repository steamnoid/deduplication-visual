/* slides/ch5.js — rozdział 5: rewriting */

(function (D) {
  const L = 'Rozdział 5 · Rewriting';

  D.slide({
    id: 'ch5-1', chapter: 5, chapterLabel: L, kicker: 'Problem', num: '5.1',
    title: 'Usunięte dane zostawiają dziury',
    lead: 'Chunki to nie pliki. Gdy plik zostaje usunięty albo nadpisany, jego chunki nie znikają z kontenera — bo ten sam chunk może należeć do innego pliku.',
    scene: 'fragmentation',
    caption: '<b>Co widać:</b> kolejne stany jednego kontenera. Środkowy wiersz pokazuje martwe chunki po usunięciu pliku, ' +
      'dolny — stan po garbage collection. Wiersz górny to punkt wyjścia: pełny, uporządkowany kontener.',
    points: [
      'Dwa typy fragmentacji: <strong>wewnątrz pliku</strong> (jeden plik rozsiany po wielu kontenerach) ' +
      'i <strong>między plikami</strong> (te same dane w dwóch miejscach).',
      'Fragmentacja wewnątrz pliku psuje restore: jedno otwarcie pliku = wiele odczytów z różnych kontenerów.'
    ]
  });

  D.slide({
    id: 'ch5-2', chapter: 5, chapterLabel: L, kicker: 'HAR', num: '5.2',
    title: 'HAR: wróć z danymi tam, gdzie już były',
    lead: 'History-Aware Rewriting nie zaczyna od pytania „co jest popularne”. Zaczyna od informacji, którą system już ma: <strong>poprzedni backup wie, w których kontenerach leżą chunki podobnych plików</strong>.',
    scene: 'har-rewrite',
    caption: '<b>Co widać:</b> plik A (wczoraj) i plik B (dziś), który różni się na trzech końcach. ' +
      'Kontenery C1–C4 na dysku, przy czym C2 jest oznaczony jako <b>rzadki</b> — w dużej mierze martwy. ' +
      'Strzałki pokazują, że duplikaty z pliku B wracają do C2 zamiast tworzyć nowy kontener; ' +
      'trzy nowe chunki lądują w świeżym C5.',
    points: [
      'Dziedziczenie rzadkich kontenerów: zamiast przepisywać wszystko, <strong>dociągamy duplikaty do tego, co już zajmuje miejsce</strong>.',
      'Dzięki temu plik z wczoraj i dzisiejszy czytają się z <strong>sąsiednich kontenerów</strong>.',
      'Do tego dochodzi <strong>CMA</strong> — mechanizm oczyszczania kontenerów, który w tej sytuacji zastępuje globalne GC.'
    ]
  });

  D.slide({
    id: 'ch5-3', chapter: 5, chapterLabel: L, kicker: 'Szczegóły', num: '5.2',
    title: 'Trzy elementy HAR',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">Dziedziczenie rzadkich kontenerów</h4>' +
      '<dl><dt>sygnał</dt><dd>poprzedni backup wskazuje kontenery z chunkami podobnego pliku</dd>' +
      '<dt>akcja</dt><dd>duplikaty dopisujemy do tych samych kontenerów</dd>' +
      '<dt>efekt</dt><dd>pliki z kolejnych dni leżą obok siebie, restore jest krótki</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">CMA — oczyszczanie</h4>' +
      '<dl><dt>problem</dt><dd>kontener rzadki zawiera dużo martwych komórek</dd>' +
      '<dt>rozwiązanie</dt><dd>martwe komórki znikają, zanim kontener zostanie zwolniony</dd>' +
      '<dt>dlaczego tu</dt><dd>bo dziedziczenie świadomie pogarsza zapełnienie kontenerów</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">Wariant hybrydowy</h4>' +
      '<dl><dt>decyzja</dt><dd>nie każdy plik warto przepisywać</dd>' +
      '<dt>wariant</dt><dd>część plików przepisujemy, część zostawiamy tam, gdzie jest</dd>' +
      '<dt>cel</dt><dd>uniknąć kosztu zapisu, który i tak nie poprawia restore</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Każda z tych decyzji to <b>przepisywanie danych</b>. Dlatego HAR wygrywa tam, ' +
      'gdzie fragmentacja naprawdę bolała — w dużych, długo żyjących backupach z dużą rotacją plików. ' +
      'Uwaga: klasyfikacja „gorące / ciepłe / zimne” to <b>osobna rodzina rozwiązań</b>, nie HAR.</div>'
  });

  D.slide({
    id: 'ch5-4', chapter: 5, chapterLabel: L, kicker: 'CABdedupe', num: '5.3',
    title: 'CABdedupe: zależności między plikami zamiast pracy od zera',
    lead: 'Drugi sposób na przyspieszenie nie dotyczy dysku, tylko decyzji. Pliki w zbiorach backupu nie są niezależne: jedne są od pochodne innych — kopia, eksport, wersja po edycji.',
    scene: 'cabdedup',
    caption: '<b>Co widać:</b> trzy pliki w zbiorze. Kopia jest powiązana z oryginałem, raport pochodzi z innej rodziny. ' +
      'System wykrywa zależność i nie analizuje obu plików od zera. ' +
      'Na dole porównanie kosztu: każdy plik osobno wobec podejścia z przyczynowością.',
    points: [
      'Nazwa: <strong>Causality-Based Deduplication</strong> — wykorzystanie zależności przyczynowych między plikami.',
      'Motywacja jest praktyczna: <strong>ruch w sieci</strong> przy backupie i restore. Mniej analizy i odczytów = mniej bajtów przez WAN.',
      'Zysk pojawia się tylko tam, gdzie dane naprawdę mają strukturę. Przy plikach niezależnych znika.'
    ]
  });

  D.slide({
    id: 'ch5-5', chapter: 5, chapterLabel: L, kicker: 'Podsumowanie', num: '5.4',
    title: 'Co zostaje z rozdziału 5',
    points: [
      'Dedup tworzy <strong>śmieci</strong>: usunięty plik zostawia kawałki, których nikt nie czyta.',
      'Sposób na to nie jest oczywisty, bo każde porządkowanie to <strong>odczyt i zapis</strong> — czyli dokładnie ten koszt, ' +
      'którego próbowaliśmy uniknąć.',
      '<strong>HAR</strong> atakuje problem informacją z poprzedniego backupu, <strong>CABdedupe</strong> — zależnościami między plikami.',
      'Oba rozwiązania są przybliżone: działają dobrze na typowych backupach i słabo na nietypowych.'
    ]
  });

})(window.DECK);
