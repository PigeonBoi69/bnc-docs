// Builds standalone HTML for export, printing and PDF rendering.
import { DocMeta, FONT_FALLBACK, HeaderFooter, namedStylesCss } from './model';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function docBaseCss(meta: DocMeta): string {
  const d = meta.defaults;
  const font = `'${d.fontFamily}', ${FONT_FALLBACK}`;
  return `
:root{--doc-font:${font};--doc-size:${d.fontSize}pt;--doc-space-before:${d.spaceBefore}pt;--doc-space-after:${d.spaceAfter}pt;--doc-line:${d.lineHeight};--doc-color:${d.color ? '#' + d.color.replace('#', '') : '#000'}}
${namedStylesCss()}`;
}

export function buildDocumentHtml(bodyHtml: string, meta: DocMeta, css: string, opts: { print?: boolean } = {}): string {
  const p = meta.page;
  const printCss = opts.print
    ? `@page{size:${p.width}pt ${p.height}pt;margin:${p.marginTop}pt ${p.marginRight}pt ${p.marginBottom}pt ${p.marginLeft}pt}
html,body{margin:0;padding:0;background:${p.color ?? '#fff'};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{width:auto;max-width:none;padding:0;margin:0;box-shadow:none;min-height:0}
.page-break{break-after:page;height:0;margin:0;border:0;padding:0;background:none}
.doc [data-pbb]{break-before:page}
.doc table{break-inside:auto}.doc tr{break-inside:avoid}.doc h1,.doc h2,.doc h3{break-after:avoid}`
    : `body{background:#f0f0f0;margin:0;padding:24px}
.doc{width:${p.width - p.marginLeft - p.marginRight}pt;max-width:100%;margin:0 auto;padding:${p.marginTop}pt ${p.marginRight}pt ${p.marginBottom}pt ${p.marginLeft}pt;background:${p.color ?? '#fff'};box-shadow:0 2px 12px rgba(0,0,0,.18);box-sizing:content-box}
.page-break{border-top:1px dashed #bbb;margin:12px 0}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(meta.title || 'Document')}</title>
<meta name="generator" content="BNC Docs">
<style>${css}
${docBaseCss(meta)}
${printCss}</style></head>
<body><div class="doc">${bodyHtml}</div></body></html>`;
}

/** Header/footer templates for Chromium's printToPDF (page tokens become built-in spans). */
export function pdfTemplate(hf: HeaderFooter, meta: DocMeta): string | undefined {
  if (!hf.text.trim()) return undefined;
  const text = escapeHtml(hf.text).replace(/\{pages\}/g, '<span class="totalPages"></span>').replace(/\{page\}/g, '<span class="pageNumber"></span>');
  const p = meta.page;
  return `<div style="font-size:9pt;font-family:'${meta.defaults.fontFamily}',Arial,sans-serif;color:#555;width:100%;box-sizing:border-box;padding:0 ${p.marginRight}pt 0 ${p.marginLeft}pt;text-align:${hf.align}">${text}</div>`;
}
