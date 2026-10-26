"""Download Šarić's Bible and the openbible.info cross references from
scrollmapper/bible_databases and turn them into the data the site is built from.

Outputs
  data/generated/bible.json   everything, read by Astro at build time
  public/data/graph.json      verse keys + references + book matrix, for the network island
  public/data/text/<b>.json   verse texts of book <b>, fetched lazily by the island
"""
import collections
import csv
import json
import sqlite3
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
GEN = ROOT / "data" / "generated"
PUB = ROOT / "public" / "data"
SRC = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats"
MIN_VOTES = 3      # references with fewer votes are dropped
CAP = 16           # strongest outgoing references kept per verse

BOOKS = [
    ("Genesis", "Postanak", "Post"), ("Exodus", "Izlazak", "Izl"), ("Leviticus", "Levitski zakonik", "Lev"),
    ("Numbers", "Brojevi", "Br"), ("Deuteronomy", "Ponovljeni zakon", "Pnz"), ("Joshua", "Jošua", "Jš"),
    ("Judges", "Suci", "Suci"), ("Ruth", "Ruta", "Rut"), ("1 Samuel", "1. Samuelova", "1 Sam"),
    ("2 Samuel", "2. Samuelova", "2 Sam"), ("1 Kings", "1. Kraljevima", "1 Kr"), ("2 Kings", "2. Kraljevima", "2 Kr"),
    ("1 Chronicles", "1. Ljetopisa", "1 Ljet"), ("2 Chronicles", "2. Ljetopisa", "2 Ljet"), ("Ezra", "Ezra", "Ezr"),
    ("Nehemiah", "Nehemija", "Neh"), ("Esther", "Estera", "Est"), ("Job", "Job", "Job"), ("Psalms", "Psalmi", "Ps"),
    ("Proverbs", "Mudre izreke", "Izr"), ("Ecclesiastes", "Propovjednik", "Prop"),
    ("Song of Solomon", "Pjesma nad pjesmama", "Pj"), ("Isaiah", "Izaija", "Iz"), ("Jeremiah", "Jeremija", "Jr"),
    ("Lamentations", "Tužaljke", "Tuž"), ("Ezekiel", "Ezekiel", "Ez"), ("Daniel", "Daniel", "Dn"),
    ("Hosea", "Hošea", "Hoš"), ("Joel", "Joel", "Jl"), ("Amos", "Amos", "Am"), ("Obadiah", "Obadija", "Ob"),
    ("Jonah", "Jona", "Jon"), ("Micah", "Mihej", "Mih"), ("Nahum", "Nahum", "Nah"), ("Habakkuk", "Habakuk", "Hab"),
    ("Zephaniah", "Sefanija", "Sef"), ("Haggai", "Hagaj", "Hag"), ("Zechariah", "Zaharija", "Zah"),
    ("Malachi", "Malahija", "Mal"), ("Matthew", "Matej", "Mt"), ("Mark", "Marko", "Mk"), ("Luke", "Luka", "Lk"),
    ("John", "Ivan", "Iv"), ("Acts", "Djela apostolska", "Dj"), ("Romans", "Rimljanima", "Rim"),
    ("1 Corinthians", "1. Korinćanima", "1 Kor"), ("2 Corinthians", "2. Korinćanima", "2 Kor"),
    ("Galatians", "Galaćanima", "Gal"), ("Ephesians", "Efežanima", "Ef"), ("Philippians", "Filipljanima", "Fil"),
    ("Colossians", "Kološanima", "Kol"), ("1 Thessalonians", "1. Solunjanima", "1 Sol"),
    ("2 Thessalonians", "2. Solunjanima", "2 Sol"), ("1 Timothy", "1. Timoteju", "1 Tim"),
    ("2 Timothy", "2. Timoteju", "2 Tim"), ("Titus", "Titu", "Tit"), ("Philemon", "Filemonu", "Flm"),
    ("Hebrews", "Hebrejima", "Heb"), ("James", "Jakovljeva", "Jak"), ("1 Peter", "1. Petrova", "1 Pt"),
    ("2 Peter", "2. Petrova", "2 Pt"), ("1 John", "1. Ivanova", "1 Iv"), ("2 John", "2. Ivanova", "2 Iv"),
    ("3 John", "3. Ivanova", "3 Iv"), ("Jude", "Judina", "Jd"), ("Revelation", "Otkrivenje", "Otk"),
]


