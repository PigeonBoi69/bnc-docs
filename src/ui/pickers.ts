import { h, popover, iconEl } from './dom';

// ---------------------------------------------------------------------------
// Colour picker
// ---------------------------------------------------------------------------
function mix(hex: string, other: number, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (other - c) * f));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

const GRAYS = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'];
const VIVID = ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'];
const PALETTE: string[][] = [
  GRAYS,
  VIVID,
  VIVID.map((c) => mix(c, 255, 0.8)),
  VIVID.map((c) => mix(c, 255, 0.6)),
  VIVID.map((c) => mix(c, 255, 0.4)),
  VIVID.map((c) => mix(c, 0, 0.25)),
];

export const HIGHLIGHT_COLORS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#0000ff', '#ff0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0', '#000000'];

export function colorPicker(anchor: HTMLElement, opts: { title: string; noneLabel: string; onPick: (c: string | null) => void; palette?: string[][] }) {
  let close = () => {};
  const grid = h('div', { class: 'color-grid' });
  for (const row of opts.palette ?? PALETTE) {
    for (const c of row) {
      grid.append(
        h('button', {
          class: 'color-cell',
          title: c.toUpperCase(),
          style: { background: c },
          on: {
            click: () => {
              close();
              opts.onPick(c);
            },
          },
        }),
      );
    }
  }
  const custom = h('input', { attrs: { type: 'color' }, style: { width: '34px', height: '28px', padding: '0', border: '0', background: 'none', cursor: 'pointer' } });
  custom.addEventListener('change', () => {
    close();
    opts.onPick(custom.value);
  });
  const body = h(
    'div',
    { class: 'color-pop' },
    h('div', { class: 'color-title', text: opts.title }),
    grid,
    h(
      'div',
      { class: 'color-actions' },
      h('button', { class: 'btn', style: { flex: '1', height: '28px' }, text: opts.noneLabel, on: { click: () => { close(); opts.onPick(null); } } }),
      h('label', { class: 'muted', style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, 'Custom', custom),
    ),
  );
  close = popover(anchor, body);
}

// ---------------------------------------------------------------------------
// Table size grid
// ---------------------------------------------------------------------------
export function tableGridPicker(anchor: HTMLElement, onPick: (rows: number, cols: number) => void, onCustom: () => void) {
  let close = () => {};
  const COLS = 10;
  const ROWS = 8;
  const label = h('div', { class: 'table-label', text: 'Insert Table' });
  const grid = h('div', { class: 'table-grid' });
  const cells: HTMLElement[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = h('i');
      cell.addEventListener('mouseenter', () => {
        cells.forEach((el, i) => el.classList.toggle('on', Math.floor(i / COLS) <= r && i % COLS <= c));
        label.textContent = `${c + 1} x ${r + 1}`;
      });
      cell.addEventListener('click', () => {
        close();
        onPick(r + 1, c + 1);
      });
      cells.push(cell);
      grid.append(cell);
    }
  }
  const custom = h('button', { class: 'btn', style: { width: '100%', marginTop: '8px', height: '28px' }, text: 'Custom size…', on: { click: () => { close(); onCustom(); } } });
  close = popover(anchor, h('div', { class: 'table-pop' }, grid, label, custom));
}

// ---------------------------------------------------------------------------
// Symbols & emoji
// ---------------------------------------------------------------------------
const SYMBOLS = [
  ...'©®™§¶†‡•…‰′″‹›«»¡¿¢£¤¥€¦¨ª¬±²³´µ·¹º¼½¾×÷',
  ...'←↑→↓↔↕⇐⇑⇒⇓⇔∀∂∃∅∇∈∉∋∏∑−∗√∝∞∠∧∨∩∪∫∴∼≅≈≠≡≤≥⊂⊃⊄⊆⊇⊕⊗⊥',
  ...'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  ...'♠♣♥♦♪♫☀☁☂☃★☆☎☑☒☐✓✔✗✘✚✦❤❖',
];
const EMOJI = [
  ...'😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😎🤩🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤯😳🥵🥶😱😰🤔🤗🤭🤫😶😐😑😬🙄😴',
  ...'👍👎👌✌🤞👏🙌🙏💪👀🧠❤🧡💛💚💙💜🖤💔✨🔥⭐🌟💡🎉🎊🎁🏆📌📎📝📚📖💻📱📷🎵🎮🚀✈🚗🏠🌍🌈☀🌙☕🍕🍔🍎',
];

export function charPicker(anchor: HTMLElement, kind: 'symbol' | 'emoji', onPick: (ch: string) => void) {
  let close = () => {};
  const list = kind === 'symbol' ? SYMBOLS : EMOJI;
  const grid = h('div', { class: 'char-grid' });
  for (const ch of list) grid.append(h('button', { text: ch, title: `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`, on: { click: () => { close(); onPick(ch); } } }));
  close = popover(anchor, h('div', null, grid));
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
export const DEFAULT_FONTS = [
  'Aptos', 'Aptos Display', 'Arial', 'Book Antiqua', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas',
  'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Impact', 'Lucida Console', 'Palatino Linotype', 'Rockwell',
  'Segoe UI', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

let fontCache: string[] | null = null;
export async function loadFonts(): Promise<string[]> {
  if (fontCache) return fontCache;
  try {
    const anyWin = window as any;
    if (typeof anyWin.queryLocalFonts === 'function') {
      const fonts: { family: string }[] = await anyWin.queryLocalFonts();
      const set = new Set(fonts.map((f) => f.family));
      if (set.size) {
        for (const f of ['Aptos', 'Aptos Display']) set.add(f);
        fontCache = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        return fontCache;
      }
    }
  } catch {
    /* fall through to defaults */
  }
  fontCache = DEFAULT_FONTS;
  return fontCache;
}

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

/** An editable combo box (text input + dropdown list). */
export function combo(opts: {
  width: number;
  title: string;
  getValue: () => string;
  getItems: () => Promise<string[]> | string[];
  onCommit: (v: string) => void;
  renderItem?: (v: string) => HTMLElement;
  numeric?: boolean;
}) {
  const input = h('input', { attrs: { type: 'text', 'aria-label': opts.title, spellcheck: 'false' }, style: { width: `${opts.width}px` } });
  const caret = h('button', { class: 'rb', title: opts.title, attrs: { tabindex: '-1' } }, iconEl('chevron', 14));
  const root = h('div', { class: 'rcombo', title: opts.title }, input, caret);
  let closePop = () => {};

  const open = async () => {
    const items = await opts.getItems();
    const cur = opts.getValue();
    const list = h('div', { class: 'list-pop' });
    const filter = opts.numeric ? '' : input.value.toLowerCase() === cur.toLowerCase() ? '' : input.value.toLowerCase();
    for (const it of items) {
      if (filter && !it.toLowerCase().includes(filter)) continue;
      const row = h('div', { class: `list-item${it.toLowerCase() === cur.toLowerCase() ? ' sel' : ''}` }, opts.renderItem ? opts.renderItem(it) : it);
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => {
        closePop();
        opts.onCommit(it);
      });
      list.append(row);
    }
    closePop = popover(root, list);
    list.querySelector('.sel')?.scrollIntoView({ block: 'center' });
  };
  caret.addEventListener('mousedown', (e) => e.preventDefault());
  caret.addEventListener('click', () => void open());
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      closePop();
      opts.onCommit(input.value.trim());
    } else if (e.key === 'Escape') {
      input.value = opts.getValue();
      closePop();
    }
  });
  const update = () => {
    if (document.activeElement !== input) input.value = opts.getValue();
  };
  return { el: root, update, input };
}
