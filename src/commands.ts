import type { App } from './app';
import { FONT_SIZES } from './ui/pickers';
import { MARGIN_PRESETS, PAGE_SIZES, STYLE_BY_ID, fontStack } from './core/model';
import { FORMAT_INFO, type Format } from './core/io';
import { aboutDialog, comingSoon, docInfoDialog, headerFooterDialog, linkDialog, pageSetupDialog, shortcutsDialog, tableDialog, wordCountDialog } from './ui/dialogs';
import { nextcloudDialog } from './ui/cloud';
import { toast } from './ui/dom';
import { initFindBar } from './ui/findbar';
import { installFromResults, pluginsDialog, useStyle } from './ui/styles';

export interface Command {
  id: string;
  label: string;
  keywords?: string;
  section?: string;
  shortcut?: string;
  hidden?: boolean;
  run: (arg?: any) => void | Promise<void>;
}

const RESET_PARA = { spaceBefore: null, spaceAfter: null, lineHeight: null, indentLeft: null, indentRight: null, indentFirst: null, textAlign: null, styleId: null };
const CUSTOM_STYLES = new Set(['Title', 'Subtitle', 'Quote', 'IntenseQuote']);

export function currentStyleId(app: App): string {
  const ed = app.editor;
  for (let l = 1; l <= 6; l++) if (ed.isActive('heading', { level: l })) return `Heading${l}`;
  const a = ed.getAttributes('paragraph');
  if (a.styleId && STYLE_BY_ID[a.styleId]) return a.styleId;
  if (a.spaceAfter === 0 && a.lineHeight === 1) return 'NoSpacing';
  return 'Normal';
}

export function currentFontSize(app: App): number {
  const fs = app.editor.getAttributes('textStyle').fontSize as string | undefined;
  if (fs) {
    const n = parseFloat(fs);
    return /px$/.test(fs) ? Math.round(n * 75) / 100 : n;
  }
  for (let l = 1; l <= 6; l++) if (app.editor.isActive('heading', { level: l })) return STYLE_BY_ID[`Heading${l}`].size ?? app.meta.defaults.fontSize;
  const sid = app.editor.getAttributes('paragraph').styleId;
  if (sid && STYLE_BY_ID[sid]?.size) return STYLE_BY_ID[sid].size!;
  return app.meta.defaults.fontSize;
}

