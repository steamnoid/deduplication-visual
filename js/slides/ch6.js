/* slides/ch6.js — rozdział 6: bezpieczny dedup */

(function (D) {
  const L = 'Rozdział 6 · Bezpieczeństwo';

  D.slide({
    id: 'ch6-1', chapter: 6, chapterLabel: L, kicker: 'Problem', num: '6.1',
    title: 'Dedup sam w sobie jest wyciekiem informacji',
    lead: 'Jeśli serwer porównuje Twoje dane ze swoim indeksem, to jego czas odpowiedzi mówi, czy te dane u niego są. Atakujący nie musi znać treści — wystarczy, że zgadnie nazwę pliku.',
    scene: 'dedup-leak',
    caption: '<b>Co widać:</b> dwa przebiegi tej samej operacji. Gdy pliku nie ma, serwer musi zapisać chunk i zaktualizować indeks — ' +
      'odpowiada wolniej. Gdy plik jest, nie zapisuje nic i odpowiada szybko. Różnica jest mierzalna.',
    points: [
      'To znany atak na <strong>information leakage</strong>: czas reakcji staje się kanałem bocznym.',
      'Wniosek: system, który chce dedupować poufne dane, musi mieć <strong>stały</strong> czas i rozmiar odpowiedzi.'
    ]
  });

  D.slide({
    id: 'ch6-2', chapter: 6, chapterLabel: L, kicker: 'CE', num: '6.1',
    title: 'Szyfrowanie zbieżne: dedup nad zaszyfrowanymi danymi',
    lead: 'Rozwiązanie jest eleganckie, bo nie rezygnuje z dedupu. Zamiast szyfrowania losowego stosujemy takie, które da się powtarzać: ten sam plaintext zawsze daje ten sam ciphertext.',
    points: [
      'Klucz wyprowadzany z <strong>zawartości chunka</strong> (plus sól), a nie z losowego ziarna — inaczej ten sam chunk dawałby różne wyniki i dedup by zniknął.',
      'Serwer porównuje zaszyfrowane bloki. Widzi, że coś już ma, <strong>nie wiedząc co</strong>.',
      'Ta sama własność daje bonus: <strong>integralność</strong> — podmiana zaszyfrowanego bloku unieważnia klucz, ' +
      'więc dane stają się odporne na atakującego zapisującego na dysk.'
    ],
    points2: [],
    html: '<div class="callout">Dokładnie ta własność jest zaletą i problemem naraz. Ten sam plik zawsze daje ' +
      'ten sam szyfrgram — więc serwer widzi <b>zawsze to samo</b>, czyli może wciąż czytać z rozmiarów i czasów. ' +
      'Dlatego książka idzie dalej.</div>' +
      '<div class="callout" style="border-color:#ef476f55;background:#ef476f12"><b>Zastrzeżenie:</b> serwer nadal widzi ' +
      'rozmiary chunków i ich liczbę, a dane o niskiej entropii (teksty, dokumenty, hasła) można odgadywać atakiem ' +
      'słownikowym lub siłowym. Szyfrowanie zbieżne ukrywa treść — nie ukrywa profilu danych.</div>'
  });

  D.slide({
    id: 'ch6-3', chapter: 6, chapterLabel: L, kicker: 'Hierarchia kluczy', num: '6.2',
    title: 'CE, MLK, UACE, SecDep — cztery poziomy ukrywania',
    lead: 'Każde rozwiązanie dokłada jeden poziom: od ukrycia treści, przez ukrycie pliku, po ukrycie użytkownika i samego backupu.',
    scene: 'key-hierarchy',
    caption: '<b>Co widać:</b> cztery warianty po kolei. U góry wariant, po lewej łańcuch kluczy (serwer → właściciel), ' +
      'na dole symulacja tego, co widzi serwer: identyczne bloki oznaczają ten sam chunk. ' +
      'Przycisk Auto przewija warianty; wybór ręczny je zatrzymuje.',
    points: [
      '<strong>CE</strong> — szyfrogram wyprowadzany z zawartości, ten sam plaintext zawsze daje ten sam wynik.',
      '<strong>MLK</strong> (Message-Locked Key) — klucz wyprowadzany z <strong>wiadomości</strong>, a nie z nazwy pliku: ' +
      'to, co jest kluczem, jest właśnie treścią.',
      '<strong>UACE</strong> (User-Aware CE) — dochodzi sekret użytkownika, więc dwie osoby z tym samym plikiem ' +
      'nie współdzielą danych; system ma przy tym <strong>dwa poziomy dedupu</strong>: międzyużytkownikiowy na poziomie pliku ' +
      'i wewnątrzużytkownikiowy na poziomie chunka, każdy z inną polityką bezpieczeństwa.',
      '<strong>SecDep</strong> — scala MLK i UACE w <span class="tag">multi-level key management</span>: klucze są zarządzane ' +
      'na wielu poziomach, a serwer nie zdradza ani tożsamości pliku, ani właściciela.'
    ]
  });

  D.slide({
    id: 'ch6-4', chapter: 6, chapterLabel: L, kicker: 'Analiza', num: '6.2',
    title: 'Co naprawdę zostaje widoczne',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#ffd166"><h4 style="color:#ffd166">CE</h4>' +
      '<dl><dt>ukryte</dt><dd>treść danych</dd>' +
      '<dt>widoczne</dt><dd>profil: rozmiary chunków, liczba, czas odpowiedzi</dd>' +
      '<dt>ryzyko</dt><dd>atak słownikowy na dane niskiej entropii</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#48cae4"><h4 style="color:#48cae4">MLK</h4>' +
      '<dl><dt>ukryte</dt><dd>to, że dwa fragmenty danych to ta sama treść</dd>' +
      '<dt>klucz</dt><dd>wyprowadzany z wiadomości, nie z nazwy pliku</dd>' +
      '<dt>widoczne</dt><dd>dedup w obrębie jednego pliku</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#b388eb"><h4 style="color:#b388eb">UACE</h4>' +
      '<dl><dt>ukryte</dt><dd>udział w danych między użytkownikami</dd>' +
      '<dt>poziomy</dt><dd>dedup między kontami na pliku + wewnątrz konta na chunku</dd>' +
      '<dt>ratio</dt><dd>lekko niższe niż przy CE</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">SecDep</h4>' +
      '<dl><dt>ukryte</dt><dd>plik, właściciel i poziom dostępu</dd>' +
      '<dt>zarządzanie</dt><dd>multi-level key management</dd>' +
      '<dt>koszt</dt><dd>największy z całej czwórki</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Wspólny wniosek rozdziału: <b>nie da się mieć pełnego globalnego dedupu i pełnej prywatności naraz</b>. ' +
      'Każdy dodatkowy poziom ukrycia to świadome oddanie części oszczędności.</div>'
  });

  D.slide({
    id: 'ch6-5', chapter: 6, chapterLabel: L, kicker: 'Podsumowanie', num: '6.3',
    title: 'Co zostaje z rozdziału 6',
    points: [
      'Dedup <strong>zdradza obecność</strong> danych — i to przez kanał, którego łatwo nie zauważyć: czas odpowiedzi.',
      'Szyfrowanie zbieżne naprawia treść, ale samo w sobie nie ukrywa pliku ani użytkownika.',
      '<strong>UACE</strong> i <strong>SecDep</strong> dokładają kolejne poziomy, kosztem dedup ratio i złożoności.',
      'Wybór wariantu to decyzja <strong>polityczna</strong>, nie techniczna: ile oszczędności oddajesz za ile prywatności.'
    ]
  });

})(window.DECK);
