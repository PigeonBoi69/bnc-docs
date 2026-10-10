import type { App } from '../app';
import { currentFont, currentFontSize, currentStyleId } from '../commands';
import { MARGIN_PRESETS, PAGE_SIZES, STYLE_BY_ID } from '../core/model';
import { FORMAT_INFO, type Format } from '../core/io';
import { h, iconEl, showMenu, popover, macify, type MenuItem } from './dom';
import type { IconName } from './icons';
import { appColorItems } from './styles';
import { FONT_SIZES, charPicker, colorPicker, combo, loadFonts, tableGridPicker, HIGHLIGHT_COLORS } from './pickers';

type TabId = 'home' | 'insert' | 'layout' | 'references' | 'review' | 'view' | 'help' | 'table';

const TABS: { id: TabId | 'file'; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
];

let active: TabId = 'home';

// ---------------------------------------------------------------------------
// Control builders
// ---------------------------------------------------------------------------
interface BtnOpts {
  icon?: IconName;
  label?: string;
  title: string;
  cmd?: string;
  arg?: any;
  onClick?: (el: HTMLElement) => void;
  active?: () => boolean;
  caret?: boolean;
}

function btn(app: App, o: BtnOpts): HTMLElement {
  const el = h('button', { class: 'rb', title: macify(o.title), attrs: { 'aria-label': o.title } }, o.icon ? iconEl(o.icon, 18) : null, o.label ? h('span', { text: o.label }) : null, o.caret ? h('span', { class: 'caret' }, iconEl('chevron', 12)) : null);
  el.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor focus/selection
  el.addEventListener('click', () => (o.onClick ? o.onClick(el) : o.cmd && void app.run(o.cmd, o.arg)));
  if (o.active) {
    const upd = () => el.classList.toggle('active', !!o.active!());
    app.onRefresh(upd);
    upd();
  }
  return el;
}

function menuBtn(app: App, o: Omit<BtnOpts, 'onClick' | 'cmd'> & { items: () => MenuItem[] }): HTMLElement {
  return btn(app, { ...o, caret: true, onClick: (el) => showMenu(el, o.items) });
}

function sep(): HTMLElement {
  return h('div', { class: 'rsep' });
}

function colorBtn(app: App, o: { icon: IconName; title: string; cmd: string; initial: string; none: string; palette?: string[][]; apply?: (c: string | null) => void }): HTMLElement {
  let last = o.initial;
  const swatch = h('span', { class: 'swatch', style: { background: last } });
  const main = h('button', { class: 'rb grp-l', title: o.title, attrs: { 'aria-label': o.title } }, iconEl(o.icon, 18), swatch);
  const caret = h('button', { class: 'rb split-caret', title: `${o.title} options`, attrs: { 'aria-label': `${o.title} options` } }, iconEl('chevron', 12));
  for (const b of [main, caret]) b.addEventListener('mousedown', (e) => e.preventDefault());
  const apply = (c: string | null) => {
    if (c) {
      last = c;
      swatch.style.background = c;
    }
    o.apply ? o.apply(c) : void app.run(o.cmd, c);
  };
  main.addEventListener('click', () => apply(last));
  caret.addEventListener('click', () => colorPicker(caret, { title: o.title, noneLabel: o.none, onPick: apply, palette: o.palette }));
  return h('span', { style: { display: 'inline-flex', flex: 'none' } }, main, caret);
}

