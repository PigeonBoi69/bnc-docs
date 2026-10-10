// BNC Docs document model -> .docx (via the `docx` library).
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  LineRuleType,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Packer,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type ISectionOptions,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';
import { DocMeta, JSONNode, NAMED_STYLES, ptToTwips } from './model';

type ParaChild = TextRun | ImageRun | ExternalHyperlink;
type Block = Paragraph | Table;

interface Ctx {
  meta: DocMeta;
  numbering: any[];
  olCount: number;
}

const FORMATS: Record<string, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
  '1': LevelFormat.DECIMAL,
  a: LevelFormat.LOWER_LETTER,
  A: LevelFormat.UPPER_LETTER,
  i: LevelFormat.LOWER_ROMAN,
  I: LevelFormat.UPPER_ROMAN,
};

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const hex = (c: string | undefined | null) => (c ? c.replace('#', '').toUpperCase() : undefined);

function cleanFont(f: string | undefined): string | undefined {
  if (!f) return undefined;
  return f.split(',')[0].replace(/["']/g, '').trim() || undefined;
}

function parsePt(v: any): number | undefined {
  if (v == null) return undefined;
  const n = parseFloat(String(v));
  if (!Number.isFinite(n)) return undefined;
  return /px$/.test(String(v)) ? n * 0.75 : n;
}

function dataUriToBytes(uri: string): { bytes: Uint8Array; mime: string } | undefined {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
  if (!m) return undefined;
  const mime = m[1];
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
}

function runProps(marks: JSONNode['marks'] = []): IRunOptions {
  const o: any = {};
  for (const m of marks) {
    const a = m.attrs ?? {};
    switch (m.type) {
      case 'bold':
        o.bold = true;
        break;
      case 'italic':
        o.italics = true;
        break;
      case 'underline':
        o.underline = {};
        break;
      case 'strike':
        o.strike = true;
        break;
      case 'superscript':
        o.superScript = true;
        break;
      case 'subscript':
        o.subScript = true;
        break;
      case 'highlight':
        if (a.color) o.shading = { type: ShadingType.CLEAR, fill: hex(a.color), color: 'auto' };
        break;
      case 'textStyle': {
        const font = cleanFont(a.fontFamily);
        if (font) o.font = font;
        const size = parsePt(a.fontSize);
        if (size) o.size = Math.round(size * 2);
        if (a.color) o.color = hex(a.color);
        if (a.textTransform === 'uppercase') o.allCaps = true;
        if (a.fontVariant === 'small-caps') o.smallCaps = true;
        const ls = parsePt(a.letterSpacing);
        if (ls) o.characterSpacing = Math.round(ls * 20);
        break;
      }
    }
  }
  return o;
}

function convertInline(nodes: JSONNode[] | undefined): ParaChild[] {
  const out: ParaChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      const props = runProps(n.marks);
      const link = n.marks?.find((m) => m.type === 'link')?.attrs?.href as string | undefined;
      const parts = (n.text ?? '').split('\t');
      const runs: TextRun[] = [];
      parts.forEach((part, i) => {
        if (i > 0) runs.push(new TextRun({ ...props, children: [new Tab()] }));
        if (part) runs.push(new TextRun({ ...props, text: part }));
      });
      if (link) out.push(new ExternalHyperlink({ link, children: runs }));
      else out.push(...runs);
    } else if (n.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
    } else if (n.type === 'image') {
      const img = convertImage(n);
      if (img) out.push(img);
    }
  }
  return out;
}

function convertImage(n: JSONNode): ImageRun | undefined {
  const src: string | undefined = n.attrs?.src;
  if (!src) return undefined;
  const d = dataUriToBytes(src);
  if (!d) return undefined; // remote images are not embedded
  const kind = d.mime.split('/')[1]?.replace('jpeg', 'jpg');
  if (!['png', 'jpg', 'gif', 'bmp'].includes(kind)) return undefined;
  // image width/height are CSS pixels in the editor
  const w = parseFloat(String(n.attrs?.width ?? '')) || 300;
  const h = parseFloat(String(n.attrs?.height ?? '')) || 200;
  return new ImageRun({
    type: kind as 'png' | 'jpg' | 'gif' | 'bmp',
    data: d.bytes,
    transformation: { width: Math.round(w), height: Math.round(h) },
    altText: n.attrs?.alt ? { name: 'image', description: n.attrs.alt, title: n.attrs.alt } : undefined,
  });
}

