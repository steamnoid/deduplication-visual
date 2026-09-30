/* sim/delta.js — kompresja delta na poziomie bajtów (rozdział 7).

   Dedup odpowiada na pytanie „czy te bajty już widziałem?". Delta
   odpowiada na inne: „jak te bajty mają się do tych, które zaraz obok
   leżą na dysku?". Chunk, którego nie ma w indeksie, i tak prawie nigdy
   nie jest nowy w całości — zwykle jest przesuniętą albo lekko zmienioną
   kopią czegoś, co już zapisaliśmy.

   Format jest prawdziwy i samowystarczalny: rekord na dysku to
   nagłówek + lista operacji, więc rozmiar delty policzony w symulatorze
   to rozmiar, który faktycznie zajmuje miejsce. Nagłówek też kosztuje,
   i przy małych deltach potrafi być większy niż surowy chunk — dlatego
   zapisujemy deltę tylko wtedy, gdy faktycznie się opłaca.

   Dopasowanie: okno o stałej szerokości, podpis gear, indeks kotwic
   w bajcie docelowym. Kotwica daje punkt startu, potem rozszerzamy
   dopasowanie w przód i w tył. To ten sam pomysł co w zdelta, tylko
   bez tabel haszowych i bez kompresji wtórnej. */
(function (NS) {
  'use strict';

  const WIN = 16;          // szerokość okna dla kotwic
  const STEP = 8;          // co ile bajtów próbujemy kotwicę
  const MIN_COPY = 24;     // krótsze dopasowanie nie jest warte kodowania
  // tabela gear z silnika; szukamy jej leniwie, żeby kolejność skryptów nie miała znaczenia
  function gear() { return NS.sim.GEAR; }

  function winHash(buf, at) {
    let h = 0;
    const G = gear();
    for (let i = 0; i < WIN; i++) h = ((h << 1) + G[buf[at + i] & 0xff]) | 0;
    return h >>> 0;
  }

  /* Zwraca listę operacji: {c:1, off, len} = skopiuj z bajtu off,
     {i:1, off, len} = wstaw len bajtów z bufora źródłowego. */
  function encode(target, src) {
    const ops = [];
    if (!target || target.length === 0) {
      ops.push({ i: 1, off: 0, len: src.length });
      return ops;
    }

    // kotwice w bajcie docelowym: hash -> przesunięcie
    const anchors = new Map();
    for (let i = 0; i + WIN <= target.length; i += STEP) {
      const h = winHash(target, i);
      if (!anchors.has(h)) anchors.set(h, i);
    }

    let pending = 0;   // od ilu bajtów src czekamy na dane do wstawienia
    let i = 0;
    while (i + WIN <= src.length) {
      const h = winHash(src, i);
      const at = anchors.get(h);
      if (at === undefined) { i++; continue; }

      // rozszerz dopasowanie w tył i w przód
      let back = 0;
      while (i - back > 0 && at - back > 0 && src[i - back - 1] === target[at - back - 1]) back++;
      let fwd = WIN;
      while (i + fwd < src.length && at + fwd < target.length && src[i + fwd] === target[at + fwd]) fwd++;
      const start = i - back, len = back + fwd;
      if (len >= MIN_COPY) {
        if (start > pending) ops.push({ i: 1, off: pending, len: start - pending });
        ops.push({ c: 1, off: at - back, len });
        pending = start + len;
        i = start + len;
      } else {
        i++;
      }
    }
    if (pending < src.length) ops.push({ i: 1, off: pending, len: src.length - pending });
    return ops;
  }

  /* Kodowanie rekordu na bajty. Rekord jest samowystarczalny: opcja
     COPY mówi, skąd skopiować z bajtu docelowego, a opcja INS niesie
     swoje literalne bajty wewnątrz rekordu. Bez tego restore po miesiącu
     nie miałby skąd wziąć danych wstawianych. */
  function writeVarint(out, v) {
    while (v > 127) { out.push((v & 127) | 128); v >>>= 7; }
    out.push(v & 127);
  }
  function readVarint(buf, p) {
    let v = 0, shift = 0, b;
    do { b = buf[p.i++]; v |= (b & 127) << shift; shift += 7; } while (b & 128);
    return v;
  }

  /* Pierwszy bajt rekordu mówi, co to jest: 0 = surowe bajty,
     1 = delta. Dzięki temu bajty na dysku same opisują swoją treść. */
  const RAW = 0x00, DELTA = 0x01;

  function record(ops, src) {
    const body = [];
    for (const o of ops) {
      if (o.c) {
        body.push(0xC0);
        writeVarint(body, o.off);
        writeVarint(body, o.len);
      } else {
        body.push(0xA0);
        writeVarint(body, o.len);
        for (let k = 0; k < o.len; k++) body.push(src[o.off + k]);
      }
    }
    const out = new Uint8Array(1 + body.length);
    out[0] = DELTA;
    out.set(body, 1);
    return out;
  }

  function rawRecord(bytes) {
    const out = new Uint8Array(1 + bytes.length);
    out[0] = RAW;
    out.set(bytes, 1);
    return out;
  }

  function parse(buf) {
    if (!buf.length) return { kind: 'empty' };
    if (buf[0] === RAW) return { kind: 'raw', data: buf.subarray(1) };
    const ops = [];
    const p = { i: 1 };
    while (p.i < buf.length) {
      const t = buf[p.i++];
      if (t === 0xC0) {
        const off = readVarint(buf, p), len = readVarint(buf, p);
        ops.push({ c: 1, off, len });
      } else {
        const len = readVarint(buf, p);
        ops.push({ i: 1, len, data: buf.subarray(p.i, p.i + len) });
        p.i += len;
      }
    }
    return { kind: 'delta', ops };
  }

  /* Złożenie rekordu. Potrzebujemy tylko bajtu docelowego i rekordu —
     tak wygląda prawdziwy restore, po miesiącu i wielu przebiegach GC. */
  function apply(target, rec, total) {
    const out = new Uint8Array(total);
    let o = 0;
    for (const op of rec.ops) {
      if (op.c) {
        if (!target || op.off + op.len > target.length) return null;
        out.set(target.subarray(op.off, op.off + op.len), o);
      } else {
        out.set(op.data, o);
      }
      o += op.len;
    }
    return o === total ? out : null;
  }

  NS.delta = { encode, record, rawRecord, parse, apply, WIN, STEP, MIN_COPY, RAW, DELTA };
})(window.SIM = window.SIM || {});
