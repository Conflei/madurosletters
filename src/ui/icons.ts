/** Hand-placed pixel icons, rendered as crisp SVG grids. '.' is transparent. */

type Icon = { rows: string[]; colors: Record<string, string> };

const K = '#000000';

const ICONS = {
  envelope: {
    rows: [
      'kkkkkkkkkkkkkkk',
      'kwkwwwwwwwwwkwk',
      'kwwkwwwwwwwkwwk',
      'kwwwkwwwwwkwwwk',
      'kwwwwkwwwkwwwwk',
      'kwwwwwkrkwwwwwk',
      'kwwwwwrrrwwwwwk',
      'kwwwwwwrwwwwwwk',
      'kwwwwwwwwwwwwwk',
      'ksssssssssssssk',
      'kkkkkkkkkkkkkkk',
    ],
    colors: { k: K, w: '#ffffff', s: '#c9c3b0', r: '#d6332a' },
  },
  calendar: {
    rows: [
      '..k.....k..',
      'kkgkkkkkgkk',
      'krrrrrrrrrk',
      'krhhhhhhhrk',
      'kkkkkkkkkkk',
      'kwwwwwwwwwk',
      'kwdwdwdwdwk',
      'kwwwwwwwwwk',
      'kwdwdwdwrwk',
      'kwwwwwwwwwk',
      'kkkkkkkkkkk',
    ],
    colors: { k: K, g: '#9aa3ad', r: '#d6332a', h: '#ef6b5f', w: '#ffffff', d: '#7d8794' },
  },
  clock: {
    rows: [
      '...kkkkk...',
      '..kwwwwwk..',
      '.kwwwdwwwk.',
      'kwwwwkwwwwk',
      'kdwwwkwwwdk',
      'kwwwwkkkwwk',
      'kwwwwwwwwwk',
      'kwwwwwwwwwk',
      '.kwwwdwwwk.',
      '..kwwwwwk..',
      '...kkkkk...',
    ],
    colors: { k: K, w: '#ffffff', d: '#9aa3ad' },
  },
  flag: {
    rows: [
      'kkkkkkkkkkkkk',
      'kyyyyyyyyyyyk',
      'kyyyyyyyyyyyk',
      'kyyyyyyyyyyyk',
      'kbbbbbbbbbbbk',
      'kbbwbwbwbwbbk',
      'kbbbbbbbbbbbk',
      'krrrrrrrrrrrk',
      'krrrrrrrrrrrk',
      'krrrrrrrrrrrk',
      'kkkkkkkkkkkkk',
    ],
    colors: { k: K, y: '#f4c20d', b: '#1f4aa8', w: '#ffffff', r: '#cf2a2a' },
  },
  bars: {
    rows: [
      'kkkkkkkkkkkkk',
      'kgggggggggggk',
      'kgdgdgdgdgdgk',
      'kodgdgdgdgdok',
      'kodododododok',
      'kodododododok',
      'kodododododok',
      'kodgdgdgdgdok',
      'kgdgdgdgdgdgk',
      'kgggggggggggk',
      'kkkkkkkkkkkkk',
    ],
    colors: { k: K, g: '#8b96a2', d: '#2a2e35', o: '#f07c1e' },
  },
} satisfies Record<string, Icon>;

export type IconName = keyof typeof ICONS;

export function pixelIcon(name: IconName, scale = 2): string {
  const { rows, colors } = ICONS[name] as Icon;
  const h = rows.length;
  const w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      let run = 1;
      while (x + run < w && row[x + run] === ch) run++;
      if (colors[ch]) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[ch]}"/>`;
      x += run;
    }
  });
  return `<svg class="px-icon" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
