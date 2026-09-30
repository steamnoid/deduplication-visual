/* slides/ch7.js — rozdział 7: delta compression */

(function (D) {
  const L = 'Rozdział 7 · Delta';

  D.slide({
    id: 'ch7-1', chapter: 7, chapterLabel: L, kicker: 'Idea', num: '7.1',
    title: 'Duplikat to nie to samo co podobne',
    lead: 'Dwa pliki różniące się jedną literą mają jeden wspólny chunk i dziewięć różnych. Dedup widzi tylko ten jeden. Reszta trafia na dysk jak zwykle — choć da się ją zapisać w kilku bajtach.',
    scene: 'delta-encoding',
    caption: '<b>Co widać:</b> baza, jej zmodyfikowana wersja z trzema podświetlonymi znakami, wygenerowane instrukcje ' +
      'COPY/INS, a pod nimi rekonstrukcja. Na dole porównanie: pełna kopia i delta w bajtach.',
    points: [
      'Delta compression opisuje plik jako <strong>instrukcje</strong>: skopiuj spójny kawałek bazy, wstaw literał.',
      'Dedup i delta <strong>nie konfliktują</strong>: pierwszy usuwa identyczne fragmenty, drugi kompresuje podobne.',
      'Na naszym krótkim przykładzie oszczędność jest czysto teoretyczna — na plikach binarnych bywa kolosalna.'
    ]
  });

  D.slide({
    id: 'ch7-2', chapter: 7, chapterLabel: L, kicker: 'Ddelta', num: '7.2',
    title: 'Ddelta: najdrożej jest szukanie, nie kodowanie',
    lead: 'Klasyczna delta musi przeszukać cały plik, żeby znaleźć najdłuższe pasujące fragmenty. Ale po dedupie plik nie jest dowolny: fragmenty podobne leżą obok siebie.',
    scene: 'ddelta',
    caption: '<b>Co widać:</b> pasek pliku z zaznaczonymi fragmentami-duplikatami i oknem skanu, które zaczyna szeroko, ' +
      'a potem kurczy się do sąsiedztwa duplikatów. Niżej porównanie kosztu z klasyczną deltą.',
    points: [
      'Koszt delty rośnie z rozmiarem pliku — <strong>skanowanie jest wąskim gardłem</strong>, nie samo kodowanie.',
      'Gear-based fast chunking tnie chunki na <strong>słowa</strong> (średnio 64 B); dla słów liczony jest szybki hash (Spooky), ' +
      'a trafienie potwierdza <strong>memcmp</strong>, czyli porównanie bajtów.',
      '<strong>Greedy scanning</strong> rozszerza potem wyszukiwanie na obszary sąsiadujące ze znalezionymi duplikatami — ' +
      'dlatego nie trzeba przeszukiwać całego pliku.'
    ]
  });

  D.slide({
    id: 'ch7-3', chapter: 7, chapterLabel: L, kicker: 'DARE', num: '7.3',
    title: 'DARE: najpierw wykryj podobieństwo, potem koduj',
    lead: 'Delta dla dwóch zupełnie różnych plików to zmarnowany czas i skompresowany szum. Dlatego przed deltą system musi znaleźć pary, które faktycznie są podobne — tanio i z datami, które warto sprawdzić.',
    scene: 'dare',
    caption: '<b>Co widać:</b> trzy etapy w górnym pasku i para plików niżej: super-feature każdego chunka, ' +
      'trafiona para, zmierzone podobieństwo. Dwa suwaki na dole to progi, którymi sterujemy czułością wyszukiwania.',
    points: [
      'Pełna nazwa: <strong>Deduplication-Aware Resemblance Detection and Elimination</strong> — wykrywanie podobieństwa, ' +
      'a nie usuwanie redundancji.',
      '<strong>Super-feature</strong> to grupa cech zebranych z <strong>kolejnych bloków</strong> — deskryptor jest tańszy, ' +
      'gdy opisuje fragment pliku, a nie pojedynczy chunk.',
      '<strong>DupAdj</strong> (duplicate adjacency): dwa bloki uznaje się za podobne tylko wtedy, gdy ich ' +
      '<strong>sąsiedzi</strong> są duplikatami — tani warunek, który bardzo odsiewa kandydatów.',
      'Efekt: znacznie więcej CPU na etapie wykrywania, <strong>zero zmarnowanej delty</strong> na parach bezsensownych.'
    ]
  });

  D.slide({
    id: 'ch7-4', chapter: 7, chapterLabel: L, kicker: 'Kiedy', num: '7.3',
    title: 'Kiedy delta się opłaca, a kiedy szkodzi',
    full: '<div class="cheat">' +
      '<div class="cheat-card" style="--c:#06d6a0"><h4 style="color:#06d6a0">Opłaca się</h4>' +
      '<dl><dt>dane</dt><dd>obrazy VM, kolejne wersje plików, migawki baz</dd>' +
      '<dt>zmiana</dt><dd>mała część pliku</dd>' +
      '<dt>efekt</dt><dd>zapisujemy ułamek rozmiaru</dd>' +
      '<dt>kolejność</dt><dd>najpierw dedup, potem wykrywanie, na końcu delta</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#ef476f"><h4 style="color:#ef476f">Szkodzi</h4>' +
      '<dl><dt>dane</dt><dd>pliki losowe, skompresowane archiwa</dd>' +
      '<dt>zmiana</dt><dd>cały plik</dd>' +
      '<dt>efekt</dt><dd>delta wyższa niż oryginał plus koszt CPU</dd></dl></div>' +
      '<div class="cheat-card" style="--c:#5aa9e6"><h4 style="color:#5aa9e6">Warunek</h4>' +
      '<dl><dt>test</dt><dd>zmierzamy realny współczynnik na własnych danych</dd>' +
      '<dl><dt>próg</dt><dd>poniżej niego w ogóle nie kodujemy</dd>' +
      '<dd>typowo</dt><dd>podobieństwo powyżej 50–70%</dd></dl></div>' +
      '</div>' +
      '<div class="callout">Delta jest <b>uzupełnieniem</b> dedupu, nie zamiennikiem. ' +
      'Najpierw usuwamy identyczne fragmenty, potem kompresujemy to, co zostało i jest podobne.</div>'
  });

  D.slide({
    id: 'ch7-5', chapter: 7, chapterLabel: L, kicker: 'Podsumowanie', num: '7.4',
    title: 'Co zostaje z rozdziału 7',
    points: [
      'Po dedupie zostają dane <strong>podobne, ale nie identyczne</strong> — i one kosztują najwięcej.',
      'Największym kosztem delty nie jest kodowanie, tylko <strong>znalezienie dopasowania</strong>.',
      '<strong>Ddelta</strong> ogranicza skanowanie do sąsiedztwa znalezionych duplikatów, <strong>DARE</strong> sprawdza, ' +
      'czy para w ogóle jest podobna — zanim policzymy dla niej deltę.',
      'Oba pomysły zakładają to samo: <strong>dedup zmienia strukturę danych</strong> i tę strukturę można wykorzystać.'
    ]
  });

})(window.DECK);
