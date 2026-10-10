import { Editor, createDocument } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import docCss from './styles/document.css?inline';
import { buildExtensions } from './editor/extensions';
import type { PageLayout, PaginationInfo } from './editor/paginate';
import { DocMeta, JSONNode, cloneMeta, defaultMeta, emptyDoc, FONT_FALLBACK, namedStylesCss, normalizeMeta } from './core/model';
import { Decoded, FORMAT_INFO, Format, baseName, decodeFile, encodeFile, formatFromName } from './core/io';
import { buildDocumentHtml, pdfTemplate } from './core/print';
import { debounce, h, iconEl, macify, showMenu, toast, prompt } from './ui/dom';
import { registerCommands, type Command } from './commands';
import { buildMenubar } from './ui/ribbon';
import { aboutDialog, headerFooterDialog } from './ui/dialogs';
import { cloudPicker, nextcloudDialog } from './ui/cloud';
import type { AppStyle, DocFile, StyleState } from './types/bnc';
import { applyStyleToDom, installStyleBytes, refreshStyles } from './ui/styles';

export interface DocState {
  name: string;
  format: Format;
  local?: string;
  cloud?: { path: string; etag?: string };
  dirty: boolean;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
const PT = 96 / 72;

export class App {
  editor!: Editor;
  meta: DocMeta = defaultMeta();
  doc: DocState = { name: 'Document', format: 'bncdoc', dirty: false };
  cmds = new Map<string, Command>();

  zoom = 1;
  theme: 'dark' | 'light' = 'dark';
  autosave = false;
  editable = true;
  darkPaper = false;
  painter: any[] | null = null;
  version = '0.1.0';
  ncUser: string | null = null;
  styleState: StyleState = { styles: [], broken: [], active: null, dir: '' };
  activeStyle: AppStyle | null = null;
  pagination: PaginationInfo = { pageCount: 1, breaks: [] };

  // DOM refs
  root!: HTMLElement;
  paperWrap!: HTMLElement;
  desk!: HTMLElement;
  ruler!: HTMLElement;
  ribbonHost!: HTMLElement;
  menubar!: HTMLElement;
  navPane!: HTMLElement;
  findBar!: HTMLElement;
  titleName!: HTMLElement;
  saveState!: HTMLElement;
  autosaveBtn!: HTMLButtonElement;
  status!: { page: HTMLElement; words: HTMLElement; zoomRange: HTMLInputElement; zoomLabel: HTMLElement; cloud: HTMLElement };

  private refreshers: (() => void)[] = [];
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  // -------------------------------------------------------------------------
  // Startup
  // -------------------------------------------------------------------------
  async init() {
    const info = await window.bnc.ready();
    this.version = info.version;
    // lets the stylesheet adapt the title bar (macOS has its traffic lights on the left, not window buttons on the right)
    document.documentElement.classList.add(`platform-${info.platform}`);
    const settings = await window.bnc.getSettings();
    this.theme = settings.theme === 'light' ? 'light' : 'dark';
    this.autosave = !!settings.autosave;
    this.applyTheme();

    document.head.append(h('style', { attrs: { id: 'doc-css' }, text: `${docCss}\n${namedStylesCss()}` }));
    this.buildShell();
    await refreshStyles(this).catch((e) => console.warn('Could not load app styles', e));
    this.createEditor();
    registerCommands(this);
    buildMenubar(this);
    this.applyLayoutVars();
    this.bindGlobalEvents();
    this.setZoom(1);
    this.refreshCloudState();

    if (info.files.length) await this.loadFile(info.files[0]);
    else this.newDocument(true);

    window.bnc.onOpenFile((f) => void this.openFileGuarded(f));
    window.bnc.onCloseRequest(async () => {
      if (!this.doc.dirty || (await this.confirmDiscard())) window.bnc.closeConfirmed();
      else window.bnc.closeCancelled?.();
    });
    // macOS menu bar items that must go through the editor (its own undo history), or into a text box if one has focus
    window.bnc.onMenuCommand?.((id) => {
      const el = document.activeElement;
      if ((id === 'undo' || id === 'redo') && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) document.execCommand(id);
      else void this.run(id);
    });
    this.refreshUi();
    setTimeout(() => this.editor.commands.focus('start'), 50);
  }