function paragraphOptions(n: JSONNode, ctx: Ctx): IParagraphOptions {
  const a = n.attrs ?? {};
  const o: any = {};
  if (a.textAlign && ALIGN[a.textAlign]) o.alignment = ALIGN[a.textAlign];
  const spacing: any = {};
  if (a.spaceBefore != null) spacing.before = ptToTwips(a.spaceBefore);
  if (a.spaceAfter != null) spacing.after = ptToTwips(a.spaceAfter);
  if (a.lineHeight != null) {
    const lh = a.lineHeight;
    const pt = typeof lh === 'string' && /pt$/.test(lh) ? parseFloat(lh) : undefined;
    if (pt) {
      spacing.line = ptToTwips(pt);
      spacing.lineRule = LineRuleType.EXACT;
    } else {
      spacing.line = Math.round(Number(lh) * 240);
      spacing.lineRule = LineRuleType.AUTO;
    }
  }
  if (Object.keys(spacing).length) o.spacing = spacing;
  const indent: any = {};
  if (a.indentLeft) indent.left = ptToTwips(a.indentLeft);
  if (a.indentRight) indent.right = ptToTwips(a.indentRight);
  if (a.indentFirst) {
    if (a.indentFirst > 0) indent.firstLine = ptToTwips(a.indentFirst);
    else indent.hanging = ptToTwips(-a.indentFirst);
  }
  if (Object.keys(indent).length) o.indent = indent;
  if (a.shading) o.shading = { type: ShadingType.CLEAR, fill: hex(a.shading), color: 'auto' };
  if (a.pageBreakBefore) o.pageBreakBefore = true;
  if (n.type === 'heading') o.style = `Heading${a.level ?? 1}`;
  else if (a.styleId && a.styleId !== 'Normal') o.style = a.styleId;
  return o;
}

function convertParagraph(n: JSONNode, ctx: Ctx, extra: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({ ...paragraphOptions(n, ctx), ...extra, children: convertInline(n.content) });
}

function convertList(list: JSONNode, depth: number, ctx: Ctx): Block[] {
  const out: Block[] = [];
  const ordered = list.type === 'orderedList';
  let reference = 'bullets';
  if (ordered) {
    reference = `ol${++ctx.olCount}`;
    const fmt = FORMATS[list.attrs?.type ?? '1'] ?? LevelFormat.DECIMAL;
    ctx.numbering.push({
      reference,
      levels: Array.from({ length: 9 }, (_, l) => ({
        level: l,
        format: fmt,
        text: `%${l + 1}.`,
        start: l === depth ? Number(list.attrs?.start ?? 1) : 1,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
      })),
    });
  }
  for (const item of list.content ?? []) {
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...convertList(child, depth + 1, ctx));
      } else if (child.type === 'paragraph' || child.type === 'heading') {
        out.push(
          first
            ? convertParagraph(child, ctx, { numbering: { reference, level: Math.min(depth, 8) }, indent: undefined })
            : convertParagraph(child, ctx, { indent: { left: 720 * (depth + 1) } }),
        );
        first = false;
      } else {
        out.push(...convertBlock(child, ctx));
      }
    }
  }
  return out;
}

function convertTable(t: JSONNode, ctx: Ctx): Table | undefined {
  const rows = t.content ?? [];
  if (!rows.length) return undefined;
  const bordered = t.attrs?.bordered !== false;
  const line = bordered ? { style: BorderStyle.SINGLE, size: 4, color: '000000' } : { style: BorderStyle.NONE, size: 0, color: 'auto' };
  const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };

  // Column grid: take widths from the first row's cells.
  const colWidths: number[] = [];
  const firstRow = rows[0].content ?? [];
  for (const c of firstRow) {
    const span = c.attrs?.colspan ?? 1;
    const w: number[] | null = c.attrs?.colwidth ?? null;
    for (let i = 0; i < span; i++) colWidths.push(w && w[i] ? Math.round(w[i] * 15) : 1500);
  }

  const tableRows = rows.map(
    (r) =>
      new TableRow({
        children: (r.content ?? []).map((c) => {
          const a = c.attrs ?? {};
          const span = a.colspan ?? 1;
          const w: number[] | null = a.colwidth ?? null;
          const width = w && w.length ? w.reduce((s, x) => s + (x || 0), 0) * 15 : 1500 * span;
          const blocks = withTableSeparators((c.content ?? []).flatMap((b) => convertBlock(b, ctx)));
          if (!blocks.length) blocks.push(new Paragraph({}));
          return new TableCell({
            columnSpan: span > 1 ? span : undefined,
            rowSpan: (a.rowspan ?? 1) > 1 ? a.rowspan : undefined,
            width: { size: Math.round(width), type: WidthType.DXA },
            shading: a.backgroundColor ? { type: ShadingType.CLEAR, fill: hex(a.backgroundColor), color: 'auto' } : undefined,
            verticalAlign: a.verticalAlign === 'center' ? VerticalAlignTable.CENTER : a.verticalAlign === 'bottom' ? VerticalAlignTable.BOTTOM : undefined,
            children: blocks as any,
          });
        }),
      }),
  );
  return new Table({
    rows: tableRows,
    columnWidths: colWidths,
    width: { size: colWidths.reduce((s, x) => s + x, 0), type: WidthType.DXA },
    borders,
    alignment: t.attrs?.align === 'center' ? AlignmentType.CENTER : t.attrs?.align === 'right' ? AlignmentType.RIGHT : undefined,
  });
}