function spin(app: App, o: { label: string; icon?: IconName; title: string; unit: string; step: number; get: () => number; set: (v: number) => void }): HTMLElement {
  const input = h('input', { attrs: { type: 'number', step: String(o.step), min: '0', 'aria-label': o.title }, title: o.title });
  const upd = () => {
    if (document.activeElement !== input) input.value = String(Math.round(o.get() * 100) / 100);
  };
  const commit = () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v >= 0) o.set(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      app.editor.commands.focus();
    }
  });
  app.onRefresh(upd);
  upd();
  return h('span', { class: 'spin' }, h('label', null, o.icon ? iconEl(o.icon, 16) : null, o.label), input, h('span', { text: o.unit }));
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function homeTab(app: App): HTMLElement[] {
  const ed = app.editor;
  const fontCombo = combo({
    width: 112,
    title: 'Font',
    getValue: () => currentFont(app),
    getItems: loadFonts,
    renderItem: (f) => h('span', { text: f, style: { fontFamily: `'${f}'` } }),
    onCommit: (f) => {
      void app.run('font-family', f);
      ed.commands.focus();
    },
  });
  const sizeCombo = combo({
    width: 34,
    title: 'Font size',
    numeric: true,
    getValue: () => String(currentFontSize(app)),
    getItems: () => FONT_SIZES.map(String),
    onCommit: (s) => {
      void app.run('font-size', s);
      ed.commands.focus();
    },
  });
  app.onRefresh(fontCombo.update);
  app.onRefresh(sizeCombo.update);

  const align = (id: string, icon: IconName, a: string) => btn(app, { icon, title: `Align ${a}`, cmd: id, active: () => ed.isActive({ textAlign: a }) || (a === 'left' && !['center', 'right', 'justify'].some((x) => ed.isActive({ textAlign: x }))) });

  const lineSpacing = () => {
    const cur = ed.getAttributes(ed.isActive('heading') ? 'heading' : 'paragraph').lineHeight ?? app.meta.defaults.lineHeight;
    return [1, 1.15, 1.5, 2, 2.5, 3].map<MenuItem>((v) => ({ label: String(v), checked: Number(cur) === v, run: () => void app.run('line-spacing', v) }));
  };

  return [
    btn(app, { icon: 'undo', title: 'Undo (Ctrl+Z)', cmd: 'undo' }),
    btn(app, { icon: 'redo', title: 'Redo (Ctrl+Y)', cmd: 'redo' }),
    sep(),
    menuBtn(app, {
      icon: 'paste',
      title: 'Paste',
      items: () => [
        { label: 'Paste', icon: 'paste', run: () => void app.run('paste') },
        { label: 'Cut', icon: 'cut', run: () => void app.run('cut') },
        { label: 'Copy', icon: 'copy', run: () => void app.run('copy') },
      ],
    }),
    btn(app, { icon: 'formatPainter', title: 'Format Painter', cmd: 'format-painter' }),
    sep(),
    fontCombo.el,
    sizeCombo.el,
    btn(app, { icon: 'plus', title: 'Increase font size', cmd: 'font-grow' }),
    btn(app, { icon: 'minus', title: 'Decrease font size', cmd: 'font-shrink' }),
    btn(app, { icon: 'bold', title: 'Bold (Ctrl+B)', cmd: 'bold', active: () => ed.isActive('bold') }),
    btn(app, { icon: 'italic', title: 'Italic (Ctrl+I)', cmd: 'italic', active: () => ed.isActive('italic') }),
    btn(app, { icon: 'underline', title: 'Underline (Ctrl+U)', cmd: 'underline', active: () => ed.isActive('underline') }),
    colorBtn(app, { icon: 'highlight', title: 'Text highlight color', cmd: 'highlight', initial: '#ffff00', none: 'No color', palette: [HIGHLIGHT_COLORS.slice(0, 10), HIGHLIGHT_COLORS.slice(10).concat(['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'])].map((r) => r.slice(0, 10)).slice(0, 2) }),
    colorBtn(app, { icon: 'fontColor', title: 'Font color', cmd: 'text-color', initial: '#e53935', none: 'Automatic' }),
    btn(app, { icon: 'clearFormat', title: 'Clear all formatting', cmd: 'clear-format' }),
    menuBtn(app, {
      icon: 'more',
      title: 'More font options',
      items: () => [
        { label: 'Strikethrough', icon: 'strike', checked: ed.isActive('strike'), run: () => void app.run('strike') },
        { label: 'Subscript', icon: 'subscript', checked: ed.isActive('subscript'), run: () => void app.run('subscript') },
        { label: 'Superscript', icon: 'superscript', checked: ed.isActive('superscript'), run: () => void app.run('superscript') },
        { separator: true },
        { label: 'UPPERCASE', run: () => void app.run('change-case', 'upper') },
        { label: 'lowercase', run: () => void app.run('change-case', 'lower') },
        { label: 'Capitalize Each Word', run: () => void app.run('change-case', 'title') },
      ],
    }),
    sep(),
    btn(app, { icon: 'bullets', title: 'Bullets (Ctrl+Shift+8)', cmd: 'bullets', active: () => ed.isActive('bulletList') }),
    menuBtn(app, {
      icon: 'numbering',
      title: 'Numbering (Ctrl+Shift+7)',
      active: () => ed.isActive('orderedList'),
      items: () =>
        ([['1', '1. 2. 3.'], ['a', 'a. b. c.'], ['A', 'A. B. C.'], ['i', 'i. ii. iii.'], ['I', 'I. II. III.']] as const).map<MenuItem>(([t, label]) => ({
          label,
          checked: ed.isActive('orderedList') && ed.getAttributes('orderedList').type === t,
          run: () => void app.run('numbering-format', t),
        })),
    }),
    btn(app, { icon: 'outdent', title: 'Decrease indent', cmd: 'outdent' }),
    btn(app, { icon: 'indent', title: 'Increase indent', cmd: 'indent' }),
    align('align-left', 'alignLeft', 'left'),
    align('align-center', 'alignCenter', 'center'),
    align('align-right', 'alignRight', 'right'),
    align('align-justify', 'alignJustify', 'justify'),
    menuBtn(app, { icon: 'lineSpacing', title: 'Line spacing', items: lineSpacing }),
    colorBtn(app, { icon: 'shading', title: 'Shading', cmd: 'shading', initial: '#ffe58f', none: 'No color' }),
    sep(),
    stylesGallery(app),
    sep(),
    menuBtn(app, {
      icon: 'search',
      label: 'Find',
      title: 'Find (Ctrl+F)',
      items: () => [
        { label: 'Find', icon: 'search', shortcut: 'Ctrl+F', run: () => void app.run('find') },
        { label: 'Replace', icon: 'replace', shortcut: 'Ctrl+H', run: () => void app.run('replace') },
      ],
    }),
    btn(app, { icon: 'mic', label: 'Dictate', title: 'Dictate', cmd: 'dictate', caret: true }),
    btn(app, { icon: 'editor', label: 'Editor', title: 'Editor', cmd: 'editor-pane' }),
  ];
}

