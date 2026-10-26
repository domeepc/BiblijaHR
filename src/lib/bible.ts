// Build-time access to the generated Bible data (never shipped to the browser).
import fs from 'node:fs';
import path from 'node:path';
import { adjacency, bookIndexOfVerse, reverseRefs, type Book, type Refs } from './shared';

type Bible = { books: Book[]; k: number[]; v: string[]; r: Refs; m: [number, number, number][];
  vb: Int16Array; rev: number[][] };

let cache: Bible | undefined;

export function getBible(): Bible {
  if (cache) return cache;
  const file = path.join(process.cwd(), 'data/generated/bible.json');
  if (!fs.existsSync(file)) throw new Error('Nema podataka: pokrenite najprije `npm run data`.');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache = { ...raw, vb: bookIndexOfVerse(raw.books), rev: reverseRefs(raw.r) };
  return cache!;
}

/** Links of verse `i` (at least 3 votes), strongest first. */
export function linksOf(i: number) {
  const B = getBible();
  return [...adjacency(B.r, B.rev, i, 3).values()].sort((a, b) => b.v - a.v);
}

export function snippet(text: string, max = 120) {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return text.slice(0, cut > 60 ? cut : max) + ' …';
}
