/* slides/summary.js — zamknięcie prezentacji */

(function (D) {
  const L = 'Podsumowanie';

  D.slide({
    id: 'sum-tradoffs', chapter: 8, chapterLabel: L, kicker: 'Mapa kompromisów', num: '★',
    title: 'Osiem decyzji i to, co każda kosztuje',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">CDC zamiast stałych bloków</h4>' +
      '<dl><dt>dostajesz</dt><dd>dedup ratio odporny na edycje</dd>' +
      '<dt>płacisz</dt><dd>CPU chunkera i większy indeks</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#2ec4b6"><h4 style="color:#2ec4b6">Małe chunki</h4>' +
      '<dl><dt>dostajesz</dt><dd>lepszy ratio, mniejsza szkoda po zmianie</dd>' +
      '<dt>płacisz</dt><dd>przepustowość i RAM indeksu</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">Extreme Binning</h4>' +
      '<dl><dt>dostajesz</dt><dd>indeks RAM proporcjonalny do liczby plików</dd>' +
      '<dt>płacisz</dt><dd>odczyt indeksu pliku z dysku przy trafieniu</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#48cae4"><h4 style="color:#48cae4">SiLo</h4>' +
      '<dl><dt>dostajesz</dt><dd>mały indeks i mało losowych odczytów</dd>' +
      '<dt>płacisz</dt><dd>przeprojektowanie indeksu i segmentacja danych</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">Bloom / przybliżenie</h4>' +
      '<dl><dt>dostajesz</dt><dd>tańsze odfiltrowanie</dd>' +
      '<dt>płacisz</dt><dd>fałszywe „jest” i większy indeks</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ef476f"><h4 style="color:#ef476f">Rewriting i GC</h4>' +
      '<dl><dt>dostajesz</dt><dd>porządek i lepszy restore</dd>' +
      '<dt>płacisz</dt><dd>write amplification</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">UACE / SecDep</h4>' +
      '<dl><dt>dostajesz</dt><dd>ukrycie pliku i użytkownika</dd>' +
      '<dt>płacisz</dt><dd>część dedup ratio i złożoność</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#48cae4"><h4 style="color:#48cae4">Delta compression</h4>' +
      '<dl><dt>dostajesz</dt><dd>zapis podobnego, nie identycznego</dd>' +
      '<dt>płacisz</dt><dd>CPU na wyszukiwanie par</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#a0c4ff"><h4 style="color:#a0c4ff">Near-exact dedup</h4>' +
      '<dl><dt>dostajesz</dt><dd>indeks RAM z próbek, wyższa przepustowość</dd>' +
      '<dt>płacisz</dt><dd>część duplikatów przepada (do 3 % ratio)</dd></dl></div>' +
      '</div>'
  });

  D.slide({
    id: 'sum-final', chapter: 8, chapterLabel: L, kicker: 'Na koniec', num: '★',
    title: 'Cztery zdania, które warto zapamiętać',
    lead: 'Cała książka sprowadza się do historii o jednym napięciu: system ma zapisać jak najmniej, ale musi przy tym pozostać szybki, tani w pamięci i bezpieczny.',
    points: [
      '<strong>Chunking</strong> decyduje, czy w ogóle da się coś znaleźć. Złe granice kasują całą oszczędność.',
      '<strong>Indeks</strong> decyduje, czy da się to zrobić szybko. Mały procent danych, losowy odczyt w RAM.',
      '<strong>Porządek na dysku</strong> decyduje, ile naprawdę oszczędzisz. Resztę zjadają śmieci i GC.',
      '<strong>Bezpieczeństwo</strong> decyduje, komu wolno zauważyć, że plik już jest.'
    ],
    html: '<div class="callout">Prezentacja to własne podsumowanie książki <b>Data Deduplication for High Performance ' +
      'Storage System</b> (Dan Feng, Lili Qiu i in., Springer) — rysunki są poglądowe, liczby ilustrują zależności, ' +
      'a nie są benchmarkami z książki. W razie wątpliwości sięgaj do oryginału: rozdziały 3–8 mają komplet opisów ' +
      'i wyników eksperymentalnych.</div>'
  });

})(window.DECK);