function stylesGallery(app: App): HTMLElement {
  const tiles: [string, string, string][] = [
    ['Normal', 'Normal', ''],
    ['NoSpacing', 'No Spacing', ''],
    ['Heading1', 'Heading 1', 'font-size:17px;color:var(--accent-text)'],
  ];
  const wrap = h('span', { style: { display: 'inline-flex', gap: '4px', flex: 'none' } });
  const els: [string, HTMLElement][] = [];
  for (const [id, label, style] of tiles) {
    const t = h('button', { class: 'style-tile', title: label, style, text: label });
    t.addEventListener('mousedown', (e) => e.preventDefault());
    t.addEventListener('click', () => void app.run('style', id));
    els.push([id, t]);
    wrap.append(t);
  }
  app.onRefresh(() => {
    const cur = currentStyleId(app);
    for (const [id, el] of els) el.classList.toggle('active', id === cur);
  });
  const more = btn(app, {
    icon: 'chevron',
    title: 'More styles',
    onClick: (el) => {
      let close = () => {};
      const list = h('div', { class: 'list-pop', style: { minWidth: '240px' } });
      for (const s of Object.values(STYLE_BY_ID)) {
        const row = h('div', { class: `list-item${currentStyleId(app) === s.id ? ' sel' : ''}`, style: { padding: '8px 12px' } }, h('span', {
          text: s.name,
          style: {
            fontSize: `${Math.min(26, Math.max(12, (s.size ?? 12) * 1.15))}px`,
            fontStyle: s.italic ? 'italic' : 'normal',
            color: s.level || s.color ? 'var(--accent)' : 'inherit',
            fontWeight: s.level === 1 || s.id === 'Title' ? '600' : '400',
          },
        }));
        row.addEventListener('click', () => {
          close();
          void app.run('style', s.id);
        });
        list.append(row);
      }
      close = popover(el, list);
    },
  });
  wrap.append(more);
  return wrap;
}