def slug(s):
    s = unicodedata.normalize("NFKD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return "-".join(s.split())


def norm_book(b):
    b = {"Revelation of John": "Revelation"}.get(b, b)
    for roman, arabic in (("III ", "3 "), ("II ", "2 "), ("I ", "1 ")):
        if b.startswith(roman):
            return arabic + b[len(roman):]
    return b


def fetch(rel, name):
    target = RAW / name
    if not target.exists():
        print("preuzimam", rel)
        urllib.request.urlretrieve(f"{SRC}/{rel}", target)
    return target


def main():
    for d in (RAW, GEN, PUB / "text"):
        d.mkdir(parents=True, exist_ok=True)
    csv_path = fetch("csv/CroSaric.csv", "CroSaric.csv")
    dbs = [fetch(f"sqlite/extras/cross_references_{i}.db", f"cross_references_{i}.db") for i in range(7)]

    book_index = {eng: i for i, (eng, _, _) in enumerate(BOOKS)}
    verses = {}
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            b = norm_book(row["Book"])
            if b in book_index:  # the deuterocanonical books have no cross references
                verses[(book_index[b], int(row["Chapter"]), int(row["Verse"]))] = row["Text"].strip()
    keys = sorted(verses)
    idx = {k: i for i, k in enumerate(keys)}

    books = []
    for i, (_, name, abbr) in enumerate(BOOKS):
        ks = [k for k in keys if k[0] == i]
        chs = sorted({k[1] for k in ks})
        books.append({"n": name, "a": abbr, "slug": slug(abbr), "t": 0 if i < 39 else 1,
                      "s": idx[ks[0]], "c": len(ks), "chs": chs,
                      "vc": [sum(1 for k in ks if k[1] == ch) for ch in chs]})  # verses per chapter
    assert len({b["slug"] for b in books}) == len(books), "book slugs must be unique"

    matrix = collections.Counter()
    per_verse = collections.defaultdict(list)
    for db in dbs:
        rows = sqlite3.connect(db).execute(
            "select from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes"
            " from cross_references")
        for fb, fc, fv, tb, tc, ts, te, votes in rows:
            a = (book_index.get(norm_book(fb)), fc, fv)
            b = (book_index.get(norm_book(tb)), tc, ts)
            if a not in idx or b not in idx:
                continue
            if votes > 0 and a[0] != b[0]:
                matrix[tuple(sorted((a[0], b[0])))] += 1
            if votes >= MIN_VOTES:
                per_verse[idx[a]].append((votes, idx[b], max(0, (te or ts) - ts)))

    refs = [0] * len(keys)
    kept = 0
    for i, lst in per_verse.items():
        lst.sort(reverse=True)
        lst = lst[:CAP]
        kept += len(lst)
        refs[i] = [x for votes, t, span in lst for x in (t, span, votes)]

    k = [ch * 1000 + v for _, ch, v in keys]
    m = [[a, b, c] for (a, b), c in sorted(matrix.items())]
    texts = [verses[key] for key in keys]

    dump = lambda obj, path: path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dump({"books": books, "k": k, "v": texts, "r": refs, "m": m}, GEN / "bible.json")
    dump({"books": books, "k": k, "r": refs, "m": m}, PUB / "graph.json")
    for i, b in enumerate(books):
        dump(texts[b["s"]:b["s"] + b["c"]], PUB / "text" / f"{i}.json")
    print(f"{len(keys)} redaka, {kept} referenci, {len(m)} parova knjiga")


if __name__ == "__main__":
    main()
