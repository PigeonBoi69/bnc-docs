// .docx -> BNC Docs document model.
// Reads the WordprocessingML package directly (JSZip + XML) instead of going through HTML so that
// styles, numbering, tables, images and page setup survive intact.
import JSZip from 'jszip';
import { DocMeta, JSONNode, defaultMeta, DEFAULT_FONT, STYLE_BY_ID, fontStack } from './model';
import { XNode, parseXml, kids, kid, attr, textOf, findDeep } from './xml';

// ---------------------------------------------------------------------------
// Property bags
// ---------------------------------------------------------------------------
interface RPr {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  sz?: number;
  font?: string;
  vert?: string;
  caps?: boolean;
  smallCaps?: boolean;
  shd?: string;
  vanish?: boolean;
  spacing?: number;
}

interface PPr {
  jc?: string;
  before?: number;
  after?: number;
  line?: number | string;
  left?: number;
  right?: number;
  first?: number;
  numId?: string;
  ilvl?: number;
  shd?: string;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  contextual?: boolean;
}

interface StyleDef {
  id: string;
  type: string;
  name: string;
  basedOn?: string;
  isDefault: boolean;
  rPr: RPr;
  pPr: PPr;
  tblBorders?: boolean;
}

interface LvlDef {
  fmt: string;
  start: number;
}

interface Ctx {
  zip: JSZip;
  rels: Map<string, { target: string; external: boolean }>;
  styles: Map<string, StyleDef>;
  docR: RPr;
  docP: PPr;
  defaults: DocMeta['defaults'];
  nums: Map<string, string>;
  abstracts: Map<string, Map<number, LvlDef>>;
  startOverrides: Map<string, number>;
  themeFonts: { major?: string; minor?: string };
  themeColors: Record<string, string>;
  counters: Map<string, (number | undefined)[]>;
  images: Map<string, string>;
}