function insertTab(app: App): HTMLElement[] {
  return [
    btn(app, { icon: 'pageBreak', label: 'Page Break', title: 'Page Break (Ctrl+Enter)', cmd: 'insert-page-break' }),
    sep(),
    btn(app, { icon: 'table', label: 'Table', title: 'Insert Table', caret: true, onClick: (el) => tableGridPicker(el, (rows, cols) => void app.run('insert-table', { rows, cols }), () => void app.run('insert-table-dialog')) }),
    btn(app, { icon: 'image', label: 'Picture', title: 'Insert Picture', cmd: 'insert-picture' }),
    btn(app, { icon: 'editor', label: 'Drawing', title: 'Drawing', cmd: 'insert-drawing' }),
    btn(app, { icon: 'link', label: 'Link', title: 'Insert Link (Ctrl+K)', cmd: 'insert-link' }),
    sep(),
    btn(app, { icon: 'toc', label: 'Table of Contents', title: 'Table of Contents', cmd: 'insert-toc' }),
    btn(app, { icon: 'bookmark', label: 'Bookmarks', title: 'Bookmarks', cmd: 'insert-bookmark' }),
    btn(app, { icon: 'newComment', label: 'New Comment', title: 'New Comment', cmd: 'insert-comment' }),
    sep(),
    btn(app, { icon: 'header', label: 'Header & Footer', title: 'Header & Footer', cmd: 'header-footer' }),
    menuBtn(app, {
      icon: 'hash',
      label: 'Page Numbers',
      title: 'Page Numbers',
      items: () => [
        { label: 'Bottom of page (footer)', run: () => void app.run('insert-page-number', 'footer') },
        { label: 'Top of page (header)', run: () => void app.run('insert-page-number', 'header') },
      ],
    }),
    btn(app, { icon: 'equation', label: 'Equation', title: 'Equation', cmd: 'insert-equation' }),
    btn(app, { icon: 'symbol', label: 'Symbol', title: 'Symbol', caret: true, onClick: (el) => charPicker(el, 'symbol', (c) => void app.run('insert-char', c)) }),
    btn(app, { icon: 'emoji', label: 'Emoji', title: 'Emoji', caret: true, onClick: (el) => charPicker(el, 'emoji', (c) => void app.run('insert-char', c)) }),
    btn(app, { icon: 'rule', label: 'Line', title: 'Horizontal line', cmd: 'insert-hr' }),
    btn(app, { icon: 'history', label: 'Date', title: 'Date and time', cmd: 'insert-date' }),
  ];
}

function layoutTab(app: App): HTMLElement[] {
  const ed = app.editor;
  const para = () => ed.getAttributes(ed.isActive('heading') ? 'heading' : 'paragraph');
  return [
    menuBtn(app, {
      icon: 'margins',
      label: 'Margins',
      title: 'Margins',
      items: () => [
        ...Object.entries(MARGIN_PRESETS).map<MenuItem>(([k, m]) => ({ label: `${m.label}  (${(m.t / 72).toFixed(2)}" / ${(m.l / 72).toFixed(2)}")`, run: () => void app.run('page-margins', k) })),
        { separator: true },
        { label: 'Custom margins…', run: () => void app.run('page-setup') },
      ],
    }),
    menuBtn(app, {
      icon: 'orientation',
      label: 'Orientation',
      title: 'Orientation',
      items: () => [
        { label: 'Portrait', checked: app.meta.page.orientation === 'portrait', run: () => void app.run('page-orientation', 'portrait') },
        { label: 'Landscape', checked: app.meta.page.orientation === 'landscape', run: () => void app.run('page-orientation', 'landscape') },
      ],
    }),
    menuBtn(app, {
      icon: 'size',
      label: 'Size',
      title: 'Paper size',
      items: () => [
        ...Object.entries(PAGE_SIZES).map<MenuItem>(([k, s]) => ({ label: s.label, checked: Math.abs(Math.min(app.meta.page.width, app.meta.page.height) - s.w) < 1 && Math.abs(Math.max(app.meta.page.width, app.meta.page.height) - s.h) < 1, run: () => void app.run('page-size', k) })),
        { separator: true },
        { label: 'More paper sizes…', run: () => void app.run('page-setup') },
      ],
    }),
    btn(app, { icon: 'columns', label: 'Columns', title: 'Columns', cmd: 'columns', caret: true }),
    menuBtn(app, { icon: 'pageBreak', label: 'Breaks', title: 'Breaks', items: () => [{ label: 'Page break', icon: 'pageBreak', shortcut: 'Ctrl+Enter', run: () => void app.run('insert-page-break') }] }),
    btn(app, { icon: 'hash', label: 'Line Numbers', title: 'Line numbers', cmd: 'line-numbers', caret: true }),
    sep(),
    spin(app, { label: 'Indent Left', icon: 'indent', title: 'Indent left (inches)', unit: '"', step: 0.1, get: () => (para().indentLeft ?? 0) / 72, set: (v) => void app.run('indent-left', v * 72) }),
    spin(app, { label: 'Indent Right', icon: 'outdent', title: 'Indent right (inches)', unit: '"', step: 0.1, get: () => (para().indentRight ?? 0) / 72, set: (v) => void app.run('indent-right', v * 72) }),
    sep(),
    spin(app, { label: 'Spacing Before', icon: 'spacing', title: 'Spacing before (pt)', unit: 'pt', step: 1, get: () => para().spaceBefore ?? app.meta.defaults.spaceBefore, set: (v) => void app.run('space-before', v) }),
    spin(app, { label: 'Spacing After', icon: 'spacing', title: 'Spacing after (pt)', unit: 'pt', step: 1, get: () => para().spaceAfter ?? app.meta.defaults.spaceAfter, set: (v) => void app.run('space-after', v) }),
    sep(),
    btn(app, { icon: 'square', label: 'Page Borders', title: 'Page borders', cmd: 'page-borders', caret: true }),
    colorBtn(app, { icon: 'palette', title: 'Page Color', cmd: 'page-color', initial: '#ffffff', none: 'No color', apply: (c) => void app.run('page-color', c) }),
    btn(app, { icon: 'file', label: 'Page Setup', title: 'Page Setup', cmd: 'page-setup' }),
  ];
}