  /** Register a function that re-syncs a ribbon control with the editor state. */
  onRefresh(fn: () => void) {
    this.refreshers.push(fn);
  }
  clearRefreshers() {
    this.refreshers = [];
  }

  refreshUi = debounce(() => {
    for (const fn of this.refreshers) fn();
    this.updateStatus();
  }, 30);

  // -------------------------------------------------------------------------
  // Shell
  // -------------------------------------------------------------------------
  private buildShell() {
    const logo = h('img', { class: 'app-logo', attrs: { src: './icon.png', alt: 'BNC Docs' } });
    this.titleName = h('span', { class: 'name', title: 'Click to rename', text: this.doc.name, on: { click: () => void this.rename() } });
    this.saveState = h('span', { class: 'save-state' });
    this.autosaveBtn = h('button', { class: 'autosave', on: { click: () => this.toggleAutosave() } });
    const search = this.buildSearch();

    const titlebar = h(
      'header',
      { class: 'titlebar' },
      logo,
      h('div', { class: 'doc-title' }, this.titleName, this.saveState, this.autosaveBtn),
      search,
      h('div', { class: 'spacer' }),
      h('button', { class: 'chip-btn', title: 'Editing mode', on: { click: (e) => this.editModeMenu(e.currentTarget) } }, iconEl('editor', 15), h('span', { text: 'Editing' }), iconEl('chevron', 14)),
      h('button', { class: 'chip-btn primary', title: 'Nextcloud', on: { click: (e) => this.cloudMenu(e.currentTarget) } }, iconEl('cloud', 15), h('span', { text: 'Nextcloud' })),
    );

    this.menubar = h('nav', { class: 'menubar' });
    this.ribbonHost = h('div', { class: 'ribbon-wrap' });

    this.navPane = h('aside', { class: 'navpane' });
    this.ruler = h('div', { class: 'ruler' });
    this.paperWrap = h('div', { class: 'paper-wrap' });
    this.desk = h('div', { class: 'desk' }, this.paperWrap);
    this.findBar = h('div', { class: 'findbar' });
    const deskWrap = h('div', { class: 'desk-wrap' }, this.ruler, this.desk);
    const workspace = h('div', { class: 'workspace' }, this.navPane, deskWrap, this.findBar);

    const zoomRange = h('input', { attrs: { type: 'range', min: '25', max: '300', step: '5', value: '100', 'aria-label': 'Zoom' } });
    zoomRange.addEventListener('input', () => this.setZoom(Number(zoomRange.value) / 100));
    const zoomLabel = h('span', { class: 'stat', text: '100%' });
    const pageStat = h('span', { class: 'stat', text: 'Page 1 of 1' });
    const wordStat = h('span', { class: 'stat', text: '0 words' });
    const cloudStat = h('span', { class: 'stat' });
    pageStat.style.cursor = 'pointer';
    pageStat.addEventListener('click', () => this.run('toggle-nav'));
    wordStat.style.cursor = 'pointer';
    wordStat.addEventListener('click', () => this.run('word-count'));
    const statusbar = h(
      'footer',
      { class: 'statusbar' },
      pageStat,
      wordStat,
      h('span', { class: 'stat', text: 'English (U.S.)' }),
      cloudStat,
      h('div', { class: 'grow' }),
      h('button', { title: 'Reading view', on: { click: () => this.run('toggle-reading') } }, iconEl('reading', 14)),
      h(
        'div',
        { class: 'zoom-ctl' },
        h('button', { title: 'Zoom out', on: { click: () => this.setZoom(this.zoom - 0.1) } }, iconEl('minus', 14)),
        zoomRange,
        h('button', { title: 'Zoom in', on: { click: () => this.setZoom(this.zoom + 0.1) } }, iconEl('plus', 14)),
        zoomLabel,
        h('button', { title: 'Fit page width', on: { click: () => this.fitWidth() } }, iconEl('fit', 14), 'Fit'),
      ),
    );
    this.status = { page: pageStat, words: wordStat, zoomRange, zoomLabel, cloud: cloudStat };

    const dropHint = h('div', { class: 'drop-hint', attrs: { id: 'drop-hint' }, text: 'Drop a file to open it or an image to insert it' });
    this.root.append(titlebar, this.menubar, this.ribbonHost, workspace, statusbar, dropHint);
  }