function convertBlock(n: JSONNode, ctx: Ctx): Block[] {
  switch (n.type) {
    case 'paragraph':
    case 'heading':
      return [convertParagraph(n, ctx)];
    case 'bulletList':
    case 'orderedList':
      return convertList(n, 0, ctx);
    case 'table': {
      const t = convertTable(n, ctx);
      return t ? [t] : [];
    }
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'blockquote':
      return (n.content ?? []).flatMap((c) => convertBlock(c, ctx)).map((b) => b);
    case 'codeBlock':
      return [
        new Paragraph({
          children: [new TextRun({ text: (n.content ?? []).map((c) => c.text ?? '').join(''), font: 'Consolas', size: 20 })],
        }),
      ];
    case 'horizontalRule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 1 } } })];
    default:
      return [];
  }
}

/** Word needs a paragraph between two tables and after a table that ends a body or a cell. */
function withTableSeparators(blocks: Block[]): Block[] {
  const out: Block[] = [];
  blocks.forEach((b, i) => {
    out.push(b);
    if (b instanceof Table) {
      const next = blocks[i + 1];
      if (!next || next instanceof Table) out.push(new Paragraph({ spacing: { after: 0 } }));
    }
  });
  return out;
}

function headerFooterParagraph(hf: DocMeta['header'], meta: DocMeta): Paragraph {
  const children: (TextRun | string)[] = [];
  const parts = hf.text.split(/(\{pages?\})/);
  const runs: TextRun[] = [];
  for (const part of parts) {
    if (part === '{page}') runs.push(new TextRun({ children: [PageNumber.CURRENT], size: 20 }));
    else if (part === '{pages}') runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20 }));
    else if (part) runs.push(new TextRun({ text: part, size: 20 }));
  }
  void children;
  void meta;
  return new Paragraph({ alignment: ALIGN[hf.align] ?? AlignmentType.LEFT, children: runs });
}

export async function exportDocx(doc: JSONNode, meta: DocMeta): Promise<Uint8Array> {
  const ctx: Ctx = { meta, numbering: [], olCount: 0 };
  const children = withTableSeparators((doc.content ?? []).flatMap((n) => convertBlock(n, ctx)));
  if (!children.length) children.push(new Paragraph({}));

  const d = meta.defaults;
  const lh = d.lineHeight;
  const defaultSpacing: any = { before: ptToTwips(d.spaceBefore), after: ptToTwips(d.spaceAfter) };
  if (typeof lh === 'number') {
    defaultSpacing.line = Math.round(lh * 240);
    defaultSpacing.lineRule = LineRuleType.AUTO;
  }

  const paragraphStyles = NAMED_STYLES.filter((s) => s.id !== 'Normal' && s.id !== 'NoSpacing').map((s) => ({
    id: s.id,
    name: s.level ? `heading ${s.level}` : s.name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: {
      font: s.font,
      size: s.size ? s.size * 2 : undefined,
      color: s.color,
      bold: s.bold,
      italics: s.italic,
      characterSpacing: s.letterSpacing ? Math.round(s.letterSpacing * 20) : undefined,
    },
    paragraph: {
      spacing: {
        before: s.spaceBefore != null ? ptToTwips(s.spaceBefore) : undefined,
        after: s.spaceAfter != null ? ptToTwips(s.spaceAfter) : undefined,
        line: s.lineHeight ? Math.round(s.lineHeight * 240) : undefined,
        lineRule: s.lineHeight ? LineRuleType.AUTO : undefined,
      },
      alignment: s.align ? ALIGN[s.align] : undefined,
      indent: s.indentLeft || s.indentRight ? { left: ptToTwips(s.indentLeft ?? 0), right: ptToTwips(s.indentRight ?? 0) } : undefined,
      keepNext: s.level ? true : undefined,
      outlineLevel: s.level ? s.level - 1 : undefined,
    },
  }));
  paragraphStyles.push({
    id: 'NoSpacing',
    name: 'No Spacing',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: {} as any,
    paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO } } as any,
  });

  const page = meta.page;
  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: ptToTwips(page.width), height: ptToTwips(page.height) },
        margin: {
          top: ptToTwips(page.marginTop),
          bottom: ptToTwips(page.marginBottom),
          left: ptToTwips(page.marginLeft),
          right: ptToTwips(page.marginRight),
          header: 720,
          footer: 720,
        },
      },
    },
    headers: meta.header.text ? { default: new Header({ children: [headerFooterParagraph(meta.header, meta)] }) } : undefined,
    footers: meta.footer.text ? { default: new Footer({ children: [headerFooterParagraph(meta.footer, meta)] }) } : undefined,
    children: children as any,
  };

  const file = new Document({
    creator: meta.author || 'BNC Docs',
    title: meta.title || undefined,
    description: 'Created with BNC Docs',
    background: meta.page.color ? { color: hex(meta.page.color) } : undefined,
    styles: {
      default: {
        document: {
          run: { font: cleanFont(d.fontFamily), size: Math.round(d.fontSize * 2), color: hex(d.color) },
          paragraph: { spacing: defaultSpacing },
        },
      },
      paragraphStyles: paragraphStyles as any,
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: Array.from({ length: 9 }, (_, l) => ({
            level: l,
            format: LevelFormat.BULLET,
            text: ['•', 'o', '▪'][l % 3],
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
          })),
        },
        ...ctx.numbering,
      ],
    },
    sections: [section],
  });

  return await Packer.pack(file, 'uint8array');
}