const HIGHLIGHTS: Record<string, string> = {
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  blue: '#0000FF',
  red: '#FF0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#C0C0C0',
  black: '#000000',
  white: '#FFFFFF',
};

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const THEME_COLOR_ALIASES: Record<string, string> = {
  text1: 'dk1',
  background1: 'lt1',
  text2: 'dk2',
  background2: 'lt2',
  dark1: 'dk1',
  light1: 'lt1',
  dark2: 'dk2',
  light2: 'lt2',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const num = (s: string | undefined): number | undefined => {
  if (s == null || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const onOff = (n: XNode | undefined): boolean | undefined => {
  if (!n) return undefined;
  const v = n.attrs['w:val'];
  if (v == null) return true;
  return !(v === '0' || v === 'false' || v === 'off');
};

function stripUndefined<T extends object>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if ((o as any)[k] !== undefined) out[k] = (o as any)[k];
  return out;
}
const merge = <T extends object>(...parts: (T | undefined)[]): T => Object.assign({}, ...parts.map((p) => (p ? stripUndefined(p) : {}))) as T;

function normFont(f: string | undefined) {
  return (f ?? '').trim().toLowerCase();
}

function resolveColor(n: XNode | undefined, ctx: Pick<Ctx, 'themeColors'>): string | undefined {
  if (!n) return undefined;
  const val = n.attrs['w:val'];
  if (val && val !== 'auto' && /^[0-9a-fA-F]{6}$/.test(val)) return val.toUpperCase();
  const tc = n.attrs['w:themeColor'];
  if (tc) {
    const key = THEME_COLOR_ALIASES[tc] ?? tc;
    const hex = ctx.themeColors[key];
    if (hex) return hex.toUpperCase();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Property parsing
// ---------------------------------------------------------------------------
function parseRPr(n: XNode | undefined, ctx: Pick<Ctx, 'themeFonts' | 'themeColors'>): RPr {
  const r: RPr = {};
  if (!n) return r;
  for (const c of kids(n)) {
    switch (c.name) {
      case 'w:b':
        r.b = onOff(c);
        break;
      case 'w:i':
        r.i = onOff(c);
        break;
      case 'w:strike':
      case 'w:dstrike':
        r.strike = onOff(c);
        break;
      case 'w:caps':
        r.caps = onOff(c);
        break;
      case 'w:smallCaps':
        r.smallCaps = onOff(c);
        break;
      case 'w:vanish':
        r.vanish = onOff(c);
        break;
      case 'w:u':
        r.u = (c.attrs['w:val'] ?? 'single') !== 'none';
        break;
      case 'w:color':
        r.color = resolveColor(c, ctx);
        if (!r.color && c.attrs['w:val'] === 'auto') r.color = 'auto';
        break;
      case 'w:sz':
        r.sz = (num(c.attrs['w:val']) ?? 0) / 2 || undefined;
        break;
      case 'w:highlight': {
        const v = c.attrs['w:val'];
        if (v && v !== 'none') r.highlight = HIGHLIGHTS[v] ?? undefined;
        break;
      }
      case 'w:shd': {
        const fill = c.attrs['w:fill'];
        if (fill && fill !== 'auto' && /^[0-9a-fA-F]{6}$/.test(fill)) r.shd = '#' + fill.toUpperCase();
        break;
      }
      case 'w:vertAlign':
        r.vert = c.attrs['w:val'];
        break;
      case 'w:spacing': {
        const v = num(c.attrs['w:val']);
        if (v) r.spacing = v / 20;
        break;
      }
      case 'w:rFonts': {
        const a = c.attrs;
        const themeKey = a['w:asciiTheme'] ?? a['w:hAnsiTheme'];
        if (themeKey) {
          const f = themeKey.startsWith('major') ? ctx.themeFonts.major : themeKey.startsWith('minor') ? ctx.themeFonts.minor : undefined;
          if (f) r.font = f;
        }
        if (!r.font) r.font = a['w:ascii'] ?? a['w:hAnsi'] ?? a['w:cs'];
        break;
      }
    }
  }
  return r;
}

function parsePPr(n: XNode | undefined, ctx: Pick<Ctx, 'themeColors'>): PPr {
  const p: PPr = {};
  if (!n) return p;
  for (const c of kids(n)) {
    switch (c.name) {
      case 'w:jc': {
        const v = c.attrs['w:val'];
        p.jc = v === 'both' || v === 'distribute' || v === 'thaiDistribute' ? 'justify' : v === 'start' ? 'left' : v === 'end' ? 'right' : v;
        break;
      }
      case 'w:spacing': {
        const a = c.attrs;
        if (a['w:beforeAutospacing'] === '1') p.before = 14;
        else if (a['w:before'] != null) p.before = (num(a['w:before']) ?? 0) / 20;
        if (a['w:afterAutospacing'] === '1') p.after = 14;
        else if (a['w:after'] != null) p.after = (num(a['w:after']) ?? 0) / 20;
        const line = num(a['w:line']);
        if (line != null) {
          const rule = a['w:lineRule'] ?? 'auto';
          p.line = rule === 'auto' ? Math.round((line / 240) * 1000) / 1000 : `${line / 20}pt`;
        }
        break;
      }
      case 'w:ind': {
        const a = c.attrs;
        const left = num(a['w:left'] ?? a['w:start']);
        const right = num(a['w:right'] ?? a['w:end']);
        if (left != null) p.left = left / 20;
        if (right != null) p.right = right / 20;
        const hanging = num(a['w:hanging']);
        const first = num(a['w:firstLine']);
        if (hanging != null) p.first = -hanging / 20;
        else if (first != null) p.first = first / 20;
        break;
      }
      case 'w:numPr': {
        const id = kid(c, 'w:numId')?.attrs['w:val'];
        const lvl = num(kid(c, 'w:ilvl')?.attrs['w:val']);
        if (id != null) p.numId = id;
        if (lvl != null) p.ilvl = lvl;
        break;
      }
      case 'w:shd': {
        const fill = c.attrs['w:fill'];
        if (fill && fill !== 'auto' && /^[0-9a-fA-F]{6}$/.test(fill)) p.shd = '#' + fill.toUpperCase();
        break;
      }
      case 'w:keepNext':
        p.keepNext = onOff(c);
        break;
      case 'w:pageBreakBefore':
        p.pageBreakBefore = onOff(c);
        break;
      case 'w:contextualSpacing':
        p.contextual = onOff(c);
        break;
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// Package parts
// ---------------------------------------------------------------------------
async function readText(zip: JSZip, path: string): Promise<string | undefined> {
  const f = zip.file(path);
  return f ? await f.async('string') : undefined;
}

function parseTheme(xml: string | undefined) {
  const fonts: { major?: string; minor?: string } = {};
  const colors: Record<string, string> = {};
  if (!xml) return { fonts, colors };
  const root = parseXml(xml);
  const scheme = findDeep(root, 'a:fontScheme');
  fonts.major = kid(kid(scheme, 'a:majorFont'), 'a:latin')?.attrs['typeface'];
  fonts.minor = kid(kid(scheme, 'a:minorFont'), 'a:latin')?.attrs['typeface'];
  const clr = findDeep(root, 'a:clrScheme');
  for (const c of kids(clr)) {
    const key = c.name.replace('a:', '');
    const v = kid(c, 'a:srgbClr')?.attrs['val'] ?? kid(c, 'a:sysClr')?.attrs['lastClr'];
    if (v) colors[key] = v;
  }
  return { fonts, colors };
}

function parseStyles(xml: string | undefined, ctx: Pick<Ctx, 'themeFonts' | 'themeColors'>) {
  const styles = new Map<string, StyleDef>();
  let docR: RPr = {};
  let docP: PPr = {};
  if (!xml) return { styles, docR, docP };
  const root = parseXml(xml);
  const dd = kid(root, 'w:docDefaults');
  docR = parseRPr(kid(kid(dd, 'w:rPrDefault'), 'w:rPr'), ctx);
  docP = parsePPr(kid(kid(dd, 'w:pPrDefault'), 'w:pPr'), ctx);
  for (const s of kids(root, 'w:style')) {
    const id = s.attrs['w:styleId'];
    if (!id) continue;
    const borders = kid(kid(s, 'w:tblPr'), 'w:tblBorders');
    styles.set(id, {
      id,
      type: s.attrs['w:type'] ?? 'paragraph',
      name: kid(s, 'w:name')?.attrs['w:val'] ?? id,
      basedOn: kid(s, 'w:basedOn')?.attrs['w:val'],
      isDefault: s.attrs['w:default'] === '1',
      rPr: parseRPr(kid(s, 'w:rPr'), ctx),
      pPr: parsePPr(kid(s, 'w:pPr'), ctx),
      tblBorders: borders ? hasBorders(borders) : undefined,
    });
  }
  return { styles, docR, docP };
}

function hasBorders(n: XNode): boolean {
  return kids(n).some((b) => {
    const v = b.attrs['w:val'];
    return v && v !== 'none' && v !== 'nil';
  });
}

function parseNumbering(xml: string | undefined) {
  const nums = new Map<string, string>();
  const abstracts = new Map<string, Map<number, LvlDef>>();
  const startOverrides = new Map<string, number>();
  if (!xml) return { nums, abstracts, startOverrides };
  const root = parseXml(xml);
  for (const a of kids(root, 'w:abstractNum')) {
    const id = a.attrs['w:abstractNumId'];
    const levels = new Map<number, LvlDef>();
    for (const l of kids(a, 'w:lvl')) {
      const ilvl = num(l.attrs['w:ilvl']) ?? 0;
      levels.set(ilvl, {
        fmt: kid(l, 'w:numFmt')?.attrs['w:val'] ?? 'decimal',
        start: num(kid(l, 'w:start')?.attrs['w:val']) ?? 1,
      });
    }
    abstracts.set(id, levels);
  }
  for (const n of kids(root, 'w:num')) {
    const id = n.attrs['w:numId'];
    const abs = kid(n, 'w:abstractNumId')?.attrs['w:val'];
    if (abs != null) nums.set(id, abs);
    for (const o of kids(n, 'w:lvlOverride')) {
      const so = num(kid(o, 'w:startOverride')?.attrs['w:val']);
      if (so != null) startOverrides.set(`${id}:${o.attrs['w:ilvl']}`, so);
    }
  }
  return { nums, abstracts, startOverrides };
}

function parseRels(xml: string | undefined) {
  const rels = new Map<string, { target: string; external: boolean }>();
  if (!xml) return rels;
  for (const r of kids(parseXml(xml), 'Relationship')) {
    rels.set(r.attrs['Id'], { target: r.attrs['Target'], external: r.attrs['TargetMode'] === 'External' });
  }
  return rels;
}

function resolvePartPath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('word/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

// ---------------------------------------------------------------------------
// Style resolution
// ---------------------------------------------------------------------------
function styleChain(ctx: Ctx, id: string | undefined): StyleDef[] {
  const chain: StyleDef[] = [];
  const seen = new Set<string>();
  let cur = id ? ctx.styles.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.basedOn ? ctx.styles.get(cur.basedOn) : undefined;
  }
  return chain;
}

function resolveStyleR(ctx: Ctx, id: string | undefined): RPr {
  return merge<RPr>(...styleChain(ctx, id).map((s) => s.rPr));
}
function resolveStyleP(ctx: Ctx, id: string | undefined): PPr {
  return merge<PPr>(...styleChain(ctx, id).map((s) => s.pPr));
}

function defaultParagraphStyleId(ctx: Ctx): string | undefined {
  for (const s of ctx.styles.values()) if (s.type === 'paragraph' && s.isDefault) return s.id;
  return undefined;
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------
type Inline = JSONNode | { pageBreak: true };

interface Mark {
  type: string;
  attrs?: Record<string, any>;
}

function marksFor(r: RPr, ctx: Ctx, force: boolean, href?: string): Mark[] {
  const marks: Mark[] = [];
  const ts: Record<string, any> = {};
  if (r.font && (force || normFont(r.font) !== normFont(ctx.defaults.fontFamily))) ts.fontFamily = fontStack(r.font);
  if (r.sz && (force || r.sz !== ctx.defaults.fontSize)) ts.fontSize = `${r.sz}pt`;
  if (r.color && r.color !== 'auto' && (force || r.color !== (ctx.defaults.color ?? '').toUpperCase())) ts.color = `#${r.color}`;
  if (r.caps) ts.textTransform = 'uppercase';
  if (r.smallCaps) ts.fontVariant = 'small-caps';
  if (r.spacing) ts.letterSpacing = `${r.spacing}pt`;
  if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts });
  if (r.b) marks.push({ type: 'bold' });
  if (r.i) marks.push({ type: 'italic' });
  if (r.u) marks.push({ type: 'underline' });
  if (r.strike) marks.push({ type: 'strike' });
  if (r.vert === 'superscript') marks.push({ type: 'superscript' });
  if (r.vert === 'subscript') marks.push({ type: 'subscript' });
  const hl = r.highlight ?? r.shd;
  if (hl) marks.push({ type: 'highlight', attrs: { color: hl } });
  if (href) marks.push({ type: 'link', attrs: { href } });
  return marks;
}

async function loadImage(ctx: Ctx, rid: string): Promise<string | undefined> {
  const cached = ctx.images.get(rid);
  if (cached) return cached;
  const rel = ctx.rels.get(rid);
  if (!rel || rel.external) return undefined;
  const path = resolvePartPath(rel.target);
  const file = ctx.zip.file(path);
  if (!file) return undefined;
  const ext = path.split('.').pop()!.toLowerCase();
  const mime = MIME[ext];
  if (!mime) return undefined; // emf/wmf etc. cannot be rendered in a browser
  const uri = `data:${mime};base64,${await file.async('base64')}`;
  ctx.images.set(rid, uri);
  return uri;
}

async function convertDrawing(d: XNode, ctx: Ctx): Promise<JSONNode | undefined> {
  const blip = findDeep(d, 'a:blip');
  const rid = blip?.attrs['r:embed'] ?? blip?.attrs['r:link'];
  if (!rid) return undefined;
  const src = await loadImage(ctx, rid);
  if (!src) return undefined;
  const ext = findDeep(d, 'wp:extent');
  const cx = num(ext?.attrs['cx']);
  const cy = num(ext?.attrs['cy']);
  const docPr = findDeep(d, 'wp:docPr');
  return {
    type: 'image',
    attrs: {
      src,
      alt: docPr?.attrs['descr'] ?? docPr?.attrs['name'] ?? null,
      // EMU -> CSS px (the editor's image node stores pixels)
      width: cx ? Math.round(cx / 9525) : null,
      height: cy ? Math.round(cy / 9525) : null,
    },
  };
}

async function convertRun(r: XNode, ctx: Ctx, baseR: RPr, force: boolean, href: string | undefined, out: Inline[]) {
  const rPrNode = kid(r, 'w:rPr');
  const direct = parseRPr(rPrNode, ctx);
  const rStyle = kid(rPrNode, 'w:rStyle')?.attrs['w:val'];
  const eff = merge<RPr>(baseR, rStyle ? resolveStyleR(ctx, rStyle) : undefined, direct);
  if (eff.vanish) return;
  const marks = marksFor(eff, ctx, force, href);
  let buf = '';
  const flush = () => {
    if (!buf) return;
    out.push(stripMarks({ type: 'text', text: buf, marks }));
    buf = '';
  };
  const handle = async (nodes: XNode[]) => {
    for (const c of nodes) {
      switch (c.name) {
        case 'w:t':
          buf += textOf(c);
          break;
        case 'w:tab':
        case 'w:ptab':
          buf += '\t';
          break;
        case 'w:noBreakHyphen':
          buf += '\u2011';
          break;
        case 'w:cr':
          flush();
          out.push({ type: 'hardBreak' });
          break;
        case 'w:br': {
          flush();
          const t = c.attrs['w:type'];
          if (t === 'page') out.push({ pageBreak: true });
          else out.push({ type: 'hardBreak' });
          break;
        }
        case 'w:drawing': {
          flush();
          const img = await convertDrawing(c, ctx);
          if (img) out.push(img);
          break;
        }
        case 'w:footnoteReference':
        case 'w:endnoteReference':
          flush();
          out.push({ type: 'text', text: `[${c.attrs['w:id'] ?? ''}]`, marks: [{ type: 'superscript' }] });
          break;
        case 'mc:AlternateContent': {
          const choice = kid(c, 'mc:Choice') ?? kid(c, 'mc:Fallback');
          if (choice) await handle(choice.children);
          break;
        }
      }
    }
  };
  await handle(r.children);
  flush();
}

function stripMarks(n: JSONNode): JSONNode {
  if (n.marks && n.marks.length === 0) delete n.marks;
  return n;
}

async function convertInline(p: XNode, ctx: Ctx, baseR: RPr, force: boolean, href: string | undefined, out: Inline[]) {
  for (const c of p.children) {
    switch (c.name) {
      case 'w:r':
        await convertRun(c, ctx, baseR, force, href, out);
        break;
      case 'w:hyperlink': {
        const rid = c.attrs['r:id'];
        let target: string | undefined = href;
        if (rid) target = ctx.rels.get(rid)?.target;
        else if (c.attrs['w:anchor']) target = '#' + c.attrs['w:anchor'];
        await convertInline(c, ctx, baseR, force, target, out);
        break;
      }
      case 'w:ins':
      case 'w:smartTag':
      case 'w:fldSimple':
      case 'w:customXml':
        await convertInline(c, ctx, baseR, force, href, out);
        break;
      case 'w:sdt': {
        const content = kid(c, 'w:sdtContent');
        if (content) await convertInline(content, ctx, baseR, force, href, out);
        break;
      }
      case 'mc:AlternateContent': {
        const choice = kid(c, 'mc:Choice');
        if (choice) await convertInline(choice, ctx, baseR, force, href, out);
        break;
      }
    }
  }
}

function mergeText(nodes: JSONNode[]): JSONNode[] {
  const out: JSONNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text' && n.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      prev.text = (prev.text ?? '') + (n.text ?? '');
    } else out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
interface Item {
  node: JSONNode;
  list?: { numId: string; ilvl: number };
  styleId?: string;
  contextual?: boolean;
}

function paragraphAttrs(eff: PPr, ctx: Ctx, force: boolean, styleKey: string | null): Record<string, any> {
  const d = ctx.defaults;
  const attrs: Record<string, any> = {};
  attrs.textAlign = eff.jc && eff.jc !== 'left' ? eff.jc : null;
  const before = eff.before ?? 0;
  const after = eff.after ?? 0;
  attrs.spaceBefore = force || before !== d.spaceBefore ? before : null;
  attrs.spaceAfter = force || after !== d.spaceAfter ? after : null;
  const line = eff.line ?? d.lineHeight;
  attrs.lineHeight = force || line !== d.lineHeight ? line : null;
  attrs.indentLeft = eff.left ? eff.left : null;
  attrs.indentRight = eff.right ? eff.right : null;
  attrs.indentFirst = eff.first ? eff.first : null;
  attrs.shading = eff.shd ?? null;
  attrs.pageBreakBefore = eff.pageBreakBefore ? true : null;
  attrs.styleId = styleKey;
  return attrs;
}

function headingLevel(name: string, id: string): number | undefined {
  const m = /^heading\s*([1-9])$/i.exec(name) ?? /^heading([1-9])$/i.exec(id);
  if (!m) return undefined;
  return Math.min(6, Number(m[1]));
}

function namedStyleKey(name: string): string | null {
  const n = name.toLowerCase().replace(/\s+/g, '');
  for (const s of Object.values(STYLE_BY_ID)) {
    if (s.level || s.id === 'Normal' || s.id === 'NoSpacing') continue;
    if (s.name.toLowerCase().replace(/\s+/g, '') === n) return s.id;
  }
  return null;
}

async function convertParagraph(p: XNode, ctx: Ctx): Promise<Item[]> {
  const pPrNode = kid(p, 'w:pPr');
  const direct = parsePPr(pPrNode, ctx);
  const styleId = kid(pPrNode, 'w:pStyle')?.attrs['w:val'] ?? defaultParagraphStyleId(ctx);
  const style = styleId ? ctx.styles.get(styleId) : undefined;
  const eff = merge<PPr>(ctx.docP, resolveStyleP(ctx, styleId), direct);
  const baseR = merge<RPr>(ctx.docR, resolveStyleR(ctx, styleId));
  const level = style ? headingLevel(style.name, style.id) : undefined;
  const force = level != null;
  const styleKey = style ? namedStyleKey(style.name) : null;

  const inline: Inline[] = [];
  await convertInline(p, ctx, baseR, force, undefined, inline);

  // Split on page breaks.
  const groups: JSONNode[][] = [[]];
  const breaks: number[] = [];
  for (const i of inline) {
    if ((i as any).pageBreak) {
      groups.push([]);
      breaks.push(groups.length - 1);
    } else groups[groups.length - 1].push(i as JSONNode);
  }

  const numId = eff.numId && eff.numId !== '0' ? eff.numId : undefined;
  const makePara = (content: JSONNode[]): JSONNode => {
    const attrs = paragraphAttrs(eff, ctx, force, styleKey);
    const node: JSONNode = level
      ? { type: 'heading', attrs: { ...attrs, level }, content: mergeText(content) }
      : { type: 'paragraph', attrs, content: mergeText(content) };
    if (!node.content!.length) delete node.content;
    return node;
  };

  const items: Item[] = [];
  if (groups.length === 1) {
    const node = makePara(groups[0]);
    items.push({ node, styleId, contextual: eff.contextual, list: numId && !level ? { numId, ilvl: eff.ilvl ?? 0 } : undefined });
    return items;
  }
  groups.forEach((g, idx) => {
    if (idx > 0) items.push({ node: { type: 'pageBreak' } });
    if (g.length) items.push({ node: makePara(g), styleId, contextual: eff.contextual });
  });
  return items;
}

function listFormat(ctx: Ctx, numId: string, ilvl: number): LvlDef {
  const abs = ctx.nums.get(numId);
  const lvl = (abs != null ? ctx.abstracts.get(abs)?.get(ilvl) : undefined) ?? { fmt: 'decimal', start: 1 };
  const so = ctx.startOverrides.get(`${numId}:${ilvl}`);
  return so != null ? { ...lvl, start: so } : lvl;
}

const ORDERED_TYPE: Record<string, string> = {
  decimal: '1',
  decimalZero: '1',
  lowerLetter: 'a',
  upperLetter: 'A',
  lowerRoman: 'i',
  upperRoman: 'I',
};

function buildLists(items: Item[], ctx: Ctx): JSONNode[] {
  // contextualSpacing: no gap between neighbouring paragraphs of the same style.
  items.forEach((it, i) => {
    if (!it.contextual || it.node.type !== 'paragraph') return;
    const next = items[i + 1];
    const prev = items[i - 1];
    if (next && next.styleId === it.styleId && next.node.type === 'paragraph') it.node.attrs!.spaceAfter = 0;
    if (prev && prev.styleId === it.styleId && prev.node.type === 'paragraph') it.node.attrs!.spaceBefore = 0;
  });

  const out: JSONNode[] = [];
  let stack: { list: JSONNode; level: number; numId: string }[] = [];
  for (const it of items) {
    if (!it.list) {
      stack = [];
      out.push(it.node);
      continue;
    }
    const { numId, ilvl } = it.list;
    while (stack.length && (stack[stack.length - 1].level > ilvl || (stack[stack.length - 1].level === ilvl && stack[stack.length - 1].numId !== numId))) {
      stack.pop();
    }
    const def = listFormat(ctx, numId, ilvl);
    const counters = ctx.counters.get(numId) ?? [];
    ctx.counters.set(numId, counters);
    const number = counters[ilvl] == null ? def.start : (counters[ilvl] as number) + 1;
    counters[ilvl] = number;
    for (let l = ilvl + 1; l < counters.length; l++) counters[l] = undefined;

    if (!stack.length || stack[stack.length - 1].level < ilvl) {
      const bullet = def.fmt === 'bullet' || def.fmt === 'none';
      const list: JSONNode = bullet
        ? { type: 'bulletList', content: [] }
        : { type: 'orderedList', attrs: { start: number, type: ORDERED_TYPE[def.fmt] ?? '1' }, content: [] };
      if (!stack.length) out.push(list);
      else {
        const parent = stack[stack.length - 1].list;
        parent.content![parent.content!.length - 1].content!.push(list);
      }
      stack.push({ list, level: ilvl, numId });
    }
    // list paragraphs get their indentation from the list itself
    if (it.node.attrs) {
      it.node.attrs.indentLeft = null;
      it.node.attrs.indentFirst = null;
    }
    stack[stack.length - 1].list.content!.push({ type: 'listItem', content: [it.node] });
  }
  return out;
}

async function convertBlocks(nodes: XNode[], ctx: Ctx): Promise<JSONNode[]> {
  const items: Item[] = [];
  const walk = async (list: XNode[]) => {
    for (const c of list) {
      switch (c.name) {
        case 'w:p':
          items.push(...(await convertParagraph(c, ctx)));
          break;
        case 'w:tbl': {
          const t = await convertTable(c, ctx);
          if (t) items.push({ node: t });
          break;
        }
        case 'w:sdt': {
          const content = kid(c, 'w:sdtContent');
          if (content) await walk(content.children);
          break;
        }
        case 'w:customXml':
        case 'w:ins':
          await walk(c.children);
          break;
      }
    }
  };
  await walk(nodes);
  return buildLists(items, ctx);
}

async function convertTable(tbl: XNode, ctx: Ctx): Promise<JSONNode | undefined> {
  const tblPr = kid(tbl, 'w:tblPr');
  const styleId = kid(tblPr, 'w:tblStyle')?.attrs['w:val'];
  const style = styleId ? ctx.styles.get(styleId) : undefined;
  let bordered = false;
  const chain = styleChain(ctx, styleId);
  for (const s of chain) if (s.tblBorders != null) bordered = s.tblBorders;
  if (style && /table grid/i.test(style.name)) bordered = true;
  const direct = kid(tblPr, 'w:tblBorders');
  if (direct) bordered = hasBorders(direct);

  const grid = kids(kid(tbl, 'w:tblGrid'), 'w:gridCol').map((g) => (num(g.attrs['w:w']) ?? 0) / 15); // twips -> px
  const rows: JSONNode[] = [];
  const open: (JSONNode | undefined)[] = [];
  let firstRow = true;

  for (const tr of kids(tbl, 'w:tr')) {
    const cells: JSONNode[] = [];
    const isHeader = !!kid(kid(tr, 'w:trPr'), 'w:tblHeader');
    let col = 0;
    for (const tc of kids(tr, 'w:tc')) {
      const tcPr = kid(tc, 'w:tcPr');
      const span = num(kid(tcPr, 'w:gridSpan')?.attrs['w:val']) ?? 1;
      const vm = kid(tcPr, 'w:vMerge');
      if (vm && vm.attrs['w:val'] !== 'restart') {
        const origin = open[col];
        if (origin) origin.attrs!.rowspan = (origin.attrs!.rowspan ?? 1) + 1;
        col += span;
        continue;
      }
      const content = await convertBlocks(tc.children, ctx);
      if (!content.length || content[content.length - 1].type !== 'paragraph') content.push({ type: 'paragraph' });
      const fill = kid(tcPr, 'w:shd')?.attrs['w:fill'];
      const widths = grid.slice(col, col + span);
      const vAlign = kid(tcPr, 'w:vAlign')?.attrs['w:val'];
      const cell: JSONNode = {
        type: isHeader && firstRow ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan: span,
          rowspan: 1,
          colwidth: widths.length === span && widths.every((w) => w > 0) ? widths.map((w) => Math.round(w)) : null,
          backgroundColor: fill && fill !== 'auto' && /^[0-9a-fA-F]{6}$/.test(fill) ? '#' + fill.toUpperCase() : null,
          verticalAlign: vAlign === 'center' || vAlign === 'bottom' ? vAlign : null,
        },
        content,
      };
      for (let i = 0; i < span; i++) open[col + i] = vm ? cell : undefined;
      cells.push(cell);
      col += span;
    }
    if (cells.length) rows.push({ type: 'tableRow', content: cells });
    firstRow = false;
  }
  if (!rows.length) return undefined;
  const jc = kid(tblPr, 'w:jc')?.attrs['w:val'];
  return { type: 'table', attrs: { bordered, align: jc === 'center' || jc === 'right' ? jc : null }, content: rows };
}

// ---------------------------------------------------------------------------
// Headers / footers
// ---------------------------------------------------------------------------
function extractHeaderText(root: XNode): { text: string; align: 'left' | 'center' | 'right' } {
  const lines: string[] = [];
  let align: 'left' | 'center' | 'right' = 'left';
  let first = true;
  for (const p of kids(root, 'w:p')) {
    let text = '';
    let skip = false;
    const walk = (n: XNode) => {
      for (const c of n.children) {
        if (c.name === 'w:fldSimple') {
          const instr = c.attrs['w:instr'] ?? '';
          if (/NUMPAGES/i.test(instr)) text += '{pages}';
          else if (/\bPAGE\b/i.test(instr)) text += '{page}';
          else walk(c);
        } else if (c.name === 'w:instrText') {
          const t = textOf(c);
          if (/NUMPAGES/i.test(t)) text += '{pages}';
          else if (/\bPAGE\b/i.test(t)) text += '{page}';
        } else if (c.name === 'w:fldChar') {
          const t = c.attrs['w:fldCharType'];
          if (t === 'separate') skip = true;
          if (t === 'end') skip = false;
        } else if (c.name === 'w:t') {
          if (!skip) text += textOf(c);
        } else if (c.name === 'w:tab') {
          if (!skip) text += '\t';
        } else walk(c);
      }
    };
    walk(p);
    if (first) {
      const jc = kid(kid(p, 'w:pPr'), 'w:jc')?.attrs['w:val'];
      align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left';
      first = false;
    }
    if (text.trim()) lines.push(text.replace(/\t+/g, '  ').trim());
  }
  return { text: lines.join(' '), align };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export interface ImportResult {
  doc: JSONNode;
  meta: DocMeta;
}

export async function importDocx(data: Uint8Array | ArrayBuffer): Promise<ImportResult> {
  if (!data || (data as Uint8Array).byteLength < 4) throw new Error('This file is empty. If it is on OneDrive/Nextcloud, make sure it has finished downloading.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('This file is not a valid .docx (it could not be read as a Word document).');
  }
  const docXml = await readText(zip, 'word/document.xml');
  if (!docXml) throw new Error('This file is not a valid .docx (word/document.xml is missing).');

  const theme = parseTheme(await readText(zip, 'word/theme/theme1.xml'));
  const themeCtx = { themeFonts: theme.fonts, themeColors: theme.colors };
  const { styles, docR, docP } = parseStyles(await readText(zip, 'word/styles.xml'), themeCtx);
  const numbering = parseNumbering(await readText(zip, 'word/numbering.xml'));
  const rels = parseRels(await readText(zip, 'word/_rels/document.xml.rels'));

  const meta = defaultMeta();

  // Document defaults = docDefaults + the default paragraph style (usually "Normal").
  const normalId = [...styles.values()].find((s) => s.type === 'paragraph' && s.isDefault)?.id;
  const baseR = merge<RPr>(docR, normalId ? resolveStyleR({ styles } as Ctx, normalId) : undefined);
  const baseP = merge<PPr>(docP, normalId ? resolveStyleP({ styles } as Ctx, normalId) : undefined);
  meta.defaults = {
    fontFamily: baseR.font ?? theme.fonts.minor ?? DEFAULT_FONT,
    fontSize: baseR.sz ?? 10,
    color: baseR.color && baseR.color !== 'auto' ? baseR.color : null,
    spaceBefore: baseP.before ?? 0,
    spaceAfter: baseP.after ?? 0,
    lineHeight: baseP.line ?? 1,
  };

  const ctx: Ctx = {
    zip,
    rels,
    styles,
    docR,
    docP,
    defaults: meta.defaults,
    nums: numbering.nums,
    abstracts: numbering.abstracts,
    startOverrides: numbering.startOverrides,
    themeFonts: theme.fonts,
    themeColors: theme.colors,
    counters: new Map(),
    images: new Map(),
  };

  const root = parseXml(docXml);
  const body = kid(root, 'w:body');
  const blocks = await convertBlocks(body?.children ?? [], ctx);
  const doc: JSONNode = { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };

  // Page setup from the final section properties.
  const sect = kid(body, 'w:sectPr');
  if (sect) {
    const sz = kid(sect, 'w:pgSz');
    const mar = kid(sect, 'w:pgMar');
    const w = num(sz?.attrs['w:w']);
    const h = num(sz?.attrs['w:h']);
    if (w && h) {
      meta.page.width = w / 20;
      meta.page.height = h / 20;
      meta.page.orientation = w > h ? 'landscape' : 'portrait';
    }
    if (mar) {
      meta.page.marginTop = Math.abs(num(mar.attrs['w:top']) ?? 1440) / 20;
      meta.page.marginBottom = Math.abs(num(mar.attrs['w:bottom']) ?? 1440) / 20;
      meta.page.marginLeft = (num(mar.attrs['w:left']) ?? 1440) / 20;
      meta.page.marginRight = (num(mar.attrs['w:right']) ?? 1440) / 20;
    }
    for (const kind of ['header', 'footer'] as const) {
      const refs = kids(sect, kind === 'header' ? 'w:headerReference' : 'w:footerReference');
      const ref = refs.find((r) => (r.attrs['w:type'] ?? 'default') === 'default') ?? refs[0];
      const target = ref ? rels.get(ref.attrs['r:id'])?.target : undefined;
      const xml = target ? await readText(zip, resolvePartPath(target)) : undefined;
      if (xml) {
        const { text, align } = extractHeaderText(parseXml(xml));
        meta[kind] = { text, align };
      }
    }
  }

  const bg = kid(root, 'w:background')?.attrs['w:color'];
  if (bg && bg !== 'auto' && /^[0-9a-fA-F]{6}$/.test(bg) && bg.toUpperCase() !== 'FFFFFF') meta.page.color = '#' + bg;

  const core = await readText(zip, 'docProps/core.xml');
  if (core) {
    const c = parseXml(core);
    meta.title = textOf(kid(c, 'dc:title') ?? { name: '', attrs: {}, children: [] });
    meta.author = textOf(kid(c, 'dc:creator') ?? { name: '', attrs: {}, children: [] });
    const created = kid(c, 'dcterms:created');
    if (created) meta.created = textOf(created);
  }

  return { doc, meta };
}