  private buildSearch(): HTMLElement {
    const input = h('input', { attrs: { type: 'text', placeholder: 'Search for tools, help, and more (Alt + Q)', id: 'cmd-search' } });
    const results = h('div', { class: 'search-results', style: { display: 'none' } });
    let sel = 0;
    let shown: Command[] = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      results.replaceChildren();
      if (!q) {
        results.style.display = 'none';
        return;
      }
      shown = [...this.cmds.values()].filter((c) => !c.hidden && `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 12);
      sel = 0;
      if (!shown.length) shown = [];
      shown.forEach((c, i) => {
        const row = h('div', { class: `search-result${i === 0 ? ' sel' : ''}` }, h('span', { text: c.label }), h('small', { text: macify(c.shortcut ?? c.section ?? '') }));
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(c);
        });
        results.append(row);
      });
      if (!shown.length) results.append(h('div', { class: 'search-result' }, h('span', { class: 'muted', text: 'No matching commands' })));
      results.style.display = 'block';
    };
    const choose = (c: Command) => {
      input.value = '';
      results.style.display = 'none';
      input.blur();
      void this.run(c.id);
    };
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(() => (results.style.display = 'none'), 120));
    input.addEventListener('focus', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(0, Math.min(shown.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        [...results.children].forEach((r, i) => r.classList.toggle('sel', i === sel));
      } else if (e.key === 'Enter' && shown[sel]) {
        e.preventDefault();
        choose(shown[sel]);
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
        this.editor.commands.focus();
      }
    });
    return h('div', { class: 'search-box' }, iconEl('search', 15), input, results);
  }

  // -------------------------------------------------------------------------
  // Editor
  // -------------------------------------------------------------------------
  getLayout = (): PageLayout => {
    const p = this.meta.page;
    return {
      widthPt: p.width,
      heightPt: p.height,
      marginTop: p.marginTop,
      marginBottom: p.marginBottom,
      marginLeft: p.marginLeft,
      marginRight: p.marginRight,
      header: this.meta.header,
      footer: this.meta.footer,
      zoom: this.zoom,
    };
  };

  private createEditor() {
    this.editor = new Editor({
      element: this.paperWrap,
      extensions: buildExtensions({
        getLayout: this.getLayout,
        onChange: (info) => {
          this.pagination = info;
          this.updateStatus();
        },
      }),
      content: emptyDoc(),
      editorProps: {
        attributes: { class: 'doc', spellcheck: 'true', 'aria-label': 'Document' },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          files.forEach((f) => void this.insertImageFile(f));
          return true;
        },
        handleClick: (_view, _pos, event) => {
          const a = (event.target as HTMLElement).closest('a');
          if (a && (event.ctrlKey || event.metaKey)) {
            const href = a.getAttribute('href') ?? '';
            if (/^(https?|mailto):/i.test(href)) void window.bnc.openExternal(href);
            return true;
          }
          return false;
        },
      },
      onUpdate: () => {
        this.markDirty();
        this.refreshUi();
        this.refreshNav();
      },
      onSelectionUpdate: () => {
        this.refreshUi();
        this.applyPainter();
      },
      onTransaction: () => this.refreshUi(),
    });
    this.editor.view.dom.addEventListener('dblclick', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.pgw-head')) headerFooterDialog(this, 'header');
      else if (t.closest('.pgw-foot')) headerFooterDialog(this, 'footer');
    });
    this.paperWrap.addEventListener('dblclick', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.pgw-head')) headerFooterDialog(this, 'header');
      else if (t.closest('.pgw-foot')) headerFooterDialog(this, 'footer');
    });
  }

  /** Replace the document content and reset undo history. */
  private setContent(content: JSONNode | string) {
    const view = this.editor.view;
    const doc = createDocument(content as any, this.editor.schema);
    view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
    this.editor.storage.pagination?.run();
    this.refreshNav();
    this.refreshUi();
  }

  applyLayoutVars() {
    const p = this.meta.page;
    const d = this.meta.defaults;
    const s = this.paperWrap.style;
    s.setProperty('--page-w', `${p.width}pt`);
    s.setProperty('--ml', `${p.marginLeft}pt`);
    s.setProperty('--mr', `${p.marginRight}pt`);
    s.setProperty('--doc-font', `'${d.fontFamily}', ${FONT_FALLBACK}`);
    s.setProperty('--doc-size', `${d.fontSize}pt`);
    s.setProperty('--doc-color', d.color ? `#${d.color.replace('#', '')}` : '#000');
    s.setProperty('--doc-space-before', `${d.spaceBefore}pt`);
    s.setProperty('--doc-space-after', `${d.spaceAfter}pt`);
    s.setProperty('--doc-line', String(d.lineHeight));
    s.setProperty('--page-bg', this.darkPaper ? '#2b2b30' : p.color ?? '#ffffff');
    this.paperWrap.classList.toggle('dark-paper', this.darkPaper);
    this.renderRuler();
  }

  applyMeta(patch: Partial<DocMeta>) {
    this.meta = { ...this.meta, ...patch };
    this.applyLayoutVars();
    this.editor.storage.pagination?.run();
    this.markDirty();
    this.refreshUi();
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------
  async run(id: string, arg?: any) {
    const c = this.cmds.get(id);
    if (!c) return console.warn('Unknown command', id);
    try {
      await c.run(arg);
    } catch (e) {
      toast(errMsg(e), 'error', 5000);
    }
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------
  markDirty() {
    if (!this.doc.dirty) {
      this.doc.dirty = true;
      this.updateTitle();
    }
    this.scheduleAutosave();
  }

  private scheduleAutosave() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    if (!this.autosave || !(this.doc.local || this.doc.cloud) || !FORMAT_INFO[this.doc.format].writable) return;
    this.autosaveTimer = setTimeout(() => {
      if (this.doc.dirty) void this.save(true);
    }, 3000);
  }

  updateTitle() {
    const d = this.doc;
    this.titleName.textContent = d.name;
    this.saveState.className = `save-state ${d.dirty ? 'dirty' : 'saved'}`;
    this.saveState.replaceChildren(
      d.dirty ? iconEl('refresh', 12) : iconEl('check', 12),
      d.dirty ? 'Unsaved' : d.cloud ? 'Saved to Nextcloud' : d.local ? 'Saved' : 'New',
    );
    window.bnc.setTitle(`${d.dirty ? '● ' : ''}${d.name} - BNC Docs`);
    this.updateAutosaveBadge();
  }

  /** AutoSave needs somewhere to save to: a file on this device or on Nextcloud, in a writable format. */
  autosaveAvailable(): boolean {
    return !!(this.doc.local || this.doc.cloud) && FORMAT_INFO[this.doc.format].writable;
  }

  updateAutosaveBadge() {
    const b = this.autosaveBtn;
    if (!b) return;
    const available = this.autosaveAvailable();
    const state = !available ? 'unavailable' : this.autosave ? 'on' : 'off';
    b.className = `autosave ${state}`;
    b.replaceChildren(iconEl(state === 'on' ? 'refresh' : 'save', 13), h('span', { text: state === 'on' ? 'AutoSave On' : 'AutoSave Off' }));
    b.title =
      state === 'unavailable'
        ? 'AutoSave is unavailable: this document has no save location yet. Save it to this device or Nextcloud first.'
        : state === 'on'
          ? 'AutoSave is on: changes are saved automatically a few seconds after you stop typing. Click to turn off.'
          : 'AutoSave is off. Click to turn on.';
    b.setAttribute('aria-disabled', String(!available));
    b.setAttribute('aria-pressed', String(state === 'on'));
  }

  toggleAutosave() {
    if (!this.autosaveAvailable()) {
      toast('Save the document to this device or Nextcloud first (Ctrl+S), then AutoSave can be turned on.');
      return;
    }
    void this.setAutosave(!this.autosave);
  }

  async confirmDiscard(): Promise<boolean> {
    if (!this.doc.dirty) return true;
    const r = await window.bnc.confirmSave(this.doc.name);
    if (r === 'cancel') return false;
    if (r === 'save') {
      await this.save();
      return !this.doc.dirty;
    }
    return true;
  }

  newDocument(force = false) {
    const go = () => {
      this.meta = defaultMeta();
      this.doc = { name: 'Document', format: 'bncdoc', dirty: false };
      this.applyLayoutVars();
      this.setContent(emptyDoc());
      this.updateTitle();
      this.editor.commands.focus('start');
    };
    if (force) return go();
    void this.confirmDiscard().then((ok) => ok && go());
  }

  async openLocal() {
    if (!(await this.confirmDiscard())) return;
    const f = await window.bnc.openFile();
    if (f) await this.loadFile(f);
  }

  async openFileGuarded(f: DocFile) {
    if (await this.confirmDiscard()) await this.loadFile(f);
  }

  async loadFile(f: DocFile) {
    try {
      const decoded = await decodeFile(f.name, f.data);
      this.applyDecoded(decoded);
      this.doc = { name: baseName(f.name), format: formatFromName(f.name) ?? 'bncdoc', local: f.path || undefined, dirty: false };
      this.updateTitle();
      toast(`Opened ${f.name}`);
    } catch (e) {
      void window.bnc.message({ type: 'error', message: `Couldn't open ${f.name}`, detail: errMsg(e) });
    }
  }

  private applyDecoded(d: Decoded) {
    this.meta = normalizeMeta(d.meta);
    this.applyLayoutVars();
    this.setContent((d.json ?? d.html ?? '') as any);
    this.editor.commands.focus('start');
  }

  private snapshot() {
    const json = this.editor.getJSON() as JSONNode;
    return { json, meta: { ...cloneMeta(this.meta), modified: new Date().toISOString() }, html: this.editor.getHTML(), text: this.editor.getText({ blockSeparator: '\n' }), css: docCss };
  }

  async save(silent = false) {
    if (this.doc.cloud) return this.saveCloud(silent);
    if (this.doc.local && FORMAT_INFO[this.doc.format].writable) {
      try {
        const bytes = await encodeFile(this.doc.format, this.snapshot());
        await window.bnc.saveFile(this.doc.local, bytes);
        this.doc.dirty = false;
        this.updateTitle();
        if (!silent) toast('Saved');
      } catch (e) {
        toast(`Couldn't save: ${errMsg(e)}`, 'error', 5000);
      }
      return;
    }
    return this.saveAs();
  }

  async saveAs() {
    const order: Format[] = ['bncdoc', 'docx', 'html', 'md', 'txt', 'rtf'];
    const first: Format = FORMAT_INFO[this.doc.format].writable ? this.doc.format : 'bncdoc';
    const fmts = [first, ...order.filter((f) => f !== first)];
    const filters = fmts.map((f) => ({ name: FORMAT_INFO[f].label, extensions: [FORMAT_INFO[f].ext] }));
    try {
      const bytes = await encodeFile(first, this.snapshot());
      const r = await window.bnc.saveFileAs({ defaultName: `${this.doc.name}.${FORMAT_INFO[first].ext}`, filters, data: bytes });
      if (!r) return;
      const fmt = formatFromName(r.name) ?? first;
      if (fmt !== first) await window.bnc.saveFile(r.path, await encodeFile(fmt, this.snapshot()));
      this.doc = { name: baseName(r.name), format: fmt, local: r.path, dirty: false };
      this.updateTitle();
      toast(`Saved ${r.name}`);
    } catch (e) {
      toast(`Couldn't save: ${errMsg(e)}`, 'error', 5000);
    }
  }

  async exportAs(fmt: Format) {
    if (fmt === 'pdf') return this.exportPdf();
    try {
      const info = FORMAT_INFO[fmt];
      const bytes = await encodeFile(fmt, this.snapshot());
      const r = await window.bnc.saveFileAs({ defaultName: `${this.doc.name}.${info.ext}`, filters: [{ name: info.label, extensions: [info.ext] }], data: bytes });
      if (r) toast(`Exported ${r.name}`);
    } catch (e) {
      toast(`Export failed: ${errMsg(e)}`, 'error', 5000);
    }
  }

  private printPayload() {
    const html = buildDocumentHtml(this.editor.getHTML(), this.meta, docCss, { print: true });
    return { html, headerHtml: pdfTemplate(this.meta.header, this.meta), footerHtml: pdfTemplate(this.meta.footer, this.meta) };
  }

  async exportPdf() {
    const r = await window.bnc.exportPdf({ ...this.printPayload(), defaultName: `${this.doc.name}.pdf` });
    if (r) toast('Exported PDF');
  }

  async print() {
    await window.bnc.print(this.printPayload());
  }

  async rename() {
    const n = await prompt('Rename', 'Document name', this.doc.name, 'Rename');
    if (!n) return;
    const clean = n.replace(/[\\/:*?"<>|]/g, '');
    if (!clean) return;
    this.doc.name = clean;
    this.updateTitle();
  }

  // ---- Nextcloud ----
  async refreshCloudState() {
    const st = await window.bnc.nc.status().catch(() => null);
    this.ncUser = st?.user ?? null;
    this.status.cloud.textContent = st ? `Nextcloud: ${st.user}` : '';
  }

  async ensureCloud(): Promise<boolean> {
    if (this.ncUser) return true;
    return nextcloudDialog(this);
  }

  async openCloud() {
    if (!(await this.ensureCloud())) return;
    if (!(await this.confirmDiscard())) return;
    const pick = await cloudPicker('open', undefined, this.doc.cloud ? this.doc.cloud.path.replace(/\/[^/]+$/, '') || '/' : '/');
    if (!pick) return;
    try {
      const { data, etag } = await window.bnc.nc.read(pick.path);
      const decoded = await decodeFile(pick.name, data);
      this.applyDecoded(decoded);
      this.doc = { name: baseName(pick.name), format: formatFromName(pick.name) ?? 'bncdoc', cloud: { path: pick.path, etag }, dirty: false };
      this.updateTitle();
      toast(`Opened ${pick.name} from Nextcloud`);
    } catch (e) {
      void window.bnc.message({ type: 'error', message: `Couldn't open ${pick.name}`, detail: errMsg(e) });
    }
  }

  async saveCloudAs() {
    if (!(await this.ensureCloud())) return;
    const fmt: Format = FORMAT_INFO[this.doc.format].writable ? this.doc.format : 'bncdoc';
    const start = this.doc.cloud ? this.doc.cloud.path.replace(/\/[^/]+$/, '') || '/' : '/';
    const pick = await cloudPicker('save', `${this.doc.name}.${FORMAT_INFO[fmt].ext}`, start);
    if (!pick) return;
    const f = formatFromName(pick.name) ?? fmt;
    try {
      const bytes = await encodeFile(f, this.snapshot());
      const { etag } = await window.bnc.nc.write(pick.path, bytes);
      this.doc = { name: baseName(pick.name), format: f, cloud: { path: pick.path, etag }, dirty: false };
      this.updateTitle();
      toast(`Saved to Nextcloud: ${pick.name}`);
    } catch (e) {
      toast(`Couldn't save to Nextcloud: ${errMsg(e)}`, 'error', 6000);
    }
  }

  async saveCloud(silent = false) {
    if (!this.doc.cloud) return this.saveCloudAs();
    const fmt = this.doc.format;
    try {
      const bytes = await encodeFile(fmt, this.snapshot());
      let res: { etag?: string };
      try {
        res = await window.bnc.nc.write(this.doc.cloud.path, bytes, this.doc.cloud.etag);
      } catch (e) {
        if (!/conflict/i.test(errMsg(e))) throw e;
        const choice = await window.bnc.confirmSave('the newer version on Nextcloud (it changed since you opened it) — overwrite it');
        if (choice !== 'save') return;
        res = await window.bnc.nc.write(this.doc.cloud.path, bytes);
      }
      this.doc.cloud.etag = res.etag;
      this.doc.dirty = false;
      this.updateTitle();
      if (!silent) toast('Saved to Nextcloud');
    } catch (e) {
      toast(`Couldn't save to Nextcloud: ${errMsg(e)}`, 'error', 6000);
    }
  }

  // -------------------------------------------------------------------------
  // View state
  // -------------------------------------------------------------------------
  applyTheme() {
    document.documentElement.dataset.theme = this.theme;
    applyStyleToDom(this.activeStyle, this.theme);
    const cs = getComputedStyle(document.documentElement);
    window.bnc.setOverlay({ color: cs.getPropertyValue('--bg').trim() || '#101012', symbolColor: this.theme === 'dark' ? '#ececf1' : '#1c1c22' });
  }

  async setTheme(t: 'dark' | 'light') {
    this.theme = t;
    this.applyTheme();
    await window.bnc.setSettings({ theme: t });
    this.refreshUi();
  }

  async setAutosave(on: boolean) {
    this.autosave = on;
    await window.bnc.setSettings({ autosave: on });
    this.scheduleAutosave();
    this.updateAutosaveBadge();
    toast(on ? 'AutoSave is on' : 'AutoSave is off');
  }

  setZoom(z: number) {
    this.zoom = Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
    (this.paperWrap.style as any).zoom = String(this.zoom);
    this.status.zoomRange.value = String(Math.round(this.zoom * 100));
    this.status.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
    this.editor?.storage.pagination?.run();
    requestAnimationFrame(() => this.renderRuler());
    this.refreshUi();
  }

  fitWidth() {
    const avail = this.desk.clientWidth - 90;
    this.setZoom(avail / (this.meta.page.width * PT));
  }

  setEditable(on: boolean) {
    this.editable = on;
    this.editor.setEditable(on);
    this.refreshUi();
  }

  renderRuler() {
    const r = this.ruler;
    if (!r || !r.classList.contains('on')) return;
    r.replaceChildren();
    const p = this.meta.page;
    const z = this.zoom;
    const widthPx = p.width * PT * z;
    const left = Math.max(0, (this.desk.clientWidth - widthPx) / 2) + (this.desk.scrollLeft ? -this.desk.scrollLeft : 0);
    const bar = h('div', { style: { position: 'absolute', left: `${left}px`, width: `${widthPx}px`, top: '0', bottom: '0', background: 'var(--surface-3)' } });
    const content = h('div', { style: { position: 'absolute', left: `${p.marginLeft * PT * z}px`, width: `${(p.width - p.marginLeft - p.marginRight) * PT * z}px`, top: '0', bottom: '0', background: 'var(--surface)' } });
    bar.append(content);
    const inchPx = 96 * z;
    const total = p.width / 72;
    for (let i = 0; i <= total * 8; i++) {
      const x = (i / 8) * inchPx;
      const major = i % 8 === 0;
      const half = i % 4 === 0;
      bar.append(h('div', { style: { position: 'absolute', left: `${x}px`, bottom: '0', width: '1px', height: major ? '10px' : half ? '7px' : '4px', background: 'var(--text-dim)', opacity: '0.7' } }));
      if (major && i > 0 && i / 8 < total) {
        const label = h('span', { text: String(i / 8), style: { position: 'absolute', left: `${x + 3}px`, top: '2px', fontSize: '9px', color: 'var(--text-dim)' } });
        bar.append(label);
      }
    }
    r.append(bar);
  }

  // -------------------------------------------------------------------------
  // Status / navigation
  // -------------------------------------------------------------------------
  stats() {
    const cc = this.editor.storage.characterCount;
    const text = this.editor.getText({ blockSeparator: '\n' });
    let paragraphs = 0;
    this.editor.state.doc.descendants((n) => {
      if (n.isTextblock && n.textContent.trim()) paragraphs++;
      return true;
    });
    return {
      words: cc.words() as number,
      chars: cc.characters() as number,
      charsNoSpaces: text.replace(/\s/g, '').length,
      paragraphs,
      pages: this.pagination.pageCount,
    };
  }

  private updateStatus = () => {
    if (!this.status || !this.editor) return;
    const head = this.editor.state.selection.head;
    const page = this.pagination.breaks.filter((p) => p <= head).length + 1;
    this.status.page.textContent = `Page ${Math.min(page, this.pagination.pageCount)} of ${this.pagination.pageCount}`;
    const sel = this.editor.state.selection;
    if (!sel.empty) {
      const t = this.editor.state.doc.textBetween(sel.from, sel.to, ' ');
      const w = t.trim() ? t.trim().split(/\s+/).length : 0;
      this.status.words.textContent = `${w} of ${this.editor.storage.characterCount.words()} words`;
    } else {
      this.status.words.textContent = `${this.editor.storage.characterCount.words()} words`;
    }
  };

  refreshNav = debounce(() => {
    if (!this.navPane.classList.contains('open')) return;
    this.navPane.replaceChildren(h('h3', { text: 'Navigation' }));
    let n = 0;
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.textContent.trim()) {
        n++;
        const item = h('div', { class: 'nav-item', text: node.textContent, style: { paddingLeft: `${8 + (node.attrs.level - 1) * 14}px`, fontWeight: node.attrs.level === 1 ? '600' : '400' } });
        item.addEventListener('click', () => this.scrollToPos(pos + 1));
        this.navPane.append(item);
      }
      return node.type.name !== 'paragraph';
    });
    if (!n) this.navPane.append(h('div', { class: 'empty', text: 'Add headings to your document and they will show up here.' }));
  }, 150);

  scrollToPos(pos: number) {
    this.editor.chain().setTextSelection(pos).run();
    const c = this.editor.view.coordsAtPos(pos);
    const dr = this.desk.getBoundingClientRect();
    this.desk.scrollTo({ top: this.desk.scrollTop + (c.top - dr.top) - 80 });
    this.editor.commands.focus();
  }

  // -------------------------------------------------------------------------
  // Images, painter
  // -------------------------------------------------------------------------
  async insertImageFile(file: File) {
    const src: string = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
    const dims: { w: number; h: number } = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
      img.onerror = () => res({ w: 300, h: 200 });
      img.src = src;
    });
    const maxW = (this.meta.page.width - this.meta.page.marginLeft - this.meta.page.marginRight) * PT;
    const scale = Math.min(1, maxW / dims.w);
    this.editor.chain().focus().setImage({ src, alt: file.name, width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) }).run();
  }

  startPainter() {
    const { $from, empty } = this.editor.state.selection;
    const marks = empty ? [...($from.marks() ?? [])] : [...$from.marks()];
    this.painter = marks;
    this.root.classList.add('painting');
    toast('Format Painter: select text to apply the formatting');
  }

  private applyPainter() {
    if (!this.painter) return;
    const { from, to, empty } = this.editor.state.selection;
    if (empty) return;
    const marks = this.painter;
    this.painter = null;
    this.root.classList.remove('painting');
    const { state, view } = this.editor;
    let tr = state.tr;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText) return false;
      return true;
    });
    for (const t of Object.values(state.schema.marks)) tr = tr.removeMark(from, to, t);
    for (const m of marks) tr = tr.addMark(from, to, m);
    view.dispatch(tr);
  }

  // -------------------------------------------------------------------------
  // Menus & global events
  // -------------------------------------------------------------------------
  private editModeMenu(anchor: HTMLElement) {
    showMenu(anchor, [
      { label: 'Editing', icon: 'editor', checked: this.editable, run: () => this.setEditable(true) },
      { label: 'Viewing', icon: 'view', checked: !this.editable, run: () => this.setEditable(false) },
    ], { align: 'right' });
  }

  private cloudMenu(anchor: HTMLElement) {
    showMenu(anchor, [
      { label: this.ncUser ? `Connected as ${this.ncUser}` : 'Not connected', header: true },
      { label: 'Open from Nextcloud…', icon: 'cloudDown', run: () => void this.openCloud() },
      { label: 'Save to Nextcloud…', icon: 'cloudUp', run: () => void this.saveCloudAs() },
      { separator: true },
      { label: this.ncUser ? 'Account…' : 'Connect to Nextcloud…', icon: 'settings', run: () => void nextcloudDialog(this) },
    ], { align: 'right' });
  }

  about() {
    aboutDialog(this.version);
  }

  private bindGlobalEvents() {
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // (match the physical key: on a Mac, Option+Q types "œ")
      if (e.altKey && (k === 'q' || e.code === 'KeyQ')) {
        e.preventDefault();
        document.getElementById('cmd-search')?.focus();
      } else if (mod && !e.shiftKey && !e.altKey) {
        const map: Record<string, string> = { n: 'new', o: 'open', s: 'save', p: 'print', f: 'find', h: 'replace', k: 'insert-link' };
        if (map[k]) {
          e.preventDefault();
          void this.run(map[k]);
        }
      } else if (mod && e.shiftKey && k === 's') {
        e.preventDefault();
        void this.run('save-as');
      } else if (mod && e.shiftKey && (e.key === '>' || e.key === '.')) {
        e.preventDefault();
        void this.run('font-grow');
      } else if (mod && e.shiftKey && (e.key === '<' || e.key === ',')) {
        e.preventDefault();
        void this.run('font-shrink');
      }
    });

    this.desk.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.setZoom(this.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
      },
      { passive: false },
    );
    this.desk.addEventListener('scroll', () => this.renderRuler());
    window.addEventListener('resize', () => this.renderRuler());

    // Drag & drop
    const hint = document.getElementById('drop-hint')!;
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        depth++;
        hint.classList.add('on');
      }
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) hint.classList.remove('on');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      hint.classList.remove('on');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.(bnctheme|bncvis|bncplugin)$/i.test(file.name)) return void installStyleBytes(this, file.name, new Uint8Array(await file.arrayBuffer()));
      if (file.type.startsWith('image/')) return void this.insertImageFile(file);
      if (!formatFromName(file.name)) return toast(`Can't open ${file.name}`, 'error');
      if (!(await this.confirmDiscard())) return;
      await this.loadFile({ path: '', name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    });
  }
}
