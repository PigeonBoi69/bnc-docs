// Minimal RTF writer (text, character formatting, alignment, lists, tables).
import { DocMeta, JSONNode, STYLE_BY_ID } from './model';

const esc = (s: string) =>
  s.replace(/[\\{}]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, (c) => {
    const code = c.charCodeAt(0);
    if (c === '\t') return '\\tab ';
    if (c === '\n') return '\\line ';
    return `\\u${code > 32767 ? code - 65536 : code}?`;
  });

export function exportRtf(doc: JSONNode, meta: DocMeta): string {
  const fonts: string[] = [];
  const colors: string[] = [];
  const fontIdx = (f: string) => {
    const name = f.split(',')[0].replace(/["']/g, '').trim();
    let i = fonts.indexOf(name);
    if (i < 0) i = fonts.push(name) - 1;
    return i;
  };
  const colorIdx = (c: string) => {
    const hex = c.replace('#', '').toUpperCase();
    let i = colors.indexOf(hex);
    if (i < 0) i = colors.push(hex) - 1;
    return i + 1;
  };
  fontIdx(meta.defaults.fontFamily);

  const run = (n: JSONNode, base: { size?: number; bold?: boolean; italic?: boolean }): string => {
    if (n.type === 'hardBreak') return '\\line ';
    if (n.type !== 'text') return '';
    let ctl = '';
    let size = base.size;
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') ctl += '\\b';
      if (m.type === 'italic') ctl += '\\i';
      if (m.type === 'underline') ctl += '\\ul';
      if (m.type === 'strike') ctl += '\\strike';
      if (m.type === 'superscript') ctl += '\\super';
      if (m.type === 'subscript') ctl += '\\sub';
      if (m.type === 'textStyle') {
        if (m.attrs?.fontFamily) ctl += `\\f${fontIdx(m.attrs.fontFamily)}`;
        if (m.attrs?.fontSize) size = parseFloat(m.attrs.fontSize);
        if (m.attrs?.color) ctl += `\\cf${colorIdx(m.attrs.color)}`;
      }
    }
    if (base.bold) ctl += '\\b';
    if (base.italic) ctl += '\\i';
    if (size) ctl += `\\fs${Math.round(size * 2)}`;
    return `{${ctl} ${esc(n.text ?? '')}}`;
  };

  const para = (n: JSONNode, prefix = '', indent = 0): string => {
    const a = n.attrs ?? {};
    const style = n.type === 'heading' ? STYLE_BY_ID[`Heading${a.level}`] : a.styleId ? STYLE_BY_ID[a.styleId] : undefined;
    const align = { center: '\\qc', right: '\\qr', justify: '\\qj' }[a.textAlign as string] ?? '\\ql';
    const sb = Math.round((a.spaceBefore ?? style?.spaceBefore ?? meta.defaults.spaceBefore) * 20);
    const sa = Math.round((a.spaceAfter ?? style?.spaceAfter ?? meta.defaults.spaceAfter) * 20);
    const li = Math.round(((a.indentLeft ?? 0) + indent) * 20);
    const base = { size: style?.size, bold: n.type === 'heading' && style?.bold, italic: style?.italic };
    const body = (n.content ?? []).map((c) => run(c, base)).join('');
    return `\\pard${align}\\li${li}\\sb${sb}\\sa${sa} ${prefix ? esc(prefix) + '\\tab ' : ''}${body}\\par\n`;
  };

  const block = (n: JSONNode, indent = 0): string => {
    switch (n.type) {
      case 'paragraph':
      case 'heading':
        return para(n, '', indent);
      case 'pageBreak':
        return '\\page\n';
      case 'bulletList':
      case 'orderedList': {
        let out = '';
        let i = Number(n.attrs?.start ?? 1);
        for (const item of n.content ?? []) {
          let first = true;
          for (const c of item.content ?? []) {
            if (c.type === 'paragraph' && first) {
              out += para(c, n.type === 'bulletList' ? '\u2022' : `${i}.`, indent + 36);
              first = false;
            } else out += block(c, indent + 36);
          }
          i++;
        }
        return out;
      }
      case 'table': {
        let out = '';
        for (const row of n.content ?? []) {
          let x = 0;
          let defs = '';
          let cells = '';
          for (const cell of row.content ?? []) {
            const w = ((cell.attrs?.colwidth as number[] | null)?.[0] ?? 100) * 15;
            x += w * (cell.attrs?.colspan ?? 1);
            defs += `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${x}`;
            cells += (cell.content ?? []).map((c) => (c.type === 'paragraph' || c.type === 'heading' ? para(c).replace(/\\par\n$/, '') : '')).join('\\line ') + '\\cell ';
          }
          out += `\\trowd\\trgaph108 ${defs}${cells}\\row\n`;
        }
        return out + '\\pard\\par\n';
      }
      default:
        return '';
    }
  };

  const body = (doc.content ?? []).map((n) => block(n)).join('');
  const fontTbl = fonts.map((f, i) => `{\\f${i} ${esc(f)};}`).join('');
  const colorTbl = colors.map((c) => `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`).join('');
  const p = meta.page;
  const tw = (pt: number) => Math.round(pt * 20);
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl${fontTbl}}{\\colortbl;${colorTbl}}\\paperw${tw(p.width)}\\paperh${tw(p.height)}\\margl${tw(p.marginLeft)}\\margr${tw(p.marginRight)}\\margt${tw(p.marginTop)}\\margb${tw(p.marginBottom)}\\fs${Math.round(meta.defaults.fontSize * 2)}\n${body}}`;
}
