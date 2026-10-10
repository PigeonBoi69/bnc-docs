import { XMLParser } from 'fast-xml-parser';

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text?: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
});

function conv(arr: any[]): XNode[] {
  const out: XNode[] = [];
  for (const item of arr) {
    const key = Object.keys(item).find((k) => k !== ':@');
    if (!key || key === '#comment') continue;
    if (key === '#text') {
      out.push({ name: '#text', attrs: {}, children: [], text: String(item[key]) });
      continue;
    }
    out.push({ name: key, attrs: item[':@'] ?? {}, children: conv(item[key] ?? []) });
  }
  return out;
}

/** Parse an XML string and return the root element. */
export function parseXml(xml: string): XNode {
  const nodes = conv(parser.parse(xml));
  return nodes.find((n) => n.name !== '#text') ?? { name: '', attrs: {}, children: [] };
}

export function kids(n: XNode | undefined, name?: string): XNode[] {
  if (!n) return [];
  return n.children.filter((c) => c.name !== '#text' && (!name || c.name === name));
}

export function kid(n: XNode | undefined, name: string): XNode | undefined {
  return n?.children.find((c) => c.name === name);
}

export function attr(n: XNode | undefined, name: string): string | undefined {
  return n?.attrs[name];
}

export function textOf(n: XNode): string {
  if (n.name === '#text') return n.text ?? '';
  return n.children.map(textOf).join('');
}

/** Depth-first search for the first descendant with the given name. */
export function findDeep(n: XNode, name: string): XNode | undefined {
  for (const c of n.children) {
    if (c.name === name) return c;
    const r = findDeep(c, name);
    if (r) return r;
  }
  return undefined;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
