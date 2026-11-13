"""사무국 PC 전용 — PDF → 워터마크 webp 쪽 이미지 꾸러미(zip) (FR-MAT-08 · ADR-07)

서버에 반입하지 않는다 (deploy/pack.ps1 이 tools/render-pdf 를 뺀다). 서버는 결과 zip 만 받는다.
PDF 원본·쪽 이미지 원본(워터마크 없는 것)은 만들지도 남기지도 않는다 — 메모리에서 바로 워터마크를 찍는다.

설치 (사무국 PC · 한 번):
    py -3 -m venv .venv-render
    .venv-render\\Scripts\\pip install -r tools\\render-pdf\\requirements.txt

사용:
    .venv-render\\Scripts\\python tools\\render-pdf\\render_pdf.py 강의.pdf --title "자료 제목" --lecturer "성명 (소속)" --session DT --out 자료1.zip
"""

import argparse
import io
import json
import math
import sys
import zipfile
from pathlib import Path

try:
    import pymupdf as fitz  # PyMuPDF
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("PyMuPDF·Pillow 가 필요합니다: pip install -r tools/render-pdf/requirements.txt")

ROOT = Path(__file__).resolve().parents[2]
FONTS = ["C:/Windows/Fonts/malgun.ttf", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
         "/System/Library/Fonts/AppleSDGothicNeo.ttc"]


def load_cfg():
    return json.loads((ROOT / "config" / "app.json").read_text(encoding="utf-8"))


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


def watermark_text(cfg, label):
    return (cfg["materials"]["watermarkText"]
            .replace("{community}", cfg["brand"]["community"])
            .replace("{cohort}", cfg["cohort"]["name"])
            .replace("{label}", label))


def stamp(img, text, opacity=0.10):
    """대각선 반복 워터마크 + 아래 띠"""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    size = max(18, w // 40)
    f = font(size)
    tile = Image.new("RGBA", (int(size * len(text) * 0.75), size * 3), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((0, size), text, font=f, fill=(23, 23, 23, int(255 * opacity)))
    tile = tile.rotate(30, expand=True)
    for y in range(-tile.height, h + tile.height, max(1, int(tile.height * 0.45))):
        for x in range(-tile.width, w + tile.width, max(1, int(tile.width * 0.7))):
            layer.alpha_composite(tile, (x, y))
    d = ImageDraw.Draw(layer)
    band = max(22, h // 45)
    d.rectangle([0, h - band, w, h], fill=(255, 255, 255, 200))
    d.text((10, h - band + 3), text, font=font(int(band * 0.6)), fill=(165, 0, 52, 255))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def render(pdf, cfg, width, quality, max_kb, label):
    doc = fitz.open(pdf)
    m = cfg["materials"]
    if doc.page_count > m["maxPages"]:
        sys.exit(f"쪽 수가 너무 많습니다 ({doc.page_count} > {m['maxPages']})")
    text = watermark_text(cfg, label)
    pages = []
    for i, page in enumerate(doc, 1):
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = stamp(Image.frombytes("RGB", (pix.width, pix.height), pix.samples), text)
        q = quality
        while True:
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=q, method=6)
            if buf.tell() <= max_kb * 1024 or q <= 40:
                break
            q -= 10
        if buf.tell() > max_kb * 1024:
            sys.exit(f"{i}쪽 이미지가 {max_kb}KB 를 넘습니다 — --width 를 줄이세요")
        pages.append(buf.getvalue())
        print(f"  {i}/{doc.page_count} - {buf.tell() // 1024}KB", file=sys.stderr)
    return pages


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):  # Windows 콘솔(cp949)에서도 한글·기호가 깨지지 않게
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    cfg = load_cfg()
    ap = argparse.ArgumentParser(description="PDF → 워터마크 webp 자료 꾸러미")
    ap.add_argument("pdf")
    ap.add_argument("--title", required=True)
    ap.add_argument("--lecturer", default="")
    ap.add_argument("--session", default=None, choices=[s["code"] for s in cfg["sessions"]])
    ap.add_argument("--label", default=cfg["meta"]["securityLabel"], help="워터마크의 {label}")
    ap.add_argument("--width", type=int, default=1600)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    out = Path(a.out)
    if out.exists():
        sys.exit(f"이미 있는 파일: {out}")
    pages = render(a.pdf, cfg, a.width, a.quality, cfg["materials"]["maxPageKb"], a.label)
    manifest = {"title": a.title, "lecturer": a.lecturer, "session": a.session, "pages": len(pages)}
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        for i, b in enumerate(pages, 1):
            z.writestr(f"p{i:03d}.webp", b, compress_type=zipfile.ZIP_STORED)
    print(f"완료: {out} ({len(pages)}쪽) - 사무국 화면 '교육 자료 관리'에서 올리세요")


if __name__ == "__main__":
    main()
