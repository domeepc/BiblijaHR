// Helpers used both at build time (Astro pages) and in the browser (island, header script).

export type Book = { n: string; a: string; slug: string; t: 0 | 1; s: number; c: number; chs: number[]; vc: number[] };
export type Refs = (number[] | 0)[]; // per verse: flat [target, span, votes, ...] or 0

export type Link = { i: number; v: number; span: number; dir: 'out' | 'in' | 'both' };

export const chapterOf = (k: number[], i: number) => Math.floor(k[i] / 1000);
export const verseOf = (k: number[], i: number) => k[i] % 1000;

export function chapterHref(base: string, book: Book, ch: number, v?: number) {
  return `${base}${book.slug}/${ch}/` + (v ? `#v${v}` : '');
}

export function refLabel(books: Book[], vb: ArrayLike<number>, k: number[], i: number, span = 0) {
  const v = verseOf(k, i);
  return `${books[vb[i]].a} ${chapterOf(k, i)},${v}` + (span ? `–${v + span}` : '');
}

export function bookIndexOfVerse(books: Book[]) {
  const n = books[books.length - 1].s + books[books.length - 1].c;
  const vb = new Int16Array(n);
  books.forEach((b, bi) => vb.fill(bi, b.s, b.s + b.c));
  return vb;
}

/** Reverse index: for each verse, the verses that reference it, as flat [from, votes, ...]. */
export function reverseRefs(r: Refs) {
  const rev: number[][] = new Array(r.length);
  r.forEach((list, i) => {
    if (!list) return;
    for (let j = 0; j < list.length; j += 3) (rev[list[j]] ||= []).push(i, list[j + 2]);
  });
  return rev;
}

/** Every verse linked to `i` in either direction with at least `minV` votes. */
export function adjacency(r: Refs, rev: number[][], i: number, minV: number) {
  const m = new Map<number, Link>();
  const out = r[i];
  if (out) for (let j = 0; j < out.length; j += 3) {
    if (out[j + 2] < minV) continue;
    const p = m.get(out[j]);
    if (!p || p.v < out[j + 2]) m.set(out[j], { i: out[j], v: out[j + 2], span: out[j + 1], dir: 'out' });
  }
  const inc = rev[i];
  if (inc) for (let j = 0; j < inc.length; j += 2) {
    if (inc[j + 1] < minV) continue;
    const p = m.get(inc[j]);
    if (p) { p.dir = p.dir === 'out' ? 'both' : p.dir; if (inc[j + 1] > p.v) p.v = inc[j + 1]; }
    else m.set(inc[j], { i: inc[j], v: inc[j + 1], span: 0, dir: 'in' });
  }
  return m;
}

export function findVerse(books: Book[], k: number[], b: number, ch: number, v: number) {
  const B = books[b];
  let first = -1;
  for (let i = B.s; i < B.s + B.c; i++) {
    if (chapterOf(k, i) !== ch) continue;
    if (first < 0) first = i;
    if (verseOf(k, i) === v) return i;
  }
  return first;
}

/** Lower-case, strip diacritics, spaces, dots and dashes: "1. Korinćanima" -> "1korincanima". */
export const fold = (s: string) =>
  s.toLowerCase().replace(/đ/g, 'd').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[.\s-]/g, '');
