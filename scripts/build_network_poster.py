"""Render a compact, no-JavaScript poster from the generated cross-reference graph."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data/graph.json"
OUTPUT = ROOT / "public/images/full-network-poster.webp"
W, H, SCALE = 1200, 560, 2
BASE, BAR = 424, 92
X0, XW = 16, 1168
MIN_VOTES = 3


def font(size: int):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size * SCALE)
    return ImageFont.load_default()


def main():
    graph = json.loads(DATA.read_text())
    books, verses, refs = graph["books"], len(graph["k"]), graph["r"]
    testament_by_verse = [0] * verses
    for book in books:
        testament_by_verse[book["s"] : book["s"] + book["c"]] = [book["t"]] * book["c"]
    scale = SCALE
    image = Image.new("RGB", (W * scale, H * scale), "#f6f2e8")
    draw = ImageDraw.Draw(image, "RGBA")

    strongest = {}
    for index, items in enumerate(refs):
        if not items:
            continue
        for offset in range(0, len(items), 3):
            target, votes = items[offset], items[offset + 2]
            if target == index or votes < MIN_VOTES:
                continue
            a, b = min(index, target), max(index, target)
            key = a * verses + b
            strongest[key] = max(strongest.get(key, 0), votes)

    bins = [[[], []] for _ in range(36)]
    for key, votes in strongest.items():
        a, b = divmod(key, verses)
        ratio = (b - a) / verses
        bins[min(35, int(ratio**0.5 * 36))][testament_by_verse[a]].append((a, b))

    density = min(1, 7500 / max(len(strongest), 1))
    for bin_index in range(len(bins) - 1, -1, -1):
        for testament, edges in enumerate(bins[bin_index]):
            rgb = (189, 72, 24) if testament == 0 else (39, 88, 140)
            alpha = round((0.018 + 0.03 * (bin_index / 36)) * density * 255)
            for a, b in edges:
                x1 = round((X0 + (a + 0.5) / verses * XW) * scale)
                x2 = round((X0 + (b + 0.5) / verses * XW) * scale)
                radius_x = max(1, (x2 - x1) // 2)
                radius_y = round(radius_x * 0.66)
                y = BASE * scale
                draw.arc((x1, y - radius_y, x2, y + radius_y), 180, 360, fill=(*rgb, alpha), width=1 * scale)

    max_chapter = max(max(book["vc"]) for book in books)
    for book in books:
        for chapter_index, count in enumerate(book["vc"]):
            start = book["s"] + sum(book["vc"][:chapter_index])
            x = round((X0 + start / verses * XW) * scale)
            width = max(1, round(count / verses * XW * scale))
            height = round(count / max_chapter * BAR * scale)
            fill = "#c17b57" if book["t"] == 0 else "#6f91b4"
            draw.rectangle((x, (BASE + 4) * scale, x + width, (BASE + 4) * scale + height), fill=fill)

    regular = font(8)
    label_indices = list(range(0, len(books), 6))
    if label_indices[-1] != len(books) - 1:
        label_indices.append(len(books) - 1)
    for index in label_indices:
        book = books[index]
        x = round((X0 + (book["s"] + book["c"] / 2) / verses * XW) * scale)
        draw.text((x, (BASE + BAR + 18) * scale), book["a"], font=regular, fill="#57534a", anchor="mm")

    image = image.resize((W, H), Image.Resampling.LANCZOS)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "WEBP", quality=84, method=6)
    print(f"Wrote {OUTPUT} ({len(strongest):,} reference pairs)")


if __name__ == "__main__":
    main()
