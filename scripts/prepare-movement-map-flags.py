from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


FLAG_FILES = {
    "buyuk-kartaca": "Büyük Kartaca.png",
    "gaut-kralligi": "Gaut Krallığı.png",
    "iransahr": "İranşahr.png",
    "nil-imparatorlugu": "Nil İmparatorluğu.png",
    "sarmatya": "Sarmatya.jpg",
    "satraplar": "satraplar.jpg",
    "trakya": "Trakya.png",
    "xianbei-konfederasyonu": "Xianbei Konfederasyonu.jpg",
    "roma": "Roma.png",
    "anadolu-kralligi": "Anadolu Krallığı.png",
    "bosporos-kralligi": "Bosporos Krallığı.png",
    "iberya": "İberya.png",
    "saketler": "Saketler.png",
    "sebe": "Sebe.png",
}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare-movement-map-flags.py SOURCE_DIR OUTPUT_DIR")
    source_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    for slug, filename in FLAG_FILES.items():
        source = source_dir / filename
        with Image.open(source) as original:
            image = original.convert("RGBA")
            image.thumbnail((144, 96), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (144, 96), (0, 0, 0, 0))
            canvas.alpha_composite(image, ((144 - image.width) // 2, (96 - image.height) // 2))
            canvas.save(output_dir / f"{slug}.webp", "WEBP", quality=88, method=6)
    print(f"prepared {len(FLAG_FILES)} movement-map flags")


if __name__ == "__main__":
    main()