function referencesTab(app: App): HTMLElement[] {
  return [
    btn(app, { icon: 'toc', label: 'Table of Contents', title: 'Table of Contents', cmd: 'insert-toc' }),
    btn(app, { icon: 'bookmarked', label: 'Insert Footnote', title: 'Insert Footnote', cmd: 'footnote' }),
    btn(app, { icon: 'file', label: 'Insert Endnote', title: 'Insert Endnote', cmd: 'endnote' }),
    btn(app, { icon: 'quote', label: 'Citations', title: 'Citations', cmd: 'citations', caret: true }),
  ];
}

function reviewTab(app: App): HTMLElement[] {
  return [
    btn(app, { icon: 'editor', label: 'Editor', title: 'Editor', cmd: 'editor-pane' }),
    btn(app, { icon: 'spelling', label: 'Spelling & Grammar', title: 'Spelling & Grammar', cmd: 'toggle-spelling', active: () => app.editor.view.dom.getAttribute('spellcheck') === 'true' }),
    btn(app, { icon: 'hash', label: 'Word Count', title: 'Word Count', cmd: 'word-count' }),
    btn(app, { icon: 'accessibility', label: 'Check Accessibility', title: 'Check Accessibility', cmd: 'accessibility' }),
    sep(),
    btn(app, { icon: 'translate', label: 'Translate', title: 'Translate', cmd: 'translate', caret: true }),
    sep(),
    btn(app, { icon: 'newComment', label: 'New Comment', title: 'New Comment', cmd: 'insert-comment' }),
    sep(),
    btn(app, { icon: 'history', label: 'Track Changes', title: 'Track Changes', cmd: 'track-changes', caret: true }),
  ];
}

function viewTab(app: App): HTMLElement[] {
  return [
    btn(app, { icon: 'file', label: 'Separate Pages', title: 'Print layout', active: () => true, onClick: () => {} }),
    btn(app, { icon: 'reading', label: 'Reading View', title: 'Reading view', cmd: 'toggle-reading', active: () => app.root.classList.contains('reading') }),
    btn(app, { icon: 'reading', label: 'Immersive Reader', title: 'Immersive Reader', cmd: 'immersive-reader' }),
    sep(),
    menuBtn(app, {
      icon: 'zoomIn',
      label: 'Zoom',
      title: 'Zoom',
      items: () => [
        ...[50, 75, 90, 100, 125, 150, 200].map<MenuItem>((z) => ({ label: `${z}%`, checked: Math.round(app.zoom * 100) === z, run: () => void app.run('zoom-set', z / 100) })),
        { separator: true },
        { label: 'Fit page width', icon: 'fit', run: () => void app.run('zoom-fit') },
      ],
    }),
    btn(app, { icon: 'fit', label: '100%', title: 'Zoom to 100%', cmd: 'zoom-100' }),
    sep(),
    btn(app, { icon: 'ruler', label: 'Ruler', title: 'Ruler', cmd: 'toggle-ruler', active: () => app.ruler.classList.contains('on') }),
    btn(app, { icon: 'nav', label: 'Navigation', title: 'Navigation pane', cmd: 'toggle-nav', active: () => app.navPane.classList.contains('open') }),
    btn(app, { icon: 'header', label: 'Header & Footer', title: 'Header & Footer', cmd: 'header-footer' }),
    sep(),
    btn(app, { icon: app.theme === 'dark' ? 'moon' : 'sun', label: 'Dark Mode', title: 'Dark mode', cmd: 'toggle-dark', active: () => app.theme === 'dark' }),
    menuBtn(app, { icon: 'palette', label: 'App Color', title: 'App color (plugins)', items: () => appColorItems(app) }),
    btn(app, { icon: 'sun', label: 'Switch Background', title: 'Switch page background', cmd: 'toggle-dark-paper', active: () => app.darkPaper }),
  ];
}

