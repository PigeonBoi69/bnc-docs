import type { App } from '../app';
import { PAGE_SIZES } from '../core/model';
import { field, h, macify, modal, toast } from './dom';

const inches = (pt: number) => Math.round((pt / 72) * 100) / 100;
const toPt = (inch: string) => Math.max(0, Math.round(parseFloat(inch || '0') * 72 * 10) / 10);

export function pageSetupDialog(app: App) {
  const p = app.meta.page;
  const num = (v: number) => h('input', { class: 'input', value: String(inches(v)), attrs: { type: 'number', step: '0.05', min: '0' } });
  const top = num(p.marginTop);
  const bottom = num(p.marginBottom);
  const left = num(p.marginLeft);
  const right = num(p.marginRight);
  const size = h('select', { class: 'select' });
  const current = Object.entries(PAGE_SIZES).find(([, s]) => Math.abs(s.w - Math.min(p.width, p.height)) < 1 && Math.abs(s.h - Math.max(p.width, p.height)) < 1)?.[0] ?? 'custom';
  for (const [k, s] of Object.entries(PAGE_SIZES)) size.append(h('option', { text: s.label, attrs: { value: k, ...(k === current ? { selected: '' } : {}) } }));
  if (current === 'custom') size.append(h('option', { text: 'Custom', attrs: { value: 'custom', selected: '' } }));
  const orient = h('select', { class: 'select' }, h('option', { text: 'Portrait', attrs: { value: 'portrait' } }), h('option', { text: 'Landscape', attrs: { value: 'landscape' } }));
  orient.value = p.orientation;
  const body = h(
    'div',
    null,
    h('div', { class: 'grid2' }, field('Top (in)', top), field('Bottom (in)', bottom), field('Left (in)', left), field('Right (in)', right)),
    h('div', { class: 'grid2' }, field('Paper size', size), field('Orientation', orient)),
  );
  modal('Page Setup', body, [
    { label: 'Cancel' },
    {
      label: 'OK',
      primary: true,
      run: () => {
        let w = p.width;
        let hgt = p.height;
        const s = PAGE_SIZES[size.value];
        if (s) {
          w = s.w;
          hgt = s.h;
        }
        const landscape = orient.value === 'landscape';
        const short = Math.min(w, hgt);
        const long = Math.max(w, hgt);
        app.applyMeta({
          page: {
            ...p,
            width: landscape ? long : short,
            height: landscape ? short : long,
            orientation: landscape ? 'landscape' : 'portrait',
            marginTop: toPt(top.value),
            marginBottom: toPt(bottom.value),
            marginLeft: toPt(left.value),
            marginRight: toPt(right.value),
          },
        });
      },
    },
  ]);
}

export function headerFooterDialog(app: App, focus: 'header' | 'footer' = 'header') {
  const m = app.meta;
  const mk = (hf: typeof m.header) => {
    const text = h('input', { class: 'input', value: hf.text, attrs: { type: 'text', placeholder: 'Leave empty for none' } });
    const align = h('select', { class: 'select' }, ...(['left', 'center', 'right'] as const).map((a) => h('option', { text: a[0].toUpperCase() + a.slice(1), attrs: { value: a } })));
    align.value = hf.align;
    const pageBtn = h('button', { class: 'btn', style: { height: '28px', padding: '0 10px' }, text: '+ Page number', on: { click: () => (text.value += '{page}') } });
    const countBtn = h('button', { class: 'btn', style: { height: '28px', padding: '0 10px' }, text: '+ Page count', on: { click: () => (text.value += '{pages}') } });
    return { text, align, pageBtn, countBtn };
  };
  const hd = mk(m.header);
  const ft = mk(m.footer);
  const body = h(
    'div',
    null,
    h('p', { class: 'muted', text: 'Use {page} for the page number and {pages} for the total number of pages.', style: { marginTop: '0' } }),
    h('h3', { text: 'Header', style: { margin: '8px 0' } }),
    field('Text', hd.text),
    h('div', { style: 'display:flex;gap:8px;align-items:end' }, field('Alignment', hd.align), h('div', { style: 'margin-bottom:12px;display:flex;gap:6px' }, hd.pageBtn, hd.countBtn)),
    h('h3', { text: 'Footer', style: { margin: '8px 0' } }),
    field('Text', ft.text),
    h('div', { style: 'display:flex;gap:8px;align-items:end' }, field('Alignment', ft.align), h('div', { style: 'margin-bottom:12px;display:flex;gap:6px' }, ft.pageBtn, ft.countBtn)),
  );
  const dlg = modal('Header & Footer', body, [
    { label: 'Cancel' },
    {
      label: 'OK',
      primary: true,
      run: () =>
        app.applyMeta({
          header: { text: hd.text.value, align: hd.align.value as any },
          footer: { text: ft.text.value, align: ft.align.value as any },
        }),
    },
  ]);
  setTimeout(() => (focus === 'footer' ? ft.text : hd.text).focus(), 20);
  return dlg;
}

