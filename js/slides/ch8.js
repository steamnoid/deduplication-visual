/* slides/ch8.js — rozdział 8: framework */

(function (D) {
  const L = 'Rozdział 8 · Framework';

  D.slide({
    id: 'ch8-1', chapter: 8, chapterLabel: L, kicker: 'Przestrzeń', num: '8.1',
    title: 'Wszystkie decyzje w jednym miejscu',
    lead: 'Rozdział 8 nie dodaje nowego algorytmu. Łączy poprzednie siedem rozdziałów w system, który da się zaprojektować i zaproponować jako prototyp.',
    points: [
      'Warianty do wyboru: <strong>chunking</strong> (stały vs CDC), <strong>indeks</strong> (hash table vs cuckoo vs Extreme Binning), ' +
      '<strong>chunk-level vs file-level</strong>, <strong>off-line vs in-line</strong>.',
      'Do tego dochodzi coś, czego nie ma w prostych opisach: <strong>przywracanie</strong> i <strong>garbage collection</strong>.',
      'Książka kończy się <strong>otwartym prototypem</strong> — kod, który można uruchomić i sprawdzić.'
    ],
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#a0c4ff"><h4 style="color:#a0c4ff">Decyzje projektowe</h4>' +
      '<dl><dt>chunking</dt><dd>stały rozmiar czy CDC</dd>' +
      '<dt>indeks</dt><dd>hash table, cuckoo, Extreme Binning</dd>' +
      '<dt>moment</dt><dd>in-line czy off-line</dd>' +
      '<dt>bezpieczeństwo</dt><dd>CE, MLK, UACE, SecDep</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ef476f"><h4 style="color:#ef476f">Kto płaci</h4>' +
      '<dl><dt>chunking</dt><dd>CPU</dd>' +
      '<dt>indeks</dt><dd>pamięć RAM i liczba losowych odczytów</dd>' +
      '<dt>GC i rewriting</dt><dd>przepustowość zapisu</dd>' +
      '<dt>szyfrowanie</dt><dd>CPU plus zarządzanie kluczami</dd></dl></div>' +
      '</div>'
  });

  D.slide({
    id: 'ch8-2', chapter: 8, chapterLabel: L, kicker: 'Pipeline', num: '8.2',
    title: 'Backup to przepływ. Gdzie w nim wydać zdanie?',
    lead: 'Dwa warianty umiejscowienia decyzji o dedupie. Różnią się tym, kto płaci: klient, serwer czy dysk.',
    scene: 'inline-pipeline',
    caption: '<b>Co widać:</b> pięć stacji potoku i pasek przepływu danych z zaznaczonym miejscem sprawdzenia w indeksie. ' +
      'Dwie karty na dole to warianty: in-line (decyzja przed zapisem) i off-line (przepisywanie po fakcie).',
    points: [
      '<strong>In-line</strong>: każdy chunk sprawdzany przed zapisem. Mniej zapisu, wolniejsza ścieżka.',
      '<strong>Off-line</strong>: ścieżka zapisu nietknięta, ale powstają śmieci i trzeba je sprzątać.'
    ]
  });

  D.slide({
    id: 'ch8-3', chapter: 8, chapterLabel: L, kicker: 'Restore', num: '8.2',
    title: 'Przywracanie jest drugą stroną medalu',
    lead: 'System, który świetnie pomija zapisywanie, musi równie dobrze składać plik z rozsianych po dysku kawałków. I robić to z pamięci cache, nie z nośnika.',
    points: [
      'Plik to <strong>lista referencji</strong>: przywracanie = przejście listy + odczyt chunków, których jeszcze nie ma w cache.',
      'Koszt jest <strong>losowy</strong> — to najgorszy możliwy wzorzec dla nośnika, dlatego liczy się kolejność odczytów.',
      'Stąd w rozdziale 5 pojawia się <strong>optymalna pamięć cache przy restore</strong>: ustawiamy kontenery tak, ' +
      'żeby jeden plik mieścił się w niewielkiej liczbie odczytów.',
      'Pełny restore całego systemu to osobny problem: musi obsłużyć tysiące plików, których łączna liczba ' +
      'unikalnych chunków jest znacznie mniejsza.'
    ]
  });

  D.slide({
    id: 'ch8-4', chapter: 8, chapterLabel: L, kicker: 'GC', num: '8.2',
    title: 'Sprzątanie śmieci to zapis, którego nikt nie zamawiał',
    lead: 'Garbage collection przenosi żywe chunki do nowego kontenera. W tym sensie nie usuwa danych — tylko je przepisuje. I robi to w najgorszym możliwym momencie: na spokojnym systemie.',
    scene: 'gc-amplification',
    caption: '<b>Co widać:</b> kontener przed (żywe i martwe komórki) i po (nowy, zwarty kontener plus pusty stary). ' +
      'Panel na dole to bilans: ile bajtów odczytano, ile zapisano, ile zmarnowano.',
    points: [
      'To jest <strong>write amplification</strong> — operacja porządkowa generuje ruch na dysku.',
      'Dlatego HAR i dziedziczenie kontenerów z rozdziału 5 są tak naprawdę <strong>unikaniem GC</strong>, ' +
      'a nie osobną optymalizacją.',
      'Strategia typowa: GC na podstawie <strong>progu zaśmiecenia</strong> kontenera, nie globalnego harmonogramu.'
    ]
  });

  D.slide({
    id: 'ch8-5', chapter: 8, chapterLabel: L, kicker: 'Near-exact', num: '8.3',
    title: 'Near-exact dedup: indeks z próbkami, nie pełny',
    lead: 'Do tej pory zakładaliśmy, że indeks w RAM zawiera komplet fingerprintów. Near-exact dopuszcza, żeby zawierał tylko ich <strong>próbki</strong>. Decyzja pozostaje dokładna — ale część duplikatów przepada.',
    scene: 'near-exact-physical',
    caption: '<b>Co widać:</b> u góry indeks w RAM, w którym świecą tylko reprezentanci (próbki); reszta komórek jest pusta. ' +
      'Niżej nowy plik: część chunków trafia (↺), część nie (✕) i zostaje zapisana po raz drugi. ' +
      'Suwak zmienia liczbę próbek. Na dole bilans: ile razy mniejszy indeks i ile procent dedup ratio zostaje.',
    points: [
      'Skrót <strong>near-exact</strong> nie oznacza fałszywych trafień. Oznacza <strong>pominięcia</strong>: ' +
      'chunk, którego nie ma w próbkach, nie zostanie rozpoznany i trafi na dysk drugi raz.',
      'Warunek sensowności podany w książce: zachować <strong>≥ 97 % dedup ratio</strong> wersji z pełnym indeksem (ED).',
      'Physical locality = układ po dedupie utrzymywany w kontenerach: wiadomo, co leży obok czego na dysku.'
    ]
  });

  D.slide({
    id: 'ch8-6', chapter: 8, chapterLabel: L, kicker: 'Receptisy', num: '8.3',
    title: 'Logical locality: receptis pamięta plik sprzed dedupu',
    lead: 'Druga strona near-exact nie dotyczy pamięci, tylko wiedzy. System utrzymuje <strong>receptis</strong> — przepisy plików z listą chunków i przesunięć, z jakimi trafiły do kontenerów.',
    scene: 'near-exact-logical',
    caption: '<b>Co widać:</b> dwa receptisy z sekwencją oznaczeń (dup / nowy) i zapisanymi lokalizacjami typu „C1:0 C2:4”. ' +
      'Pod nimi plik wchodzący. System dopasowuje go do receptisa i z góry wie, które fragmenty się powtórzą ' +
      'i gdzie — zamiast pytać o każdy chunk osobno.',
    points: [
      'Receptis opisuje sekwencję chunków <strong>przed dedupem</strong> — to jest właśnie różnica wobec layoutu kontenera.',
      'Dzięki niemu można przewidzieć, co się powtórzy, i odczytać tylko potrzebne miejsca.',
      'Zastrzeżenie: działa, dopóki pliki naprawdę mają tę samą strukturę. Przy plikach niezależnych receptisy nic nie przewidzą.'
    ]
  });

  D.slide({
    id: 'ch8-7', chapter: 8, chapterLabel: L, kicker: 'Wyniki', num: '8.3',
    title: 'Czym mierzymy system: cztery liczby, nie jedna',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Dedup ratio</h4>' +
      '<dl><dt>co</dt><dd>dane logiczne / dane na dysku</dd>' +
      '<dt>dobrze</dt><dd>5:1 i więcej na typowym backupie</dd>' +
      '<dt>źle</dt><dd>metryka, którą łatwo poprawić kosztem throughput</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">Dedup throughput</h4>' +
      '<dl><dt>co</dt><dd>MB/s potoku backupu</dd>' +
      '<dt>ważne</dt><dd>czy nadąża za szybkością nośnika</dd>' +
      '<dt>wąskie gardło</dt><dd>chunking i indeks, nie zapis</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">Koszt indeksu</h4>' +
      '<dl><dt>co</dt><dd>RAM na wpis</dd>' +
      '<dt>ważne</dt><dd>czy mieści się w cache</dd>' +
      '<dt>typowo</dt><dd>dziesiątki GB na miliard chunków</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ef476f"><h4 style="color:#ef476f">Write amplification</h4>' +
      '<dl><dt>co</dt><dd>zapis / dane logiczne</dd>' +
      '<dt>źle</dt><dd>GC i rewriting ponad 2× to norma</dd>' +
      '<dt>wpływ</dt><dd>skraca żywotność SSD najbardziej</dd></dl></div>' +
      '</div>' +
      '<div class="callout">System dobry to taki, który <b>utrzymuje wszystkie cztery</b> na rozsądnym poziomie. ' +
      'Każda poprawka jednej liczby pogarsza inną — i dlatego porównania systemów w literaturze tak rzadko są uczciwe.</div>'
  });

  D.slide({
    id: 'ch8-8', chapter: 8, chapterLabel: L, kicker: 'Rekomendacje', num: '8.4',
    title: 'Co wybrać, jeśli projektujesz to dziś',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Zacznij od</h4>' +
      '<dl><dt>chunking</dt><dd>CDC, 4–8 KB, z cut point skippingiem</dd>' +
      '<dt>indeks</dt><dd>hash table w RAM; przy dużych zbiorach: Extreme Binning lub SiLo</dd>' +
      '<dt>tryb</dt><dd>in-line, jeśli zależy ci na miejscu</dd>' +
      '<dt>bezpieczeństwo</dt><dd>przynajmniej MLK, jeśli dane poufne</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Potem rozważ</h4>' +
      '<dl><dt>Extreme Binning</dt><dd>gdy indeks nie mieści się w RAM</dd>' +
      '<dt>SiLo</dt><dd>gdy indeks mieści się, ale nie trafia w cache</dd>' +
      '<dt>delta</dt><dd>gdy po dedupie zostało dużo podobnych danych</dd>' +
      '<dt>near-exact</dt><dd>gdy RAM jest za drogi, a 3 % utraty ratio to akceptowalna cena</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Kolejność nie jest przypadkowa: każdy kolejny krok rozwiązuje <b>konkretny</b> ' +
      'wąskie gardło, którego nie było, dopóki nie przeszedłeś poprzedniego. ' +
      'Najpierw chunking, potem indeks, potem porządek na dysku, i dopiero na końcu przybliżenia.</div>'
  });

})(window.DECK);
