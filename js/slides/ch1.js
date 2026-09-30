/* slides/ch1.js — rozdział 1: dedup wyrósł z backupu */

(function (D) {
  const L = 'Rozdział 1 · Backup';

  D.slide({
    id: 'ch1-1', chapter: 1, chapterLabel: L, kicker: 'Geneza', num: '1.1',
    title: 'Backup z definicji kopiuje dane, które już istnieją',
    lead: 'Zwykła kopia zapasowa nie patrzy na to, co jest już na nośniku. Robi dokładnie to, co jej powiedziano: zapisuje plik. Powtarzane codziennie, generuje tę samą zawartość w nowym miejscu.',
    points: [
      'Dane w firmie są <strong>powtarzalne z natury</strong>: szablony, biblioteki, logi, migawki, obrazy maszyn wirtualnych.',
      'Zmiana jednego bajta w pliku nie oznacza nowego pliku — a jednak przyrostowa kopia przepisuje wiele bloków.',
      'Różnica rośnie z <strong>głębokością retencji</strong>: im więcej wersji trzymasz, tym więcej danych do przechowywania.'
    ],
    html: '<div class="callout">Rozdział 1 książki nie opisuje jeszcze żadnych algorytmów. Robi coś ważniejszego: ' +
      'ustala <b>dlaczego</b> w ogóle powstało całe pole dedupu i jaką krzywą oszczędności kończy się każda kolejna kopia.</div>'
  });

  D.slide({
    id: 'ch1-2', chapter: 1, chapterLabel: L, kicker: 'Porównanie strategii', num: '1.2',
    title: 'Pełna, przyrostowa czy z dedupem — co naprawdę kosztuje',
    lead: 'Ten sam zbiór plików, dziesięć zachowanych wersji. Porównujemy nie tylko miejsce, ale też to, jak wygląda odtworzenie konkretnej wersji.',
    scene: 'backup-evolution',
    caption: '<b>Co widać:</b> każdy słupek to jedna wersja w czasie, a wysokość to ile bajtów faktycznie trafia na dysk. ' +
      'Przy dedupie kolejne wersje to w praktyce same metadane, a restore jednej wersji to jeden skok po chunkach, ' +
      'a nie zastosowanie dziewięciu różnic po kolei.',
    points: [
      'Przyrostowo oszczędza <strong>miejsce</strong>, ale wydłuża <strong>restore</strong> — zależność od poprzedniej wersji.',
      'Dedup trzyma te same unikalne chunki, a każdą wersję odtwarza niezależnie.'
    ]
  });

  D.slide({
    id: 'ch1-3', chapter: 1, chapterLabel: L, kicker: 'Nowa rola', num: '1.3',
    title: 'Backup przestaje być kopią, a staje się systemem plików',
    lead: 'Gdy w systemie pojawia się indeks i metadane, backup przestaje być prostym zapisem. Staje się warstwą, która sama decyduje, co zapisać.',
    points: [
      'Dodaje się <strong>indeks</strong>: mapa odcisków → lokalizacji danych. To on odpowiada na pytanie „czy to już mamy?”.',
      'Dodaje się <strong>warstwa metadanych</strong>: plik to lista referencji do chunków, nie ciągły blok bajtów.',
      'Pojawiają się nowe problemy: fragmentacja, przywracanie, garbage collection, bezpieczeństwo kluczy.',
      'System, który sam decyduje, co zapisać, musi też umieć <strong>posprzątać</strong> i <strong>odtworzyć</strong>.'
    ],
    html: '<div class="callout">Dlatego książka nie kończy się na „jak znaleźć duplikat”. Rozdziały 5–8 to koszt tej decyzji: ' +
      '<b>śmieci po usuwaniu</b>, <b>przywracanie</b>, <b>sprzątanie</b> i <b>utajnianie</b> danych, które wyglądają jak duplikaty.</div>'
  });

})(window.DECK);