export function linkDialog(app: App) {
  const ed = app.editor;
  const existing = ed.getAttributes('link').href as string | undefined;
  const { from, to, empty } = ed.state.selection;
  const selected = empty ? '' : ed.state.doc.textBetween(from, to, ' ');
  const text = h('input', { class: 'input', value: selected, attrs: { type: 'text' } });
  const url = h('input', { class: 'input', value: existing ?? 'https://', attrs: { type: 'text' } });
  const body = h('div', null, field('Text to display', text), field('Address', url));
  const buttons: Parameters<typeof modal>[2] = [
    { label: 'Cancel' },
    {
      label: 'OK',
      primary: true,
      run: () => {
        let href = url.value.trim();
        if (!href) return;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#')) href = 'https://' + href;
        if (empty && !selected) {
          ed.chain().focus().insertContent({ type: 'text', text: text.value || href, marks: [{ type: 'link', attrs: { href } }] }).run();
        } else {
          ed.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }
      },
    },
  ];
  if (existing) buttons.unshift({ label: 'Remove link', run: () => void ed.chain().focus().extendMarkRange('link').unsetLink().run() });
  modal('Insert Link', body, buttons);
  setTimeout(() => url.select(), 20);
}

export function tableDialog(app: App) {
  const rows = h('input', { class: 'input', value: '3', attrs: { type: 'number', min: '1', max: '100' } });
  const cols = h('input', { class: 'input', value: '3', attrs: { type: 'number', min: '1', max: '30' } });
  modal('Insert Table', h('div', { class: 'grid2' }, field('Rows', rows), field('Columns', cols)), [
    { label: 'Cancel' },
    { label: 'Insert', primary: true, run: () => void app.run('insert-table', { rows: Number(rows.value) || 1, cols: Number(cols.value) || 1 }) },
  ]);
}

export function wordCountDialog(app: App) {
  const s = app.stats();
  const row = (k: string, v: string | number) => [h('span', { text: k }), h('strong', { text: String(v) })];
  modal('Word Count', h('div', { class: 'shortcuts' }, ...row('Pages', s.pages), ...row('Words', s.words), ...row('Characters (no spaces)', s.charsNoSpaces), ...row('Characters (with spaces)', s.chars), ...row('Paragraphs', s.paragraphs)), [{ label: 'Close', primary: true }], { width: 360 });
}

export function docInfoDialog(app: App) {
  const title = h('input', { class: 'input', value: app.meta.title, attrs: { type: 'text' } });
  const author = h('input', { class: 'input', value: app.meta.author, attrs: { type: 'text' } });
  const s = app.stats();
  modal(
    'Document Info',
    h(
      'div',
      null,
      field('Title', title),
      field('Author', author),
      h('p', { class: 'muted', text: `${s.pages} page(s) · ${s.words} words · ${s.chars} characters` }),
      h('p', { class: 'muted', text: app.doc.cloud ? `Nextcloud: ${app.doc.cloud.path}` : app.doc.local ? `File: ${app.doc.local}` : 'Not saved yet' }),
    ),
    [
      { label: 'Cancel' },
      { label: 'Save', primary: true, run: () => app.applyMeta({ title: title.value, author: author.value }) },
    ],
  );
}

export function shortcutsDialog() {
  const rows: [string, string][] = [
    ['New / Open / Save', 'Ctrl+N / Ctrl+O / Ctrl+S'],
    ['Save As', 'Ctrl+Shift+S'],
    ['Print', 'Ctrl+P'],
    ['Bold / Italic / Underline', 'Ctrl+B / I / U'],
    ['Strikethrough', 'Ctrl+Shift+X'],
    ['Subscript / Superscript', 'Ctrl+, / Ctrl+.'],
    ['Align left / center / right / justify', 'Ctrl+Shift+L / E / R / J'],
    ['Bulleted / numbered list', 'Ctrl+Shift+8 / 7'],
    ['Increase / decrease font size', 'Ctrl+Shift+> / <'],
    ['Find / Replace', 'Ctrl+F / Ctrl+H'],
    ['Insert link', 'Ctrl+K'],
    ['Page break', 'Ctrl+Enter'],
    ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'],
    ['Search commands', 'Alt+Q'],
    ['Zoom', 'Ctrl+Scroll'],
  ];
  const grid = h('div', { class: 'shortcuts' });
  for (const [k, v] of rows) grid.append(h('span', { text: k }), h('span', { class: 'kbd', text: macify(v) }));
  modal('Keyboard Shortcuts', grid, [{ label: 'Close', primary: true }], { width: 520 });
}

export function aboutDialog(version: string) {
  modal(
    'About BNC Docs',
    h(
      'div',
      { style: 'text-align:center' },
      h('img', { attrs: { src: (document.querySelector('img.app-logo') as HTMLImageElement | null)?.src ?? './icon.png', width: '72', height: '72' }, style: 'border-radius:16px' }),
      h('h2', { text: 'BNC Docs', style: 'margin:10px 0 2px' }),
      h('div', { class: 'muted', text: `Version ${version}` }),
      h('p', { text: 'An open-source word processor with full .docx support and Nextcloud integration.' }),
      h('p', { class: 'muted', text: 'MIT License. Built with Electron, TipTap/ProseMirror, JSZip and docx.' }),
    ),
    [{ label: 'Close', primary: true }],
    { width: 400 },
  );
}

export function comingSoon(feature: string) {
  toast(`${feature} is coming in a later version of BNC Docs.`);
}
