#!/usr/bin/env python3
"""Lay out approved letters as printable sheets: 20 mini letters per US Letter page (5 x 4).

Usage: python3 tools/print_letters.py letters.json prints/cartas.pdf

`letters.json` is a list of {"body": ...} already sorted by ranking. Renders an HTML page with
the game's paper style and prints it to PDF with headless Chrome; each letter's font size is
shrunk until its text fits its card.
"""
import html
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'node_modules/@fontsource/ubuntu/files'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PER_PAGE = 20

CSS = f"""
@font-face {{ font-family: Ubuntu; font-weight: 400; src: url('{(FONTS / 'ubuntu-latin-400-normal.woff2').as_uri()}'); }}
@font-face {{ font-family: Ubuntu; font-weight: 500; src: url('{(FONTS / 'ubuntu-latin-500-normal.woff2').as_uri()}'); }}
@font-face {{ font-family: Ubuntu; font-weight: 700; src: url('{(FONTS / 'ubuntu-latin-700-normal.woff2').as_uri()}'); }}
@page {{ size: 11in 8.5in; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{ font-family: Ubuntu, 'Apple Color Emoji', sans-serif; color: #2b2620; }}
.sheet {{
  width: 11in; height: 8.5in; padding: 0.35in 0.35in 0.3in;
  display: flex; flex-direction: column; gap: 0.1in;
  overflow: hidden; page-break-after: always; break-after: page;
}}
.sheet:last-child {{ page-break-after: auto; break-after: auto; }}
.head {{ display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; color: #6b6150; }}
.head b {{ font-size: 11pt; color: #2b2620; }}
.grid {{
  flex: 1 1 0; min-height: 0; display: grid; gap: 0.12in;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
}}
.card {{
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  padding: 0.09in 0.1in 0.07in;
  border: 1px solid #b6ab8c; border-radius: 5px;
  background: #fdf8e6;
}}
.to {{ display: flex; justify-content: space-between; font-size: 6.5pt; font-style: italic; color: #6b6150;
  padding-bottom: 0.04in; margin-bottom: 0.05in; border-bottom: 1px solid #e3d9b8; }}
.to span {{ font-style: normal; font-weight: 700; color: #a8925f; }}
.text {{ flex: 1; min-height: 0; overflow: hidden; line-height: 1.32; white-space: pre-wrap; overflow-wrap: anywhere; }}
.seal {{ align-self: flex-end; width: 0.12in; height: 0.08in; margin-top: 0.03in; border-radius: 1px; background: #c8322a; }}
"""

FIT = """
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll('.text')) {
    let size = 10.5;
    el.style.fontSize = size + 'pt';
    while (el.scrollHeight > el.clientHeight + 1 && size > 5.5) {
      size -= 0.25;
      el.style.fontSize = size + 'pt';
    }
  }
  document.body.dataset.ready = '1';
});
"""


def build_html(letters: list[dict]) -> str:
    pages = [letters[i : i + PER_PAGE] for i in range(0, len(letters), PER_PAGE)]
    sheets = []
    for p, page in enumerate(pages):
        cards = []
        for i, letter in enumerate(page):
            rank = p * PER_PAGE + i + 1
            cards.append(
                '<div class="card">'
                f'<p class="to">Para: Nicolás Maduro Moros<span>#{rank}</span></p>'
                f'<p class="text">{html.escape(letter["body"].strip())}</p>'
                '<i class="seal"></i></div>'
            )
        sheets.append(
            '<section class="sheet">'
            f'<header class="head"><b>Las cartas de Maduro</b><span>Hoja {p + 1} de {len(pages)}</span></header>'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )
    return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(sheets)}<script>{FIT}</script></body></html>'


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    letters = json.loads(src.read_text())
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(build_html(letters))
        page = Path(f.name)
    subprocess.run(
        [CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000',
         f'--print-to-pdf={out.resolve()}', page.as_uri()],
        check=True, capture_output=True,
    )
    print(f'{len(letters)} cartas → {-(-len(letters) // PER_PAGE)} hojas → {out}')


if __name__ == '__main__':
    main()
