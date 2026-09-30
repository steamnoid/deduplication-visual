/* slides/ch0.js — wprowadzenie */

(function (D) {
  const L = 'Wprowadzenie';

  D.chapter(0, { label: L, color: D.CH[0] });

  D.slide({
    id: 'intro-title', chapter: 0, chapterLabel: L, kicker: 'Prezentacja', num: '00',
    title: 'Deduplication for High Performance Storage Systems',
    lead: 'Dan Feng (Huazhong University of Science and Technology) — osiem rozdziałów o tym, jak systemy pamięci masowej przestają zapisywać to samo dwa razy.',
    points: [
      'Cała książka w <strong>27 animacjach</strong>: każdy algorytm pokazany jako ruch, nie jako pseudokod.',
      'Wszystko po polsku, nazwy algorytmów i pojęcia zostają po angielsku — tak jak w książce.',
      'Każdą animację można zatrzymać, przewinąć suwakiem i przeklikać parametrami.'
    ],
    html: '<div class="badge-row">' +
      '<span class="tag">gear hash</span><span class="tag">AE</span><span class="tag">FastCDC</span>' +
      '<span class="tag">DDFS</span><span class="tag">Extreme Binning</span><span class="tag">SiLo</span>' +
      '<span class="tag">HAR</span><span class="tag">CABdedupe</span><span class="tag">SecDep</span>' +
      '<span class="tag">Ddelta</span><span class="tag">DARE</span><span class="tag">near-exact dedup</span></div>' +
      '<div class="callout"><b>Nawigacja:</b> spacja lub → następny slajd, ← poprzedni, <b>O</b> przegląd, ' +
      '<b>F</b> pełny ekran. Kliknięcie animacji zatrzymuje ją.</div>'
  });

  D.slide({
    id: 'intro-how', chapter: 0, chapterLabel: L, kicker: 'Jak czytać', num: '00',
    title: 'Trzy sygnały, których używamy w każdej animacji',
    lead: 'Żeby nie uczyć się osobnego języka dla każdego rozdziału, wszystkie animacje mówią tym samym.',
    raw: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#f4a261"><h4 style="color:#f4a261">Pomarańczowy blok</h4>' +
      '<dl><dt>N</dt><dd>chunk, którego w systemie jeszcze nie było — trzeba go zapisać</dd>' +
      '<dt>↺</dt><dd>chunk już istniejący — zapisujemy tylko referencję, zero bajtów danych</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Fioletowy blok</h4>' +
      '<dl><dt>indeks</dt><dd>tablica w RAM: odcisk → lokalizacja na dysku</dd>' +
      '<dt>~80 ns</dt><dd>tyle kosztuje jeden losowy odczyt indeksu</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Zielona krawędź</h4>' +
      '<dl><dt>hit</dt><dd>trafienie: dane już są, robimy tylko metadane</dd>' +
      '<dt>miss</dt><dd>brak trafienia: zapisujemy bajty do kontenera</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Animacja nigdy nie jest jedyną informacją — pod każdą kadrą jest jedno zdanie opisujące, ' +
      'co właśnie widać, a liczby na slajdach są zawsze zgodne z tym, co widać na ekranie.</div>'
  });

  D.slide({
    id: 'intro-why', chapter: 0, chapterLabel: L, kicker: 'Motywacja', num: '00',
    title: 'Backup kopiuje to samo. W kółko. Codziennie.',
    lead: 'Większość kopii zapasowych zawiera ogromne ilości danych, które już gdzieś są — w innej wersji tego samego pliku, w innym pliku tego samego projektu, w innym obrazie maszyny wirtualnej.',
    scene: 'why-dedup',
    caption: '<b>Co widać:</b> dwie kopy tej samej osi czasu, narysowane w tej samej skali. ' +
      'Niebieski kontur to dane logiczne (to, co chcesz mieć w backupie), wypełnienie to realne bajty na dysku. ' +
      'Przełącznik u góry pokazuje wariant bez dedupu.',
    points: [
      'Deduplication (<strong>dedup</strong>) = automatyczne pomijanie danych, które system już ma.',
      'Im droższy nośnik i im więcej powtórzeń, tym większa gra.'
    ]
  });

  D.slide({
    id: 'intro-map', chapter: 0, chapterLabel: L, kicker: 'Plan', num: '00',
    title: 'Osiem rozdziałów, jedna linia: mniej bajtów na dysku',
    lead: 'Książka zaczyna się od historii backupu, przechodzi przez pięć kluczowych technologii i kończy frameworkiem, który je spina.',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#f4a261"><h4 style="color:#f4a261">1–2. Backup i przegląd</h4>' +
      '<dl><dt>dlaczego</dt><dd>skąd w ogóle bierze się duplikacja</dd>' +
      '<dt>pojęcia</dt><dd>chunk, hash, indeks, dedup ratio</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">3. Chunking</h4>' +
      '<dl><dt>CDC</dt><dd>gdzie ucinać plik</dd>' +
      '<dt>AE, FastCDC</dt><dd>jak to zrobić szybko</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">4. Indeksowanie</h4>' +
      '<dl><dt>DDFS, Extreme Binning</dt><dd>mało pamięci</dd>' +
      '<dt>SiLo</dt><dd>mało losowych odczytów</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ef476f"><h4 style="color:#ef476f">5. Rewriting</h4>' +
      '<dl><dt>fragmentacja</dt><dd>śmieci po usuwaniu</dd>' +
      '<dt>HAR, CABdedupe</dt><dd>jak je ograniczać</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">6. Bezpieczeństwo</h4>' +
      '<dl><dt>wyciek</dt><dd>dedup zdradza obecność pliku</dd>' +
      '<dt>CE, SecDep</dt><dd>szyfrowanie zbieżne</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#48cae4"><h4 style="color:#48cae4">7. Delta</h4>' +
      '<dl><dt>podobne</dt><dd>nieidentyczne, ale nieodległe</dd>' +
      '<dt>Ddelta, DARE</dt><dd>gdzie szukać podobieństw</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#a0c4ff"><h4 style="color:#a0c4ff">8. Framework</h4>' +
      '<dl><dt>potok</dt><dd>backup, restore, GC</dd>' +
      '<dt>near-exact</dt><dd>dedup z przybliżeniem</dd></dl></div>' +
      '</div>'
  });

})(window.DECK);
