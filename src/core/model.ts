// Shared document model used by the editor, the file-format code and (later) the web app.
// All lengths are in points (pt) unless stated otherwise.

export interface JSONNode {
  type?: string;
  attrs?: Record<string, any>;
  content?: JSONNode[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
}

export interface HeaderFooter {
  /** Plain text; `{page}` and `{pages}` are replaced by the page number / page count. */
  text: string;
  align: 'left' | 'center' | 'right';
}

export interface PageSetup {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  orientation: 'portrait' | 'landscape';
  color: string | null;
}

export interface DocDefaults {
  fontFamily: string;
  fontSize: number;
  color: string | null;
  spaceBefore: number;
  spaceAfter: number;
  lineHeight: number | string;
}

export interface DocMeta {
  page: PageSetup;
  defaults: DocDefaults;
  header: HeaderFooter;
  footer: HeaderFooter;
  title: string;
  author: string;
  created: string;
  modified: string;
}

export const PAGE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  letter: { w: 612, h: 792, label: 'Letter (8.5" x 11")' },
  legal: { w: 612, h: 1008, label: 'Legal (8.5" x 14")' },
  a4: { w: 595.3, h: 841.9, label: 'A4 (210 x 297 mm)' },
  a5: { w: 419.5, h: 595.3, label: 'A5 (148 x 210 mm)' },
  a3: { w: 841.9, h: 1190.6, label: 'A3 (297 x 420 mm)' },
  executive: { w: 522, h: 756, label: 'Executive (7.25" x 10.5")' },
  tabloid: { w: 792, h: 1224, label: 'Tabloid (11" x 17")' },
};

export const MARGIN_PRESETS: Record<string, { label: string; t: number; b: number; l: number; r: number }> = {
  normal: { label: 'Normal', t: 72, b: 72, l: 72, r: 72 },
  narrow: { label: 'Narrow', t: 36, b: 36, l: 36, r: 36 },
  moderate: { label: 'Moderate', t: 72, b: 72, l: 54, r: 54 },
  wide: { label: 'Wide', t: 72, b: 72, l: 144, r: 144 },
};

export const DEFAULT_FONT = 'Aptos';
export const HEADING_FONT = 'Aptos Display';

export function defaultMeta(): DocMeta {
  const now = new Date().toISOString();
  return {
    page: {
      width: 612,
      height: 792,
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
      orientation: 'portrait',
      color: null,
    },
    defaults: {
      fontFamily: DEFAULT_FONT,
      fontSize: 12,
      color: null,
      spaceBefore: 0,
      spaceAfter: 8,
      lineHeight: 1.08,
    },
    header: { text: '', align: 'left' },
    footer: { text: '', align: 'center' },
    title: '',
    author: '',
    created: now,
    modified: now,
  };
}

export function cloneMeta(m: DocMeta): DocMeta {
  return JSON.parse(JSON.stringify(m));
}

/** Merge a (possibly partial / older-version) meta object over the defaults. */
export function normalizeMeta(input: any): DocMeta {
  const d = defaultMeta();
  if (!input || typeof input !== 'object') return d;
  return {
    page: { ...d.page, ...(input.page || {}) },
    defaults: { ...d.defaults, ...(input.defaults || {}) },
    header: { ...d.header, ...(input.header || {}) },
    footer: { ...d.footer, ...(input.footer || {}) },
    title: input.title ?? '',
    author: input.author ?? '',
    created: input.created ?? d.created,
    modified: input.modified ?? d.modified,
  };
}

export function emptyDoc(): JSONNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

// ---------------------------------------------------------------------------
// Named paragraph styles. Used by the editor CSS and the .docx exporter so a
// style looks the same in BNC Docs and in Word.
// ---------------------------------------------------------------------------
export interface NamedStyle {
  id: string;
  name: string;
  /** Heading level, if this is a heading style (maps to the heading node). */
  level?: number;
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  spaceBefore?: number;
  spaceAfter?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  indentLeft?: number;
  indentRight?: number;
  letterSpacing?: number;
}

