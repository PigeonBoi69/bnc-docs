// The ribbon. Every tab is described once as groups of controls; two renderers turn that description into
// either the Classic ribbon (labelled groups, large buttons) or the Simplified one (a single compact row).
import type { App } from '../app';
import { currentFont, currentFontSize, currentStyleId } from '../commands';
import { MARGIN_PRESETS, PAGE_SIZES, STYLE_BY_ID } from '../core/model';
import { FORMAT_INFO, type Format } from '../core/io';
import { h, iconEl, showMenu, popover, macify, type MenuItem } from './dom';
import type { IconName } from './icons';
import { appColorItems } from './styles';
import { FONT_SIZES, charPicker, colorPicker, combo, loadFonts, tableGridPicker, HIGHLIGHT_COLORS } from './pickers';

// ---------------------------------------------------------------------------
// Control descriptions
// ---------------------------------------------------------------------------
interface BtnItem {
  t: 'btn';
  icon: IconName;
  label?: string;
  title: string;
  cmd?: string;
  arg?: unknown;
  run?: (app: App, el: HTMLElement) => void;
  size?: 'lg' | 'sm';
  menu?: (app: App) => MenuItem[];
  pop?: (app: App, anchor: HTMLElement) => void;
  split?: boolean;
  /** keep the text label in the Simplified ribbon too (for buttons whose icon alone is ambiguous) */
  always?: boolean;
  active?: (app: App) => boolean;
}
interface ColorItem {
  t: 'color';
  icon: IconName;
  title: string;
  label?: string;
  cmd: string;
  none: string;
  initial: string;
  palette?: string[][];
  size?: 'lg' | 'sm';
}
interface CustomItem {
  t: 'custom';
  build: (app: App) => HTMLElement;
}
interface StackItem {
  t: 'stack';
  items: Item[];
}
interface RowsItem {
  t: 'rows';
  rows: Item[][];
}
type Item = BtnItem | ColorItem | CustomItem | StackItem | RowsItem;
interface Group {
  name: string;
  items: Item[];
}

type TabId = 'home' | 'insert' | 'layout' | 'references' | 'review' | 'view' | 'help' | 'table';
interface TabDef {
  id: TabId;
  label: string;
  contextual?: boolean;
  groups: (app: App) => Group[];
}

let active: TabId = 'home';
const overflowData = new WeakMap<HTMLElement, Item>();

const lg = (icon: IconName, label: string, cmd: string | undefined, o: Partial<BtnItem> = {}): BtnItem => ({ t: 'btn', icon, label, title: o.title ?? label, cmd, size: 'lg', ...o });
const sm = (icon: IconName, title: string, cmd: string | undefined, o: Partial<BtnItem> = {}): BtnItem => ({ t: 'btn', icon, title, cmd, size: 'sm', ...o });
const smL = (icon: IconName, label: string, cmd: string | undefined, o: Partial<BtnItem> = {}): BtnItem => ({ t: 'btn', icon, label, title: o.title ?? label, cmd, size: 'sm', ...o });
const color = (icon: IconName, title: string, cmd: string, initial: string, none: string, o: Partial<ColorItem> = {}): ColorItem => ({ t: 'color', icon, title, cmd, initial, none, size: 'sm', ...o });
const custom = (build: (app: App) => HTMLElement): CustomItem => ({ t: 'custom', build });
const stack = (...items: Item[]): StackItem => ({ t: 'stack', items });
const rows = (...r: Item[][]): RowsItem => ({ t: 'rows', rows: r });

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
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

const R = (app: App, id: string, arg?: unknown) => () => void app.run(id, arg);