function helpTab(app: App): HTMLElement[] {
  return [
    btn(app, { icon: 'keyboard', label: 'Keyboard Shortcuts', title: 'Keyboard shortcuts', cmd: 'shortcuts' }),
    btn(app, { icon: 'info', label: 'About BNC Docs', title: 'About', cmd: 'about' }),
    btn(app, { icon: 'cloud', label: 'Nextcloud', title: 'Nextcloud account', cmd: 'cloud-settings' }),
    btn(app, { icon: 'layers', label: 'Plugins', title: 'Plugins (app colors and icons)', cmd: 'plugins' }),
  ];
}

function tableTab(app: App): HTMLElement[] {
  const ed = app.editor;
  return [
    btn(app, { icon: 'plus', label: 'Row Above', title: 'Insert row above', cmd: 'table-add-row-above' }),
    btn(app, { icon: 'plus', label: 'Row Below', title: 'Insert row below', cmd: 'table-add-row-below' }),
    btn(app, { icon: 'plus', label: 'Column Left', title: 'Insert column left', cmd: 'table-add-col-left' }),
    btn(app, { icon: 'plus', label: 'Column Right', title: 'Insert column right', cmd: 'table-add-col-right' }),
    sep(),
    btn(app, { icon: 'minus', label: 'Delete Row', title: 'Delete row', cmd: 'table-delete-row' }),
    btn(app, { icon: 'minus', label: 'Delete Column', title: 'Delete column', cmd: 'table-delete-col' }),
    btn(app, { icon: 'trash', label: 'Delete Table', title: 'Delete table', cmd: 'table-delete' }),
    sep(),
    btn(app, { icon: 'layers', label: 'Merge Cells', title: 'Merge selected cells', cmd: 'table-merge' }),
    btn(app, { icon: 'columns', label: 'Split Cell', title: 'Split cell', cmd: 'table-split' }),
    btn(app, { icon: 'table', label: 'Header Row', title: 'Toggle header row', cmd: 'table-header-row' }),
    btn(app, { icon: 'square', label: 'Borders', title: 'Toggle borders', cmd: 'table-borders', active: () => ed.getAttributes('table').bordered !== false }),
    colorBtn(app, { icon: 'shading', title: 'Cell shading', cmd: 'shading', initial: '#ffe58f', none: 'No color' }),
    menuBtn(app, {
      icon: 'alignCenter',
      label: 'Table Align',
      title: 'Table alignment',
      items: () => [
        { label: 'Left', run: () => void app.run('table-align', null) },
        { label: 'Center', run: () => void app.run('table-align', 'center') },
        { label: 'Right', run: () => void app.run('table-align', 'right') },
      ],
    }),
    menuBtn(app, {
      icon: 'alignJustify',
      label: 'Vertical',
      title: 'Cell vertical alignment',
      items: () => [
        { label: 'Top', run: () => void app.run('cell-valign', null) },
        { label: 'Center', run: () => void app.run('cell-valign', 'center') },
        { label: 'Bottom', run: () => void app.run('cell-valign', 'bottom') },
      ],
    }),
  ];
}

const BUILDERS: Record<TabId, (app: App) => HTMLElement[]> = {
  home: homeTab,
  insert: insertTab,
  layout: layoutTab,
  references: referencesTab,
  review: reviewTab,
  view: viewTab,
  help: helpTab,
  table: tableTab,
};