export function currentFont(app: App): string {
  const ff = app.editor.getAttributes('textStyle').fontFamily as string | undefined;
  if (ff) return ff.split(',')[0].replace(/["']/g, '').trim();
  for (let l = 1; l <= 6; l++) if (app.editor.isActive('heading', { level: l })) return STYLE_BY_ID[`Heading${l}`].font ?? app.meta.defaults.fontFamily;
  const sid = app.editor.getAttributes('paragraph').styleId;
  if (sid && STYLE_BY_ID[sid]?.font) return STYLE_BY_ID[sid].font!;
  return app.meta.defaults.fontFamily;
}

export function registerCommands(app: App) {
  const ed = () => app.editor;
  const chain = () => app.editor.chain().focus();

  const add = (id: string, label: string, run: Command['run'], extra: Partial<Command> = {}) => {
    app.cmds.set(id, { id, label, run, ...extra });
  };

  // ---------------- File ----------------
  add('new', 'New document', () => app.newDocument(), { shortcut: 'Ctrl+N', section: 'File', keywords: 'blank create' });
  add('open', 'Open fileâ€¦', () => app.openLocal(), { shortcut: 'Ctrl+O', section: 'File', keywords: 'browse docx' });
  add('save', 'Save', () => app.save(), { shortcut: 'Ctrl+S', section: 'File' });
  add('save-as', 'Save Asâ€¦', () => app.saveAs(), { shortcut: 'Ctrl+Shift+S', section: 'File', keywords: 'copy' });
  add('print', 'Printâ€¦', () => app.print(), { shortcut: 'Ctrl+P', section: 'File' });
  for (const fmt of ['pdf', 'docx', 'bncdoc', 'html', 'md', 'txt', 'rtf'] as Format[]) {
    add(`export-${fmt}`, `Export as ${FORMAT_INFO[fmt].label}`, () => app.exportAs(fmt), { section: 'File', keywords: 'download convert save' });
  }
  add('open-cloud', 'Open from Nextcloudâ€¦', () => app.openCloud(), { section: 'Nextcloud', keywords: 'cloud online' });
  add('save-cloud', 'Save to Nextcloudâ€¦', () => app.saveCloudAs(), { section: 'Nextcloud', keywords: 'cloud online upload' });
  add('cloud-settings', 'Nextcloud accountâ€¦', () => void nextcloudDialog(app), { section: 'Nextcloud', keywords: 'sign in connect login' });
  add('rename', 'Rename document', () => app.rename(), { section: 'File' });
  add('doc-info', 'Document infoâ€¦', () => docInfoDialog(app), { section: 'File', keywords: 'properties title author' });
  add('autosave-toggle', 'Toggle AutoSave', () => app.setAutosave(!app.autosave), { section: 'File' });

  // ---------------- Clipboard / history ----------------
  add('undo', 'Undo', () => void chain().undo().run(), { shortcut: 'Ctrl+Z', section: 'Home' });
  add('redo', 'Redo', () => void chain().redo().run(), { shortcut: 'Ctrl+Y', section: 'Home' });
  add('cut', 'Cut', () => void document.execCommand('cut'), { section: 'Home' });
  add('copy', 'Copy', () => void document.execCommand('copy'), { section: 'Home' });
  add('paste', 'Paste', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text();
          return void chain().insertContent(html).run();
        }
        if (item.types.includes('text/plain')) {
          const text = await (await item.getType('text/plain')).text();
          return void chain().insertContent(text.split(/\r?\n/).map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')).run();
        }
        const img = item.types.find((t) => t.startsWith('image/'));
        if (img) return void app.insertImageFile(new File([await item.getType(img)], 'pasted-image.png', { type: img }));
      }
    } catch {
      toast('Use Ctrl+V to paste.');
    }
  }, { section: 'Home', keywords: 'clipboard' });
  add('format-painter', 'Format Painter', () => app.startPainter(), { section: 'Home', keywords: 'copy formatting' });

  // ---------------- Character formatting ----------------
  add('bold', 'Bold', () => void chain().toggleBold().run(), { shortcut: 'Ctrl+B', section: 'Home' });
  add('italic', 'Italic', () => void chain().toggleItalic().run(), { shortcut: 'Ctrl+I', section: 'Home' });
  add('underline', 'Underline', () => void chain().toggleUnderline().run(), { shortcut: 'Ctrl+U', section: 'Home' });
  add('strike', 'Strikethrough', () => void chain().toggleStrike().run(), { shortcut: 'Ctrl+Shift+X', section: 'Home' });
  add('subscript', 'Subscript', () => void chain().toggleSubscript().run(), { shortcut: 'Ctrl+,', section: 'Home' });
  add('superscript', 'Superscript', () => void chain().toggleSuperscript().run(), { shortcut: 'Ctrl+.', section: 'Home' });
  add('clear-format', 'Clear All Formatting', () => {
    chain().unsetAllMarks().setParagraph().setParagraphFormat({ ...RESET_PARA, shading: null }).run();
  }, { section: 'Home', keywords: 'remove reset' });
  add('font-family', 'Font', (name?: string) => {
    if (!name) return;
    if (name === app.meta.defaults.fontFamily) chain().unsetFontFamily().run();
    else chain().setFontFamily(fontStack(name)).run();
  }, { hidden: true });
  add('font-size', 'Font size', (n?: number | string) => {
    const v = parseFloat(String(n));
    if (!Number.isFinite(v) || v < 1 || v > 1000) return;
    chain().setFontSize(`${v}pt`).run();
  }, { hidden: true });
  add('font-grow', 'Increase font size', () => {
    const cur = currentFontSize(app);
    const next = FONT_SIZES.find((s) => s > cur) ?? cur + 10;
    chain().setFontSize(`${next}pt`).run();
  }, { shortcut: 'Ctrl+Shift+>', section: 'Home', keywords: 'bigger larger' });
  add('font-shrink', 'Decrease font size', () => {
    const cur = currentFontSize(app);
    const next = [...FONT_SIZES].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1);
    chain().setFontSize(`${next}pt`).run();
  }, { shortcut: 'Ctrl+Shift+<', section: 'Home', keywords: 'smaller' });
  add('text-color', 'Font color', (c?: string | null) => void (c ? chain().setColor(c).run() : chain().unsetColor().run()), { section: 'Home' });
  add('highlight', 'Text highlight color', (c?: string | null) => void (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run()), { section: 'Home', keywords: 'marker' });
  add('change-case', 'Change case', (mode: 'upper' | 'lower' | 'title') => {
    const { from, to, empty } = ed().state.selection;
    if (empty) return;
    const text = ed().state.doc.textBetween(from, to, '\n');
    const out = mode === 'upper' ? text.toUpperCase() : mode === 'lower' ? text.toLowerCase() : text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    chain().insertContentAt({ from, to }, out).run();
  }, { section: 'Home' });

  // ---------------- Paragraph formatting ----------------
  add('bullets', 'Bulleted list', () => void chain().toggleBulletList().run(), { shortcut: 'Ctrl+Shift+8', section: 'Home' });
  add('numbering', 'Numbered list', () => void chain().toggleOrderedList().run(), { shortcut: 'Ctrl+Shift+7', section: 'Home' });
  add('numbering-format', 'Numbering format', (type: string) => {
    if (!ed().isActive('orderedList')) chain().toggleOrderedList().run();
    chain().updateAttributes('orderedList', { type }).run();
  }, { hidden: true });
  add('indent', 'Increase indent', () => void chain().increaseIndent().run(), { section: 'Home' });
  add('outdent', 'Decrease indent', () => void chain().decreaseIndent().run(), { section: 'Home' });
  for (const [id, a, sc] of [['align-left', 'left', 'L'], ['align-center', 'center', 'E'], ['align-right', 'right', 'R'], ['align-justify', 'justify', 'J']] as const) {
    add(id, `Align ${a === 'justify' ? 'justified' : a}`, () => void chain().setTextAlign(a).run(), { shortcut: `Ctrl+Shift+${sc}`, section: 'Home' });
  }
  add('line-spacing', 'Line spacing', (v: number | string) => void chain().setParagraphFormat({ lineHeight: v }).run(), { section: 'Home', keywords: 'single double' });
  add('space-before', 'Spacing before', (pt: number) => void chain().setParagraphFormat({ spaceBefore: pt }).run(), { hidden: true });
  add('space-after', 'Spacing after', (pt: number) => void chain().setParagraphFormat({ spaceAfter: pt }).run(), { hidden: true });
  add('indent-left', 'Indent left', (pt: number) => void chain().setParagraphFormat({ indentLeft: pt || null }).run(), { hidden: true });
  add('indent-right', 'Indent right', (pt: number) => void chain().setParagraphFormat({ indentRight: pt || null }).run(), { hidden: true });
  add('shading', 'Shading', (c?: string | null) => {
    if (ed().isActive('table')) void chain().setCellAttribute('backgroundColor', c ?? null).run();
    else void chain().setParagraphFormat({ shading: c ?? null }).run();
  }, { section: 'Home', keywords: 'background fill' });
  add('style', 'Apply style', (id: string) => {
    const s = STYLE_BY_ID[id];
    if (!s) return;
    const c = chain();
    if (s.level) c.setHeading({ level: s.level as 1 | 2 | 3 | 4 | 5 | 6 });
    else c.setParagraph();
    c.setParagraphFormat({ ...RESET_PARA, ...(id === 'NoSpacing' ? { spaceAfter: 0, lineHeight: 1 } : {}), styleId: CUSTOM_STYLES.has(id) ? id : null }).run();
  }, { hidden: true });
  for (const s of Object.values(STYLE_BY_ID)) add(`style-${s.id}`, `Style: ${s.name}`, () => app.run('style', s.id), { section: 'Styles', keywords: 'heading title' });

  // ---------------- Find ----------------
  const find = initFindBar(app);
  add('find', 'Find', () => find.open(false), { shortcut: 'Ctrl+F', section: 'Home', keywords: 'search' });
  add('replace', 'Find and replace', () => find.open(true), { shortcut: 'Ctrl+H', section: 'Home' });

  // ---------------- Insert ----------------
  add('insert-page-break', 'Page break', () => void chain().insertPageBreak().run(), { shortcut: 'Ctrl+Enter', section: 'Insert', keywords: 'new page' });
  add('insert-table', 'Insert table', (o: { rows: number; cols: number }) => void chain().insertTable({ rows: o.rows, cols: o.cols, withHeaderRow: false }).run(), { section: 'Insert' });
  add('insert-table-dialog', 'Tableâ€¦', () => tableDialog(app), { section: 'Insert' });
  add('insert-picture', 'Pictureâ€¦', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp,image/svg+xml';
    input.onchange = () => input.files?.[0] && void app.insertImageFile(input.files[0]);
    input.click();
  }, { section: 'Insert', keywords: 'image photo' });
  add('insert-link', 'Linkâ€¦', () => linkDialog(app), { shortcut: 'Ctrl+K', section: 'Insert', keywords: 'hyperlink url' });
  add('insert-hr', 'Horizontal line', () => void chain().setHorizontalRule().run(), { section: 'Insert' });
  add('insert-date', 'Date and time', () => void chain().insertContent(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })).run(), { section: 'Insert' });
  add('insert-char', 'Insert character', (ch: string) => void chain().insertContent(ch).run(), { hidden: true });
  add('insert-toc', 'Table of contents', () => {
    const heads: { level: number; text: string; pos: number }[] = [];
    ed().state.doc.descendants((n, pos) => {
      if (n.type.name === 'heading' && n.textContent.trim()) heads.push({ level: n.attrs.level, text: n.textContent, pos });
      return n.type.name !== 'paragraph';
    });
    if (!heads.length) return toast('Add some headings first, then insert the table of contents.');
    const page = (pos: number) => app.pagination.breaks.filter((b) => b <= pos).length + 1;
    const content = [
      { type: 'paragraph', attrs: { spaceAfter: 6 }, content: [{ type: 'text', text: 'Table of Contents', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '16pt' } }] }] },
      ...heads.map((hd) => ({
        type: 'paragraph',
        attrs: { indentLeft: (hd.level - 1) * 18, spaceAfter: 2 },
        content: [{ type: 'text', text: `${hd.text}  Â·  ${page(hd.pos)}` }],
      })),
    ];
    void chain().insertContent(content).run();
  }, { section: 'References', keywords: 'contents toc headings' });
  add('header-footer', 'Header & Footerâ€¦', () => void headerFooterDialog(app), { section: 'Insert', keywords: 'page number' });
  add('insert-page-number', 'Page number', (where: 'header' | 'footer' = 'footer') => {
    const hf = app.meta[where];
    if (!hf.text.includes('{page}')) app.applyMeta({ [where]: { ...hf, text: (hf.text ? hf.text + ' ' : '') + 'Page {page}', align: hf.text ? hf.align : 'center' } } as any);
    else toast('A page number is already there.');
  }, { section: 'Insert' });
  add('insert-bookmark', 'Bookmark', () => comingSoon('Bookmarks'), { section: 'Insert' });
  add('insert-comment', 'New comment', () => comingSoon('Comments'), { section: 'Insert', keywords: 'review' });
  add('insert-equation', 'Equation', () => comingSoon('Equations'), { section: 'Insert', keywords: 'math formula' });
  add('insert-video', 'Online video', () => comingSoon('Online video'), { section: 'Insert' });
  add('insert-drawing', 'Drawing', () => comingSoon('Drawing'), { section: 'Insert' });

  // ---------------- Table (contextual) ----------------
  const tbl = (name: string, label: string, fn: () => boolean) => add(name, label, () => void fn(), { section: 'Table' });
  tbl('table-add-row-above', 'Insert row above', () => chain().addRowBefore().run());
  tbl('table-add-row-below', 'Insert row below', () => chain().addRowAfter().run());
  tbl('table-add-col-left', 'Insert column left', () => chain().addColumnBefore().run());
  tbl('table-add-col-right', 'Insert column right', () => chain().addColumnAfter().run());
  tbl('table-delete-row', 'Delete row', () => chain().deleteRow().run());
  tbl('table-delete-col', 'Delete column', () => chain().deleteColumn().run());
  tbl('table-delete', 'Delete table', () => chain().deleteTable().run());
  tbl('table-merge', 'Merge cells', () => chain().mergeCells().run());
  tbl('table-split', 'Split cell', () => chain().splitCell().run());
  tbl('table-header-row', 'Toggle header row', () => chain().toggleHeaderRow().run());
  tbl('table-borders', 'Toggle table borders', () => chain().updateAttributes('table', { bordered: ed().getAttributes('table').bordered === false }).run());
  add('table-align', 'Table alignment', (a: string | null) => void chain().updateAttributes('table', { align: a }).run(), { hidden: true });
  add('cell-valign', 'Cell vertical alignment', (a: string | null) => void chain().setCellAttribute('verticalAlign', a).run(), { hidden: true });

  // ---------------- Layout ----------------
  add('page-setup', 'Page Setupâ€¦', () => pageSetupDialog(app), { section: 'Layout', keywords: 'margins size orientation' });
  add('page-margins', 'Margins', (key: string) => {
    const m = MARGIN_PRESETS[key];
    if (m) app.applyMeta({ page: { ...app.meta.page, marginTop: m.t, marginBottom: m.b, marginLeft: m.l, marginRight: m.r } });
  }, { hidden: true });
  for (const [k, m] of Object.entries(MARGIN_PRESETS)) add(`margins-${k}`, `Margins: ${m.label}`, () => app.run('page-margins', k), { section: 'Layout' });
  add('page-orientation', 'Orientation', (o: 'portrait' | 'landscape') => {
    const p = app.meta.page;
    const short = Math.min(p.width, p.height);
    const long = Math.max(p.width, p.height);
    app.applyMeta({ page: { ...p, orientation: o, width: o === 'landscape' ? long : short, height: o === 'landscape' ? short : long } });
  }, { hidden: true });
  add('orientation-portrait', 'Orientation: Portrait', () => app.run('page-orientation', 'portrait'), { section: 'Layout' });
  add('orientation-landscape', 'Orientation: Landscape', () => app.run('page-orientation', 'landscape'), { section: 'Layout' });
  add('page-size', 'Paper size', (key: string) => {
    const s = PAGE_SIZES[key];
    if (!s) return;
    const p = app.meta.page;
    app.applyMeta({ page: { ...p, width: p.orientation === 'landscape' ? s.h : s.w, height: p.orientation === 'landscape' ? s.w : s.h } });
  }, { hidden: true });
  for (const [k, s] of Object.entries(PAGE_SIZES)) add(`size-${k}`, `Paper size: ${s.label}`, () => app.run('page-size', k), { section: 'Layout' });
  add('page-color', 'Page color', (c: string | null) => app.applyMeta({ page: { ...app.meta.page, color: c } }), { section: 'Layout', keywords: 'background' });
  add('columns', 'Columns', () => comingSoon('Columns'), { section: 'Layout' });
  add('line-numbers', 'Line numbers', () => comingSoon('Line numbers'), { section: 'Layout' });
  add('page-borders', 'Page borders', () => comingSoon('Page borders'), { section: 'Layout' });

  // ---------------- References ----------------
  add('footnote', 'Insert footnote', () => comingSoon('Footnotes'), { section: 'References' });
  add('endnote', 'Insert endnote', () => comingSoon('Endnotes'), { section: 'References' });
  add('citations', 'Citations', () => comingSoon('Citations'), { section: 'References' });

  // ---------------- Review ----------------
  add('toggle-spelling', 'Spelling & grammar', () => {
    const dom = ed().view.dom;
    const on = dom.getAttribute('spellcheck') !== 'true';
    dom.setAttribute('spellcheck', String(on));
    toast(on ? 'Spell check on' : 'Spell check off');
  }, { section: 'Review', keywords: 'proofing' });
  add('word-count', 'Word count', () => wordCountDialog(app), { section: 'Review', keywords: 'characters pages' });
  add('accessibility', 'Check accessibility', () => comingSoon('The accessibility checker'), { section: 'Review' });
  add('translate', 'Translate', () => comingSoon('Translation'), { section: 'Review' });
  add('track-changes', 'Track changes', () => comingSoon('Track changes'), { section: 'Review' });
  add('dictate', 'Dictate', () => comingSoon('Dictation'), { section: 'Home' });
  add('editor-pane', 'Editor', () => comingSoon('Editor suggestions'), { section: 'Home' });

  // ---------------- View ----------------
  add('zoom-in', 'Zoom in', () => app.setZoom(app.zoom + 0.1), { section: 'View' });
  add('zoom-out', 'Zoom out', () => app.setZoom(app.zoom - 0.1), { section: 'View' });
  add('zoom-100', 'Zoom 100%', () => app.setZoom(1), { section: 'View' });
  add('zoom-fit', 'Fit page width', () => app.fitWidth(), { section: 'View' });
  add('zoom-set', 'Set zoom', (z: number) => app.setZoom(z), { hidden: true });
  add('toggle-ruler', 'Ruler', () => {
    app.ruler.classList.toggle('on');
    app.renderRuler();
  }, { section: 'View' });
  add('toggle-nav', 'Navigation pane', () => {
    app.navPane.classList.toggle('open');
    app.refreshNav();
  }, { section: 'View', keywords: 'headings outline' });
  add('toggle-dark', 'Dark mode', () => app.setTheme(app.theme === 'dark' ? 'light' : 'dark'), { section: 'View', keywords: 'theme light' });
  add('toggle-dark-paper', 'Switch background', () => {
    app.darkPaper = !app.darkPaper;
    app.applyLayoutVars();
    app.refreshUi();
  }, { section: 'View', keywords: 'page dark white' });
  add('toggle-reading', 'Reading view', () => {
    app.root.classList.toggle('reading');
    app.setEditable(!app.root.classList.contains('reading'));
  }, { section: 'View', keywords: 'focus' });
  add('immersive-reader', 'Immersive Reader', () => comingSoon('Immersive Reader'), { section: 'View' });

  add('plugins', 'Plugins…', () => pluginsDialog(app), { section: 'Plugins', keywords: 'theme style color colour icon install bnctheme app color' });
  add('install-plugin', 'Install plugin…', async () => {
    const results = await window.bnc.styles.installDialog();
    await installFromResults(app, results);
  }, { section: 'Plugins', keywords: 'theme bnctheme add' });
  add('app-color-default', 'App color: Violet (built in)', () => useStyle(app, null), { section: 'Plugins', keywords: 'theme reset default' });

  // ---------------- Help ----------------
  add('shortcuts', 'Keyboard shortcuts', () => shortcutsDialog(), { section: 'Help' });
  add('about', 'About BNC Docs', () => aboutDialog(app.version), { section: 'Help' });
}