// ---------------------------------------------------------------------------
// Tabs, described as groups
// ---------------------------------------------------------------------------
function stylesGallery(app: App): HTMLElement {
  const tiles: [string, string, string][] = [
    ['Normal', 'Normal', ''],
    ['NoSpacing', 'No Spacing', ''],
    ['Heading1', 'Heading 1', 'font-size:17px;color:var(--accent-text)'],
  ];
  const wrap = h('span', { class: 'gallery-wrap' });
  const els: [string, HTMLElement][] = [];
  for (const [id, label, style] of tiles) {
    const t = h('button', { class: 'style-tile', title: label, style, text: label });
    keepFocus(t);
    t.addEventListener('click', () => void app.run('style', id));
    els.push([id, t]);
    wrap.append(t);
  }
  app.onRefresh(() => {
    const cur = currentStyleId(app);
    for (const [id, el] of els) el.classList.toggle('active', id === cur);
  });
  wrap.append(
    btnEl(
      app,
      sm('chevron', 'More styles', undefined, {
        run: (_a, el) => {
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
      }),
      false,
    ),
  );
  return wrap;
}

function homeGroups(app: App): Group[] {
  const ed = app.editor;
  const align = (cmd: string, icon: IconName, a: string) =>
    sm(icon, `Align ${a}`, cmd, { active: (ap) => ap.editor.isActive({ textAlign: a }) || (a === 'left' && !['center', 'right', 'justify'].some((x) => ap.editor.isActive({ textAlign: x }))) });

  const fontCombo = custom((ap) => {
    const c = combo({
      width: 112,
      title: 'Font',
      getValue: () => currentFont(ap),
      getItems: loadFonts,
      renderItem: (f) => h('span', { text: f, style: { fontFamily: `'${f}'` } }),
      onCommit: (f) => {
        void ap.run('font-family', f);
        ap.editor.commands.focus();
      },
    });
    ap.onRefresh(c.update);
    return c.el;
  });
  const sizeCombo = custom((ap) => {
    const c = combo({
      width: 34,
      title: 'Font size',
      numeric: true,
      getValue: () => String(currentFontSize(ap)),
      getItems: () => FONT_SIZES.map(String),
      onCommit: (s) => {
        void ap.run('font-size', s);
        ap.editor.commands.focus();
      },
    });
    ap.onRefresh(c.update);
    return c.el;
  });

  const lineSpacing = (ap: App): MenuItem[] => {
    const cur = ap.editor.getAttributes(ap.editor.isActive('heading') ? 'heading' : 'paragraph').lineHeight ?? ap.meta.defaults.lineHeight;
    return [1, 1.15, 1.5, 2, 2.5, 3].map<MenuItem>((v) => ({ label: String(v), checked: Number(cur) === v, run: R(ap, 'line-spacing', v) }));
  };
  const highlightPalette = [HIGHLIGHT_COLORS.slice(0, 10), HIGHLIGHT_COLORS.slice(10).concat(['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']).slice(0, 10)];
  void ed;

  return [
    { name: 'Undo', items: [stack(smL('undo', 'Undo', 'undo', { title: 'Undo (Ctrl+Z)' }), smL('redo', 'Redo', 'redo', { title: 'Redo (Ctrl+Y)' }))] },
    {
      name: 'Clipboard',
      items: [
        lg('paste', 'Paste', 'paste', {
          split: true,
          menu: (ap) => [
            { label: 'Paste', icon: 'paste', run: R(ap, 'paste') },
            { label: 'Cut', icon: 'cut', run: R(ap, 'cut') },
            { label: 'Copy', icon: 'copy', run: R(ap, 'copy') },
          ],
        }),
        stack(smL('cut', 'Cut', 'cut'), smL('copy', 'Copy', 'copy'), smL('formatPainter', 'Format Painter', 'format-painter')),
      ],
    },
    {
      name: 'Font',
      items: [
        rows(
          [
            fontCombo,
            sizeCombo,
            sm('plus', 'Increase font size', 'font-grow'),
            sm('minus', 'Decrease font size', 'font-shrink'),
            sm('clearFormat', 'Clear all formatting', 'clear-format'),
          ],
          [
            sm('bold', 'Bold (Ctrl+B)', 'bold', { active: (ap) => ap.editor.isActive('bold') }),
            sm('italic', 'Italic (Ctrl+I)', 'italic', { active: (ap) => ap.editor.isActive('italic') }),
            sm('underline', 'Underline (Ctrl+U)', 'underline', { active: (ap) => ap.editor.isActive('underline') }),
            sm('more', 'More font options', undefined, {
              menu: (ap) => [
                { label: 'Strikethrough', icon: 'strike', checked: ap.editor.isActive('strike'), run: R(ap, 'strike') },
                { label: 'Subscript', icon: 'subscript', checked: ap.editor.isActive('subscript'), run: R(ap, 'subscript') },
                { label: 'Superscript', icon: 'superscript', checked: ap.editor.isActive('superscript'), run: R(ap, 'superscript') },
                { separator: true },
                { label: 'UPPERCASE', run: R(ap, 'change-case', 'upper') },
                { label: 'lowercase', run: R(ap, 'change-case', 'lower') },
                { label: 'Capitalize Each Word', run: R(ap, 'change-case', 'title') },
              ],
            }),
            color('highlight', 'Text highlight color', 'highlight', '#ffff00', 'No color', { palette: highlightPalette }),
            color('fontColor', 'Font color', 'text-color', '#e53935', 'Automatic'),
          ],
        ),
      ],
    },
    {
      name: 'Paragraph',
      items: [
        rows(
          [
            sm('bullets', 'Bullets (Ctrl+Shift+8)', 'bullets', { active: (ap) => ap.editor.isActive('bulletList') }),
            sm('numbering', 'Numbering (Ctrl+Shift+7)', undefined, {
              active: (ap) => ap.editor.isActive('orderedList'),
              menu: (ap) =>
                ([['1', '1. 2. 3.'], ['a', 'a. b. c.'], ['A', 'A. B. C.'], ['i', 'i. ii. iii.'], ['I', 'I. II. III.']] as const).map<MenuItem>(([ty, label]) => ({
                  label,
                  checked: ap.editor.isActive('orderedList') && ap.editor.getAttributes('orderedList').type === ty,
                  run: R(ap, 'numbering-format', ty),
                })),
            }),
            sm('outdent', 'Decrease indent', 'outdent'),
            sm('indent', 'Increase indent', 'indent'),
            sm('lineSpacing', 'Line spacing', undefined, { menu: lineSpacing }),
          ],
          [
            align('align-left', 'alignLeft', 'left'),
            align('align-center', 'alignCenter', 'center'),
            align('align-right', 'alignRight', 'right'),
            align('align-justify', 'alignJustify', 'justify'),
            color('shading', 'Shading', 'shading', '#ffe58f', 'No color'),
          ],
        ),
      ],
    },
    { name: 'Styles', items: [custom(stylesGallery)] },
    {
      name: 'Editing',
      items: [
        stack(
          smL('search', 'Find', 'find', { title: 'Find (Ctrl+F)' }),
          smL('replace', 'Replace', 'replace', { title: 'Replace (Ctrl+H)' }),
        ),
        lg('mic', 'Dictate', 'dictate'),
        lg('editor', 'Editor', 'editor-pane'),
      ],
    },
  ];
}

function insertGroups(app: App): Group[] {
  return [
    { name: 'Pages', items: [lg('pageBreak', 'Page Break', 'insert-page-break', { title: 'Page Break (Ctrl+Enter)' })] },
    {
      name: 'Tables',
      items: [lg('table', 'Table', undefined, { title: 'Insert Table', pop: (ap, el) => tableGridPicker(el, (r, c) => void ap.run('insert-table', { rows: r, cols: c }), () => void ap.run('insert-table-dialog')) })],
    },
    { name: 'Illustrations', items: [lg('image', 'Picture', 'insert-picture', { title: 'Insert Picture' }), lg('editor', 'Drawing', 'insert-drawing')] },
    {
      name: 'Links',
      items: [lg('link', 'Link', 'insert-link', { title: 'Insert Link (Ctrl+K)' }), lg('bookmark', 'Bookmarks', 'insert-bookmark'), lg('toc', 'Table of Contents', 'insert-toc')],
    },
    { name: 'Comments', items: [lg('newComment', 'New Comment', 'insert-comment')] },
    {
      name: 'Header & Footer',
      items: [
        lg('header', 'Header & Footer', 'header-footer'),
        lg('hash', 'Page Numbers', undefined, {
          menu: (ap) => [
            { label: 'Bottom of page (footer)', run: R(ap, 'insert-page-number', 'footer') },
            { label: 'Top of page (header)', run: R(ap, 'insert-page-number', 'header') },
          ],
        }),
      ],
    },
    {
      name: 'Text & Symbols',
      items: [
        lg('equation', 'Equation', 'insert-equation'),
        lg('symbol', 'Symbol', undefined, { pop: (ap, el) => charPicker(el, 'symbol', (c) => void ap.run('insert-char', c)) }),
        lg('emoji', 'Emoji', undefined, { pop: (ap, el) => charPicker(el, 'emoji', (c) => void ap.run('insert-char', c)) }),
        lg('rule', 'Line', 'insert-hr', { title: 'Horizontal line' }),
        lg('history', 'Date', 'insert-date', { title: 'Date and time' }),
      ],
    },
  ];
}

function layoutGroups(app: App): Group[] {
  const para = (ap: App) => ap.editor.getAttributes(ap.editor.isActive('heading') ? 'heading' : 'paragraph');
  return [
    {
      name: 'Page Setup',
      items: [
        lg('margins', 'Margins', undefined, {
          menu: (ap) => [
            ...Object.entries(MARGIN_PRESETS).map<MenuItem>(([k, m]) => ({ label: `${m.label}  (${(m.t / 72).toFixed(2)}" / ${(m.l / 72).toFixed(2)}")`, run: R(ap, 'page-margins', k) })),
            { separator: true },
            { label: 'Custom margins…', run: R(ap, 'page-setup') },
          ],
        }),
        lg('orientation', 'Orientation', undefined, {
          menu: (ap) => [
            { label: 'Portrait', checked: ap.meta.page.orientation === 'portrait', run: R(ap, 'page-orientation', 'portrait') },
            { label: 'Landscape', checked: ap.meta.page.orientation === 'landscape', run: R(ap, 'page-orientation', 'landscape') },
          ],
        }),
        lg('size', 'Size', undefined, {
          title: 'Paper size',
          menu: (ap) => [
            ...Object.entries(PAGE_SIZES).map<MenuItem>(([k, s]) => ({
              label: s.label,
              checked: Math.abs(Math.min(ap.meta.page.width, ap.meta.page.height) - s.w) < 1 && Math.abs(Math.max(ap.meta.page.width, ap.meta.page.height) - s.h) < 1,
              run: R(ap, 'page-size', k),
            })),
            { separator: true },
            { label: 'More paper sizes…', run: R(ap, 'page-setup') },
          ],
        }),
        lg('columns', 'Columns', 'columns'),
        stack(
          smL('pageBreak', 'Breaks', undefined, { menu: (ap) => [{ label: 'Page break', icon: 'pageBreak', shortcut: 'Ctrl+Enter', run: R(ap, 'insert-page-break') }] }),
          smL('hash', 'Line Numbers', 'line-numbers', { title: 'Line numbers' }),
          smL('file', 'Page Setup', 'page-setup'),
        ),
      ],
    },
    {
      name: 'Paragraph',
      items: [
        rows(
          [
            custom((ap) => spin(ap, { label: 'Indent Left', icon: 'indent', title: 'Indent left (inches)', unit: '"', step: 0.1, get: () => (para(ap).indentLeft ?? 0) / 72, set: (v) => void ap.run('indent-left', v * 72) })),
            custom((ap) => spin(ap, { label: 'Spacing Before', icon: 'spacing', title: 'Spacing before (pt)', unit: 'pt', step: 1, get: () => para(ap).spaceBefore ?? ap.meta.defaults.spaceBefore, set: (v) => void ap.run('space-before', v) })),
          ],
          [
            custom((ap) => spin(ap, { label: 'Indent Right', icon: 'outdent', title: 'Indent right (inches)', unit: '"', step: 0.1, get: () => (para(ap).indentRight ?? 0) / 72, set: (v) => void ap.run('indent-right', v * 72) })),
            custom((ap) => spin(ap, { label: 'Spacing After', icon: 'spacing', title: 'Spacing after (pt)', unit: 'pt', step: 1, get: () => para(ap).spaceAfter ?? ap.meta.defaults.spaceAfter, set: (v) => void ap.run('space-after', v) })),
          ],
        ),
      ],
    },
    {
      name: 'Page Background',
      items: [lg('square', 'Page Borders', 'page-borders', { title: 'Page borders' }), color('palette', 'Page Color', 'page-color', '#ffffff', 'No color', { size: 'lg', label: 'Page Color' })],
    },
  ];
}

function referencesGroups(): Group[] {
  return [
    { name: 'Table of Contents', items: [lg('toc', 'Table of Contents', 'insert-toc')] },
    { name: 'Footnotes', items: [lg('bookmarked', 'Insert Footnote', 'footnote'), lg('file', 'Insert Endnote', 'endnote')] },
    { name: 'Citations', items: [lg('quote', 'Citations', 'citations')] },
  ];
}

function reviewGroups(): Group[] {
  return [
    {
      name: 'Proofing',
      items: [
        lg('editor', 'Editor', 'proof-pane', { title: 'Spelling & punctuation pane (F7)', active: (ap) => ap.proof.pane.isOpen }),
        lg('spelling', 'Spelling', 'toggle-spelling', { title: 'Check spelling as you type', active: (ap) => ap.proof.spelling }),
        lg('quote', 'Punctuation', 'toggle-punctuation', { title: 'Check punctuation as you type', active: (ap) => ap.proof.punctuation }),
        lg('replace', 'AutoCorrect', 'toggle-autocorrect', { title: 'AutoCorrect common typos', active: (ap) => ap.proof.autocorrect }),
        lg('hash', 'Word Count', 'word-count'),
        lg('accessibility', 'Check Accessibility', 'accessibility'),
      ],
    },
    {
      name: 'Language',
      items: [lg('type', 'Language', undefined, { title: 'Proofing language and custom dictionary', menu: (ap) => ap.proof.languageItems() }), lg('translate', 'Translate', 'translate')],
    },
    { name: 'Comments', items: [lg('newComment', 'New Comment', 'insert-comment')] },
    { name: 'Tracking', items: [lg('history', 'Track Changes', 'track-changes')] },
  ];
}

function viewGroups(): Group[] {
  return [
    {
      name: 'Views',
      items: [
        lg('file', 'Separate Pages', undefined, { title: 'Print layout', active: () => true, run: () => {} }),
        lg('reading', 'Reading View', 'toggle-reading', { title: 'Reading view', active: (ap) => ap.root.classList.contains('reading') }),
        lg('reading', 'Immersive Reader', 'immersive-reader'),
      ],
    },
    {
      name: 'Zoom',
      items: [
        lg('zoomIn', 'Zoom', undefined, {
          menu: (ap) => [
            ...[50, 75, 90, 100, 125, 150, 200].map<MenuItem>((z) => ({ label: `${z}%`, checked: Math.round(ap.zoom * 100) === z, run: R(ap, 'zoom-set', z / 100) })),
            { separator: true },
            { label: 'Fit page width', icon: 'fit', run: R(ap, 'zoom-fit') },
          ],
        }),
        lg('fit', '100%', 'zoom-100', { title: 'Zoom to 100%' }),
      ],
    },
    {
      name: 'Show',
      items: [
        lg('ruler', 'Ruler', 'toggle-ruler', { active: (ap) => ap.ruler.classList.contains('on') }),
        lg('nav', 'Navigation', 'toggle-nav', { title: 'Navigation pane', active: (ap) => ap.navPane.classList.contains('open') }),
        lg('header', 'Header & Footer', 'header-footer'),
      ],
    },
    {
      name: 'Appearance',
      items: [
        lg('moon', 'Dark Mode', 'toggle-dark', { title: 'Dark mode', active: (ap) => ap.theme === 'dark' }),
        lg('palette', 'App Color', undefined, { title: 'App color (plugins)', menu: (ap) => appColorItems(ap) }),
        lg('sun', 'Switch Background', 'toggle-dark-paper', { title: 'Switch page background', active: (ap) => ap.darkPaper }),
        lg('panel', 'Ribbon Style', undefined, { menu: (ap) => ribbonStyleItems(ap) }),
      ],
    },
  ];
}

function helpGroups(): Group[] {
  return [
    { name: 'Help', items: [lg('keyboard', 'Keyboard Shortcuts', 'shortcuts'), lg('info', 'About BNC Docs', 'about', { title: 'About' })] },
    { name: 'Account & Plugins', items: [lg('cloud', 'Nextcloud', 'cloud-settings', { title: 'Nextcloud account' }), lg('layers', 'Plugins', 'plugins', { title: 'Plugins (app colors and icons)' })] },
  ];
}

function tableGroups(): Group[] {
  return [
    {
      name: 'Rows & Columns',
      items: [
        rows(
          [smL('plus', 'Row Above', 'table-add-row-above', { title: 'Insert row above', always: true }), smL('plus', 'Row Below', 'table-add-row-below', { title: 'Insert row below', always: true })],
          [smL('plus', 'Column Left', 'table-add-col-left', { title: 'Insert column left', always: true }), smL('plus', 'Column Right', 'table-add-col-right', { title: 'Insert column right', always: true })],
        ),
        stack(smL('minus', 'Delete Row', 'table-delete-row', { always: true }), smL('minus', 'Delete Column', 'table-delete-col', { always: true }), smL('trash', 'Delete Table', 'table-delete', { always: true })),
      ],
    },
    {
      name: 'Merge',
      items: [lg('layers', 'Merge Cells', 'table-merge', { title: 'Merge selected cells' }), lg('columns', 'Split Cell', 'table-split'), lg('table', 'Header Row', 'table-header-row', { title: 'Toggle header row' })],
    },
    {
      name: 'Table Style',
      items: [
        lg('square', 'Borders', 'table-borders', { title: 'Toggle borders', active: (ap) => ap.editor.getAttributes('table').bordered !== false }),
        color('shading', 'Cell shading', 'shading', '#ffe58f', 'No color', { size: 'lg', label: 'Shading' }),
      ],
    },
    {
      name: 'Alignment',
      items: [
        lg('alignCenter', 'Table Align', undefined, {
          title: 'Table alignment',
          menu: (ap) => [
            { label: 'Left', run: R(ap, 'table-align', null) },
            { label: 'Center', run: R(ap, 'table-align', 'center') },
            { label: 'Right', run: R(ap, 'table-align', 'right') },
          ],
        }),
        lg('alignJustify', 'Vertical', undefined, {
          title: 'Cell vertical alignment',
          menu: (ap) => [
            { label: 'Top', run: R(ap, 'cell-valign', null) },
            { label: 'Center', run: R(ap, 'cell-valign', 'center') },
            { label: 'Bottom', run: R(ap, 'cell-valign', 'bottom') },
          ],
        }),
      ],
    },
  ];
}

const TABS: TabDef[] = [
  { id: 'home', label: 'Home', groups: homeGroups },
  { id: 'insert', label: 'Insert', groups: insertGroups },
  { id: 'layout', label: 'Layout', groups: layoutGroups },
  { id: 'references', label: 'References', groups: referencesGroups },
  { id: 'review', label: 'Review', groups: reviewGroups },
  { id: 'view', label: 'View', groups: viewGroups },
  { id: 'help', label: 'Help', groups: helpGroups },
  { id: 'table', label: 'Table', contextual: true, groups: tableGroups },
];

const ribbonStyleItems = (app: App): MenuItem[] => [
  { label: 'Classic Ribbon', checked: app.ribbonMode === 'classic', run: () => void app.setRibbonMode('classic') },
  { label: 'Simplified Ribbon', checked: app.ribbonMode === 'simplified', run: () => void app.setRibbonMode('simplified') },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function keepFocus(el: HTMLElement) {
  el.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor focus/selection
}

function btnEl(app: App, it: BtnItem, simple: boolean): HTMLElement {
  const big = it.size === 'lg' && !simple;
  const showLabel = !!it.label && (simple ? it.size === 'lg' || !it.icon || !!it.always : true);
  const hasMenu = !!(it.menu || it.pop);
  const content = (): (Node | null)[] => [iconEl(it.icon, big ? 24 : simple ? 18 : 16), showLabel ? h('span', { class: 'lbl', text: it.label }) : null, hasMenu && !it.split ? h('span', { class: 'caret' }, iconEl('chevron', 12)) : null];
  const open = (el: HTMLElement) => (it.pop ? it.pop(app, el) : it.menu ? showMenu(el, () => it.menu!(app)) : undefined);
  const title = macify(it.title);
  const main = h('button', { class: `rb${big ? ' lg' : ' sm'}${it.split ? ' grp-l' : ''}`, title, attrs: { 'aria-label': it.title } }, ...content());
  keepFocus(main);
  main.addEventListener('click', () => {
    if (it.run) it.run(app, main);
    else if (it.cmd) void app.run(it.cmd, it.arg);
    else open(main);
  });
  if (it.active) {
    const upd = () => main.classList.toggle('active', !!it.active!(app));
    app.onRefresh(upd);
    upd();
  }
  if (!it.split) return main;
  const caret = h('button', { class: `rb caret-btn${big ? ' lg-caret' : ''}`, title: `${it.title} options`, attrs: { 'aria-label': `${it.title} options` } }, iconEl('chevron', 12));
  keepFocus(caret);
  caret.addEventListener('click', () => open(caret));
  return h('span', { class: `split${big ? ' lgs' : ''}` }, main, caret);
}

function colorEl(app: App, it: ColorItem, simple: boolean): HTMLElement {
  let last = it.initial;
  const big = it.size === 'lg' && !simple;
  const swatch = h('span', { class: 'swatch', style: { background: last } });
  const showLabel = !!it.label && !simple;
  const main = h('button', { class: `rb ${big ? 'lg' : 'sm'} grp-l colorbtn`, title: it.title, attrs: { 'aria-label': it.title } }, iconEl(it.icon, big ? 24 : 16), swatch, showLabel ? h('span', { class: 'lbl', text: it.label }) : null);
  const caret = h('button', { class: `rb caret-btn${big ? ' lg-caret' : ''}`, title: `${it.title} options`, attrs: { 'aria-label': `${it.title} options` } }, iconEl('chevron', 12));
  keepFocus(main);
  keepFocus(caret);
  const apply = (c: string | null) => {
    if (c) {
      last = c;
      swatch.style.background = c;
    }
    void app.run(it.cmd, c);
  };
  main.addEventListener('click', () => apply(last));
  caret.addEventListener('click', () => colorPicker(caret, { title: it.title, noneLabel: it.none, onPick: apply, palette: it.palette }));
  return h('span', { class: `split${big ? ' lgs' : ''}` }, main, caret);
}

function itemEl(app: App, it: Item, simple: boolean): HTMLElement | null {
  switch (it.t) {
    case 'btn': {
      const el = btnEl(app, it, simple);
      overflowData.set(el, it);
      return el;
    }
    case 'color': {
      const el = colorEl(app, it, simple);
      overflowData.set(el, it);
      return el;
    }
    case 'custom':
      return it.build(app);
    case 'stack': {
      const els = it.items.map((i) => itemEl(app, i, simple)).filter(Boolean) as HTMLElement[];
      const box = h('div', { class: simple ? 'rinline' : 'rstack' }, ...els);
      overflowData.set(box, it);
      return box;
    }
    case 'rows': {
      const rowEls = it.rows.map((r) => h('div', { class: 'rrow' }, ...(r.map((i) => itemEl(app, i, simple)).filter(Boolean) as HTMLElement[])));
      const box = h('div', { class: simple ? 'rinline' : 'rrows' }, ...(simple ? rowEls.flatMap((r) => [...r.children] as HTMLElement[]) : rowEls));
      overflowData.set(box, it);
      return box;
    }
  }
}

function toMenu(app: App, it: Item): MenuItem[] {
  if (it.t === 'btn') {
    const label = it.label ?? it.title;
    if (it.menu) return [{ label, icon: it.icon, sub: it.menu(app) }];
    if (it.cmd) return [{ label, icon: it.icon, checked: it.active?.(app), run: () => void app.run(it.cmd!, it.arg) }];
    if (it.run) return [{ label, icon: it.icon, run: () => it.run!(app, document.body) }];
    return [];
  }
  if (it.t === 'color') return [{ label: it.label ?? it.title, icon: it.icon, run: () => void app.run(it.cmd, it.initial) }];
  if (it.t === 'stack') return it.items.flatMap((i) => toMenu(app, i));
  if (it.t === 'rows') return it.rows.flat().flatMap((i) => toMenu(app, i));
  return [];
}

function firstIcon(items: Item[]): IconName {
  for (const it of items) {
    if (it.t === 'btn' || it.t === 'color') return it.icon;
    if (it.t === 'stack') return firstIcon(it.items);
    if (it.t === 'rows') return firstIcon(it.rows.flat());
  }
  return 'more';
}

function renderClassic(app: App, groups: Group[]): HTMLElement {
  const bar = h('div', { class: 'ribbon classic', attrs: { role: 'toolbar', 'aria-label': 'Ribbon' } });
  const entries = groups.map((g) => {
    const items = g.items.map((it) => itemEl(app, it, false)).filter(Boolean) as HTMLElement[];
    const normal = h('div', { class: 'rgroup' }, h('div', { class: 'rgroup-items' }, ...items), h('div', { class: 'rgroup-name', text: g.name }));
    const btn = h('button', { class: 'rb lg', title: g.name }, iconEl(firstIcon(g.items), 24), h('span', { class: 'lbl', text: g.name }), h('span', { class: 'caret' }, iconEl('chevron', 12)));
    keepFocus(btn);
    btn.addEventListener('click', () => {
      const body = h('div', { class: 'rgroup-pop' }, ...(g.items.map((it) => itemEl(app, it, false)).filter(Boolean) as HTMLElement[]));
      popover(btn, body);
      app.refreshUi();
    });
    const folded = h('div', { class: 'rgroup collapsed', style: { display: 'none' } }, h('div', { class: 'rgroup-items' }, btn), h('div', { class: 'rgroup-name', text: g.name }));
    bar.append(normal, folded);
    return { normal, folded };
  });
  // groups that do not fit collapse (last first) into a single button that opens the group as a popup
  const layout = () => {
    entries.forEach((e) => {
      e.normal.style.display = '';
      e.folded.style.display = 'none';
    });
    for (let i = entries.length - 1; i >= 0 && bar.scrollWidth > bar.clientWidth + 1; i--) {
      entries[i].normal.style.display = 'none';
      entries[i].folded.style.display = '';
    }
  };
  requestAnimationFrame(layout);
  new ResizeObserver(layout).observe(bar);
  return bar;
}

function renderSimple(app: App, groups: Group[]): HTMLElement {
  const bar = h('div', { class: 'ribbon simple', attrs: { role: 'toolbar', 'aria-label': 'Ribbon' } });
  const flow = h('div', { class: 'rflow' });
  const entries: { el: HTMLElement; it: Item }[] = [];
  groups.forEach((g, gi) => {
    if (gi > 0) flow.append(h('div', { class: 'rsep' }));
    for (const it of g.items) {
      const el = itemEl(app, it, true);
      if (!el) continue;
      flow.append(el);
      entries.push({ el, it });
    }
  });
  const more = h('button', { class: 'rb more-btn', title: 'More', style: { display: 'none' } }, iconEl('more', 18));
  keepFocus(more);
  bar.append(flow, more);
  const tidySeparators = () => {
    const kids = [...flow.children] as HTMLElement[];
    let prevIsSep = true;
    for (const k of kids) {
      if (k.classList.contains('rsep')) {
        k.style.display = prevIsSep ? 'none' : '';
        if (!prevIsSep) prevIsSep = true;
      } else if (k.style.display !== 'none') prevIsSep = false;
    }
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      if (k.classList.contains('rsep')) k.style.display = 'none';
      else if (k.style.display !== 'none') break;
    }
  };
  // what does not fit in the row moves into the "…" menu
  const layout = () => {
    entries.forEach((e) => (e.el.style.display = ''));
    flow.querySelectorAll<HTMLElement>('.rsep').forEach((s) => (s.style.display = ''));
    more.style.display = 'none';
    const limit = bar.clientWidth - 8;
    if (flow.scrollWidth <= limit) return;
    more.style.display = '';
    const budget = limit - 44;
    const hidden: Item[] = [];
    let used = 0;
    for (const e of entries) {
      const w = e.el.getBoundingClientRect().width + 2;
      used += w;
      if (used > budget) {
        e.el.style.display = 'none';
        hidden.push(e.it);
      }
    }
    tidySeparators();
    more.onclick = () => showMenu(more, () => hidden.flatMap((i) => toMenu(app, i)), { align: 'right' });
  };
  requestAnimationFrame(layout);
  new ResizeObserver(layout).observe(bar);
  return bar;
}

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
    { label: 'Ribbon style', icon: 'panel', sub: ribbonStyleItems(app) },
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
  const renderBody = () => {
    app.clearRefreshers();
    const tab = TABS.find((t) => t.id === active) ?? TABS[0];
    const groups = tab.groups(app);
    const bar = app.ribbonMode === 'simplified' ? renderSimple(app, groups) : renderClassic(app, groups);
    app.ribbonHost.replaceChildren(bar);
    app.ribbonHost.classList.toggle('collapsed', app.ribbonCollapsed);
    app.refreshUi();
  };

  const renderTabs = () => {
    app.menubar.replaceChildren();
    const inTable = app.editor.isActive('table');
    const visible = TABS.filter((t) => !t.contextual || inTable);
    if (!visible.some((t) => t.id === active)) active = 'home';
    const mk = (id: string, label: string, ctxual: boolean) => {
      const b = h('button', { class: `tab${id === active ? ' active' : ''}${ctxual ? ' ctx' : ''}`, text: label, attrs: { 'data-tab': id } });
      keepFocus(b);
      b.addEventListener('click', () => {
        if (id === 'file') return void fileMenu(app, b);
        if (app.ribbonCollapsed) app.ribbonCollapsed = false;
        active = id as TabId;
        renderTabs();
        renderBody();
      });
      app.menubar.append(b);
    };
    mk('file', 'File', false);
    visible.forEach((t) => mk(t.id, t.label, !!t.contextual));
    const toggle = h('button', { class: 'ribbon-toggle', title: 'Ribbon options' }, iconEl(app.ribbonCollapsed ? 'chevron' : 'up', 14));
    keepFocus(toggle);
    toggle.addEventListener('click', () => {
      showMenu(
        toggle,
        [
          ...ribbonStyleItems(app),
          { separator: true },
          {
            label: app.ribbonCollapsed ? 'Always show ribbon' : 'Hide ribbon',
            run: () => {
              app.ribbonCollapsed = !app.ribbonCollapsed;
              renderTabs();
              renderBody();
            },
          },
        ],
        { align: 'right' },
      );
    });
    app.menubar.append(h('div', { class: 'grow' }), toggle);
  };

  // the contextual Table tab appears (and is selected) while the cursor is in a table
  let hadTable = false;
  app.editor.on('selectionUpdate', () => {
    const inTable = app.editor.isActive('table');
    if (inTable !== hadTable) {
      const wasActive = active;
      hadTable = inTable;
      if (inTable && !app.ribbonCollapsed) active = 'table';
      else if (wasActive === 'table') active = 'home';
      renderTabs();
      renderBody();
    }
  });

  app.rebuildRibbon = () => {
    renderTabs();
    renderBody();
  };
  renderTabs();
  renderBody();
}
