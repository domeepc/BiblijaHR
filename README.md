# Mreža stihova — Šarićeva Biblija

Statična Astro stranica: Biblija u prijevodu Ivana Šarića za čitanje, s granom unakrsnih referenci uz svaki redak, i interaktivna mreža veza (Preact otok).

## Pokretanje

Treba Node.js ≥ 22.23 i Python 3.

```sh
npm install
npm run data      # preuzima CroSaric + cross_references sa scrollmapper/bible_databases i gradi podatke
npm run dev       # http://localhost:4321
npm run build     # statična stranica u dist/
```

`npm run data` sprema sirove datoteke u `data/raw/` (preuzimaju se samo jednom), a izlaz u `data/generated/` (za build) i `public/data/` (za mrežu u pregledniku).

## Struktura

- `scripts/build_data.py` — CSV + SQLite → JSON (redci, reference s ≥ 3 glasa, najviše 16 po retku, matrica knjiga)
- `src/pages/[book]/[chapter].astro` — 1 189 stranica za čitanje; grane i izbornici referenci (HTML `popover`) generiraju se pri buildu
- `src/pages/mreza.astro` + `src/components/Network.tsx` — lučni dijagram, graf retka, „srodni stihovi” (Jaccard)
- `src/layouts/Base.astro` — zaglavlje, traženje reference, postavke izgleda (spremaju se u `localStorage`)
- `src/lib/shared.ts` — zajednička logika (reference, susjedstvo, parsiranje „Iv 3,16”)

## Objava

`dist/` se može postaviti na bilo koji statični hosting. Za podstazu (npr. GitHub Pages `/BiblijaHR/`) postavite `base` u `astro.config.mjs`.

## Izvori i licence

- Tekst: Biblija, prijevod Ivana Šarića (CroSaric), iz [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases). Prije javne objave provjerite autorsko-pravni status prijevoda.
- Unakrsne reference: [openbible.info](https://www.openbible.info/labs/cross-references/), CC BY.
