// File-format registry: decode any supported file into editor content, and encode the editor back out.
import { marked } from 'marked';
import TurndownService from 'turndown';
import { DocMeta, JSONNode, defaultMeta } from './model';
import { importDocx } from './docx-import';
import { exportDocx } from './docx-export';
import { loadBncdoc, saveBncdoc } from './bncdoc';
import { exportRtf } from './rtf';
import { buildDocumentHtml } from './print';

export type Format = 'bncdoc' | 'docx' | 'html' | 'md' | 'txt' | 'rtf' | 'pdf';

export const FORMAT_INFO: Record<Format, { label: string; ext: string; writable: boolean }> = {
  bncdoc: { label: 'BNC Docs Document (.bncdoc)', ext: 'bncdoc', writable: true },
  docx: { label: 'Word Document (.docx)', ext: 'docx', writable: true },
  pdf: { label: 'PDF (.pdf)', ext: 'pdf', writable: false },
  html: { label: 'Web Page (.html)', ext: 'html', writable: true },
  md: { label: 'Markdown (.md)', ext: 'md', writable: true },
  txt: { label: 'Plain Text (.txt)', ext: 'txt', writable: true },
  rtf: { label: 'Rich Text Format (.rtf)', ext: 'rtf', writable: true },
};

export function formatFromName(name: string): Format | undefined {
  const ext = name.toLowerCase().split('.').pop();
  switch (ext) {
    case 'bncdoc':
      return 'bncdoc';
    case 'docx':
      return 'docx';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
    case 'markdown':
      return 'md';
    case 'txt':
      return 'txt';
    case 'rtf':
      return 'rtf';
  }
  return undefined;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.\\/]+$/, '');
}

export interface Decoded {
  /** Either ready-made editor JSON ... */
  json?: JSONNode;
  /** ... or HTML for the editor to parse (markdown, html, text). */
  html?: string;
  meta: DocMeta;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function decodeFile(name: string, data: Uint8Array): Promise<Decoded> {
  const fmt = formatFromName(name);
  const text = () => new TextDecoder('utf-8').decode(data);
  switch (fmt) {
    case 'bncdoc': {
      const r = await loadBncdoc(data);
      return { json: r.doc, meta: r.meta };
    }
    case 'docx': {
      const r = await importDocx(data);
      return { json: r.doc, meta: r.meta };
    }
    case 'md': {
      const html = (await marked.parse(text(), { async: false })) as string;
      return { html, meta: defaultMeta() };
    }
    case 'html': {
      const doc = new DOMParser().parseFromString(text(), 'text/html');
      doc.querySelectorAll('script,style,iframe,object,embed').forEach((n) => n.remove());
      const meta = defaultMeta();
      meta.title = doc.title || '';
      return { html: doc.body.innerHTML, meta };
    }
    case 'txt': {
      const html = text()
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => `<p>${escapeHtml(l)}</p>`)
        .join('');
      return { html, meta: defaultMeta() };
    }
    default:
      throw new Error(`BNC Docs can't open "${name}" yet. Supported: .bncdoc, .docx, .md, .html, .txt`);
  }
}

export interface EncodeInput {
  json: JSONNode;
  meta: DocMeta;
  html: string;
  text: string;
  css: string;
}

let turndown: TurndownService | undefined;
function getTurndown() {
  if (turndown) return turndown;
  turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  turndown.addRule('underline', { filter: ['u'], replacement: (c) => `<u>${c}</u>` });
  turndown.addRule('pageBreak', { filter: (n) => n.nodeName === 'DIV' && (n as HTMLElement).dataset?.type === 'page-break', replacement: () => '\n\n---\n\n' });
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_c, node) => {
      const rows = Array.from((node as HTMLElement).querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((td) => (td.textContent ?? '').trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      return `\n\n${line(rows[0])}\n| ${Array(width).fill('---').join(' | ')} |\n${rows.slice(1).map(line).join('\n')}\n\n`;
    },
  });
  return turndown;
}

export async function encodeFile(fmt: Format, i: EncodeInput): Promise<Uint8Array> {
  const enc = (s: string) => new TextEncoder().encode(s);
  switch (fmt) {
    case 'bncdoc':
      return saveBncdoc(i.json, i.meta);
    case 'docx':
      return exportDocx(i.json, i.meta);
    case 'html':
      return enc(buildDocumentHtml(i.html, i.meta, i.css));
    case 'md':
      return enc(getTurndown().turndown(i.html) + '\n');
    case 'txt':
      return enc(i.text);
    case 'rtf':
      return enc(exportRtf(i.json, i.meta));
    default:
      throw new Error('Use Export as PDF for PDF output.');
  }
}