export const NAMED_STYLES: NamedStyle[] = [
  { id: 'Normal', name: 'Normal' },
  { id: 'NoSpacing', name: 'No Spacing', spaceAfter: 0, lineHeight: 1 },
  { id: 'Heading1', name: 'Heading 1', level: 1, font: HEADING_FONT, size: 20, color: '0F4761', spaceBefore: 18, spaceAfter: 4, lineHeight: 1.08 },
  { id: 'Heading2', name: 'Heading 2', level: 2, font: HEADING_FONT, size: 16, color: '0F4761', spaceBefore: 8, spaceAfter: 4, lineHeight: 1.08 },
  { id: 'Heading3', name: 'Heading 3', level: 3, font: DEFAULT_FONT, size: 14, color: '0F4761', spaceBefore: 8, spaceAfter: 4, lineHeight: 1.08 },
  { id: 'Heading4', name: 'Heading 4', level: 4, font: DEFAULT_FONT, size: 12, color: '0F4761', italic: true, spaceBefore: 4, spaceAfter: 2, lineHeight: 1.08 },
  { id: 'Heading5', name: 'Heading 5', level: 5, font: DEFAULT_FONT, size: 12, color: '0F4761', spaceBefore: 4, spaceAfter: 2, lineHeight: 1.08 },
  { id: 'Heading6', name: 'Heading 6', level: 6, font: DEFAULT_FONT, size: 12, color: '595959', italic: true, spaceBefore: 2, spaceAfter: 0, lineHeight: 1.08 },
  { id: 'Title', name: 'Title', font: HEADING_FONT, size: 28, spaceAfter: 4, lineHeight: 1, letterSpacing: -0.5 },
  { id: 'Subtitle', name: 'Subtitle', font: DEFAULT_FONT, size: 14, color: '595959', spaceAfter: 8, lineHeight: 1.08, letterSpacing: 0.75 },
  { id: 'Quote', name: 'Quote', italic: true, color: '404040', align: 'center', spaceBefore: 10, spaceAfter: 8, indentLeft: 43.2, indentRight: 43.2 },
  { id: 'IntenseQuote', name: 'Intense Quote', italic: true, color: '0F4761', align: 'center', spaceBefore: 18, spaceAfter: 18, indentLeft: 43.2, indentRight: 43.2 },
];

export const STYLE_BY_ID: Record<string, NamedStyle> = Object.fromEntries(NAMED_STYLES.map((s) => [s.id, s]));

/** CSS for the named styles; works for both the editor and the print window. */
export function namedStylesCss(): string {
  const out: string[] = [];
  for (const s of NAMED_STYLES) {
    if (s.id === 'Normal') continue;
    const sel = s.level ? `.doc h${s.level}` : `.doc [data-style="${s.id}"]`;
    const r: string[] = [];
    if (s.font) r.push(`font-family:'${s.font}', 'Aptos', 'Segoe UI', Calibri, Carlito, 'Helvetica Neue', sans-serif`);
    if (s.size) r.push(`font-size:${s.size}pt`);
    if (s.color) r.push(`color:#${s.color}`);
    r.push(`font-weight:${s.bold ? 700 : 400}`);
    r.push(`font-style:${s.italic ? 'italic' : 'normal'}`);
    if (s.spaceBefore != null) r.push(`padding-top:${s.spaceBefore}pt`);
    if (s.spaceAfter != null) r.push(`padding-bottom:${s.spaceAfter}pt`);
    if (s.lineHeight != null) r.push(`line-height:${s.lineHeight}`);
    if (s.align) r.push(`text-align:${s.align}`);
    if (s.indentLeft) r.push(`margin-left:${s.indentLeft}pt`);
    if (s.indentRight) r.push(`margin-right:${s.indentRight}pt`);
    if (s.letterSpacing) r.push(`letter-spacing:${s.letterSpacing}pt`);
    out.push(`${sel}{${r.join(';')}}`);
  }
  return out.join('\n');
}

const SERIF_RE = /times|georgia|cambria|garamond|palatino|book antiqua|constantia|sylfaen|century schoolbook|baskerville|bookman|minion|caslon|didot|sagona|serif$/i;
const MONO_RE = /consolas|courier|lucida console|monaco|menlo|mono|code/i;

/** CSS font-family value for a font name, with fallbacks so unavailable fonts still look reasonable. */
export function fontStack(name: string): string {
  const n = name.replace(/["']/g, '').trim();
  if (n.includes(',')) return n;
  if (MONO_RE.test(n)) return `'${n}', monospace`;
  if (SERIF_RE.test(n) && !/sans/i.test(n)) return `'${n}', Georgia, 'Times New Roman', serif`;
  return `'${n}', 'Aptos', 'Segoe UI', Calibri, Carlito, 'Helvetica Neue', sans-serif`;
}

export const FONT_FALLBACK ="'Aptos', 'Segoe UI', Calibri, Carlito, 'Helvetica Neue', Arial, sans-serif";

export function ptToTwips(pt: number) {
  return Math.round(pt * 20);
}
export function twipsToPt(tw: number) {
  return tw / 20;
}