// ---------------------------------------------------------------------------
// File menu
// ---------------------------------------------------------------------------
async function fileMenu(app: App, anchor: HTMLElement) {
  const settings = await window.bnc.getSettings().catch(() => ({} as Record<string, any>));
  const recent: string[] = settings.recent ?? [];
  const fmtItems = (fmts: Format[]): MenuItem[] => fmts.map((f) => ({ label: FORMAT_INFO[f].label, run: () => void app.exportAs(f) }));
  const d = app.doc;
  const status = d.dirty ? 'Unsaved changes' : d.cloud ? 'Saved to Nextcloud' : d.local ? `Saved to ${d.local.split(/[\\/]/).slice(-2, -1)[0] ?? 'this device'}` : 'Not saved yet';
  showMenu(anchor, [
    { label: status, header: true },
    { label: 'New', icon: 'new', shortcut: 'Ctrl+N', run: () => void app.run('new') },
    {
      label: 'Open',
      icon: 'open',
      sub: [
        { label: 'This device…', icon: 'open', shortcut: 'Ctrl+O', run: () => void app.run('open') },
        { label: 'Nextcloud…', icon: 'cloudDown', run: () => void app.run('open-cloud') },
        ...(recent.length
          ? [{ separator: true } as MenuItem, { label: 'Recent', header: true } as MenuItem, ...recent.slice(0, 8).map<MenuItem>((p) => ({ label: p.split(/[\\/]/).pop(), run: () => void window.bnc.readFile(p).then((f) => app.openFileGuarded(f)).catch(() => void window.bnc.message({ type: 'error', message: 'That file could not be opened.', detail: p })) }))]
          : []),
      ],
    },
    { separator: true },
    { label: 'Save', icon: 'save', shortcut: 'Ctrl+S', run: () => void app.run('save') },
    {
      label: 'Save a Copy',
      icon: 'files',
      sub: [
        { label: 'This device…', shortcut: 'Ctrl+Shift+S', run: () => void app.run('save-as') },
        { label: 'Nextcloud…', icon: 'cloudUp', run: () => void app.run('save-cloud') },
      ],
    },
    { label: 'AutoSave', icon: 'refresh', checked: app.autosave, run: () => void app.setAutosave(!app.autosave) },
    { separator: true },
    { label: 'Export', icon: 'export', sub: fmtItems(['pdf', 'docx', 'bncdoc', 'html', 'md', 'txt', 'rtf']) },
    { label: 'Print', icon: 'print', shortcut: 'Ctrl+P', run: () => void app.run('print') },
    { separator: true },
    { label: 'Rename', icon: 'rename', run: () => void app.run('rename') },
    { label: 'Nextcloud account', icon: 'cloud', run: () => void app.run('cloud-settings') },
    { label: 'App color', icon: 'palette', sub: appColorItems(app) },
    { label: 'Plugins…', icon: 'layers', run: () => void app.run('plugins') },
    {
      label: 'Info',
      icon: 'info',
      sub: [
        { label: 'Document info…', run: () => void app.run('doc-info') },
        { label: 'Word count…', run: () => void app.run('word-count') },
        ...(d.local ? [{ label: 'Show in folder', run: () => void window.bnc.reveal(d.local!) } as MenuItem] : []),
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Menubar + ribbon
// ---------------------------------------------------------------------------
export function buildMenubar(app: App) {
  const renderRibbon = () => {
    app.clearRefreshers();
    const ribbon = h('div', { class: 'ribbon', attrs: { role: 'toolbar', 'aria-label': 'Ribbon' } }, ...BUILDERS[active](app));
    app.ribbonHost.replaceChildren(ribbon);
    app.refreshUi();
  };

  const renderTabs = () => {
    app.menubar.replaceChildren();
    const inTable = app.editor.isActive('table');
    const tabs = inTable ? [...TABS, { id: 'table' as const, label: 'Table' }] : TABS;
    if (!inTable && active === 'table') active = 'home';
    for (const t of tabs) {
      const b = h('button', { class: `tab${t.id === active ? ' active' : ''}`, text: t.label, attrs: { 'data-tab': t.id } });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        if (t.id === 'file') return void fileMenu(app, b);
        active = t.id as TabId;
        renderTabs();
        renderRibbon();
      });
      app.menubar.append(b);
    }
  };

  let hadTable = false;
  app.editor.on('selectionUpdate', () => {
    const inTable = app.editor.isActive('table');
    if (inTable !== hadTable) {
      const wasActive = active;
      hadTable = inTable;
      if (inTable) active = 'table';
      else if (wasActive === 'table') active = 'home';
      renderTabs();
      renderRibbon();
    }
  });

  renderTabs();
  renderRibbon();
}
