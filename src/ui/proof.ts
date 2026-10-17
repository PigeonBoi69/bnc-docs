// Proofing as the app sees it: the settings (language, switches, custom dictionary), the dictionary,
// the right-click menu on underlined words, and the status-bar summary. The checks are in src/core/proof,
// the underlines in src/editor/proofing.ts, the side pane in proofpane.ts.
import type { App } from '../app';
import { DICTIONARIES, Speller, dictionaryForLocale, type DictId } from '../core/proof/speller';
import { ignoreIssueOnce, issueAt, proofIssues, refreshProofing, replaceIssue, type ProofHost, type ProofIssue } from '../editor/proofing';
import { debounce, h, iconEl, modal, showMenu, toast, type MenuItem } from './dom';
import { ProofPane } from './proofpane';

type Switch = 'spelling' | 'punctuation' | 'autocorrect';

const SETTING_KEY: Record<Switch, string> = { spelling: 'proofSpelling', punctuation: 'proofPunctuation', autocorrect: 'proofAutocorrect' };

export class Proof {
  lang: DictId;
  spelling: boolean;
  punctuation: boolean;
  autocorrect: boolean;
  custom: string[];
  speller: Speller | null = null;
  loading = true;
  readonly pane: ProofPane;
  private rev = 0;

  constructor(private app: App, settings: Record<string, any>) {
    const saved = DICTIONARIES.find((d) => d.id === settings.proofLang)?.id;
    this.lang = saved ?? dictionaryForLocale(navigator.language);
    this.spelling = settings.proofSpelling !== false;
    this.punctuation = settings.proofPunctuation !== false;
    this.autocorrect = settings.proofAutocorrect !== false;
    this.custom = Array.isArray(settings.customWords) ? settings.customWords.filter((w: unknown) => typeof w === 'string') : [];
    this.pane = new ProofPane(app, this);
  }

  /** What the editor extension asks. */
  readonly host: ProofHost = {
    speller: () => this.speller,
    spelling: () => this.spelling,
    punctuation: () => this.punctuation,
    autocorrect: () => this.autocorrect,
    cacheKey: () => `${this.lang}|${this.speller ? 1 : 0}|${this.spelling ? 1 : 0}|${this.punctuation ? 1 : 0}|${this.rev}`,
    onIssues: () => this.changed(),
  };

  get languageLabel(): string {
    return DICTIONARIES.find((d) => d.id === this.lang)?.label ?? this.lang;
  }

  /** Load the dictionary (a fraction of a second) and then underline the document. */
  async loadSpeller() {
    this.loading = true;
    this.updateStatus();
    try {
      this.speller = await Speller.load(this.lang, this.custom);
    } catch (e) {
      console.warn('Could not load the dictionary', e);
      this.speller = null;
      toast('The spelling dictionary could not be loaded. Punctuation is still checked.', 'error');
    }
    this.loading = false;
    this.rev++;
    this.recheck();
  }

  /** Re-run the checks and refresh everything that shows the result. */
  recheck() {
    refreshProofing(this.app.editor);
    this.updateStatus();
    this.pane.refresh();
  }

  async setLanguage(id: DictId) {
    if (id === this.lang && this.speller) return;
    this.lang = id;
    this.speller = null;
    await window.bnc.setSettings({ proofLang: id });
    await this.loadSpeller();
    toast(`Proofing language: ${this.languageLabel}`);
  }

  async toggle(which: Switch) {
    this[which] = !this[which];
    this.rev++;
    await window.bnc.setSettings({ [SETTING_KEY[which]]: this[which] });
    this.recheck();
    const name = { spelling: 'Spell checking', punctuation: 'Punctuation checking', autocorrect: 'AutoCorrect' }[which];
    toast(`${name} is ${this[which] ? 'on' : 'off'}`);
  }

  async addWord(word: string) {
    const w = word.trim();
    if (!w || this.custom.some((x) => x.toLowerCase() === w.toLowerCase())) return;
    this.custom = [...this.custom, w];
    this.speller?.addCustom(w);
    await window.bnc.setSettings({ customWords: this.custom });
    this.rev++;
    this.recheck();
  }

  async removeWord(word: string) {
    this.custom = this.custom.filter((x) => x !== word);
    this.speller?.removeCustom(word);
    await window.bnc.setSettings({ customWords: this.custom });
    this.rev++;
    this.recheck();
  }

  ignoreAll(word: string) {
    this.speller?.ignoreAll(word);
    this.rev++;
    this.recheck();
  }

  // -------------------------------------------------------------------------
  // Status bar
  // -------------------------------------------------------------------------
  private changed = debounce(() => {
    this.updateStatus();
    this.pane.refresh();
  }, 120);

  updateStatus() {
    const s = this.app.status;
    if (!s?.proofLang) return;
    s.proofLang.textContent = this.languageLabel;
    const issues = proofIssues(this.app.editor);
    let text: string;
    let state: 'ok' | 'warn' | 'off' = 'ok';
    if (!this.spelling && !this.punctuation) {
      text = 'Proofing off';
      state = 'off';
    } else if (this.loading && this.spelling) {
      text = 'Loading dictionary…';
    } else if (!issues.length) {
      text = '✓ No issues';
    } else {
      text = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
      state = 'warn';
    }
    s.proofIssues.textContent = text;
    s.proofIssues.dataset.state = state;
  }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------
  languageItems(): MenuItem[] {
    return [
      ...DICTIONARIES.map<MenuItem>((d) => ({ label: d.label, checked: d.id === this.lang, run: () => void this.setLanguage(d.id) })),
      { separator: true },
      { label: 'Custom dictionary…', icon: 'file', run: () => this.customDictionaryDialog() },
    ];
  }

  optionItems(): MenuItem[] {
    return [
      { label: 'Check spelling as you type', checked: this.spelling, run: () => void this.toggle('spelling') },
      { label: 'Check punctuation as you type', checked: this.punctuation, run: () => void this.toggle('punctuation') },
      { label: 'AutoCorrect common typos', checked: this.autocorrect, run: () => void this.toggle('autocorrect') },
      { separator: true },
      { label: 'Language', icon: 'translate', sub: this.languageItems() },
      { label: 'Custom dictionary…', run: () => this.customDictionaryDialog() },
    ];
  }

  showLanguageMenu(anchor: HTMLElement) {
    showMenu(anchor, this.languageItems());
  }

  /** The menu for a right-click on an underlined word. */
  menuFor(issue: ProofIssue): MenuItem[] {
    const ed = this.app.editor;
    const items: MenuItem[] = [];
    if (issue.kind === 'spell') {
      const suggestions = this.speller?.suggest(issue.text).slice(0, 6) ?? [];
      if (suggestions.length) for (const s of suggestions) items.push({ label: s, run: () => replaceIssue(ed, issue, s) });
      else items.push({ label: 'No spelling suggestions', disabled: true });
      items.push(
        { separator: true },
        { label: 'Ignore Once', run: () => ignoreIssueOnce(ed, issue) },
        { label: 'Ignore All', run: () => this.ignoreAll(issue.text) },
        { label: 'Add to Dictionary', icon: 'plus', run: () => void this.addWord(issue.text) },
      );
    } else {
      items.push({ label: issue.message ?? 'Punctuation', header: true });
      for (const f of issue.fixes ?? []) items.push({ label: f.label, run: () => replaceIssue(ed, issue, f.text) });
      items.push({ separator: true }, { label: 'Ignore Once', run: () => ignoreIssueOnce(ed, issue) });
    }
    items.push(
      { separator: true },
      { label: 'Spelling & Punctuation pane', icon: 'spelling', run: () => this.pane.open(issue) },
      { separator: true },
      { label: 'Cut', icon: 'cut', disabled: ed.state.selection.empty, run: () => void this.app.run('cut') },
      { label: 'Copy', icon: 'copy', disabled: ed.state.selection.empty, run: () => void this.app.run('copy') },
      { label: 'Paste', icon: 'paste', run: () => void this.app.run('paste') },
    );
    return items;
  }

  /** Right-click on an underlined word shows corrections; anywhere else the normal menu appears. */
  attachContextMenu() {
    const ed = this.app.editor;
    ed.view.dom.addEventListener('contextmenu', (e) => {
      if (!(e.target as Element).closest?.('.proof-spell, .proof-punct')) return;
      const hit = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const issue = hit ? issueAt(ed, hit.pos) : undefined;
      if (!issue) return;
      e.preventDefault();
      const anchor = h('div', { style: { position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY - 4}px`, width: '1px', height: '1px' } });
      document.body.append(anchor);
      showMenu(anchor, this.menuFor(issue));
      setTimeout(() => anchor.remove(), 0);
    });
  }

  // -------------------------------------------------------------------------
  // Custom dictionary
  // -------------------------------------------------------------------------
  customDictionaryDialog() {
    const list = h('div', { class: 'cd-list' });
    const input = h('input', { class: 'input', attrs: { type: 'text', placeholder: 'Add a word', 'aria-label': 'Word to add' } });
    const render = () => {
      list.replaceChildren();
      if (!this.custom.length) list.append(h('div', { class: 'muted cd-empty', text: 'No custom words yet. Words you choose "Add to Dictionary" for appear here.' }));
      for (const w of [...this.custom].sort((a, b) => a.localeCompare(b))) {
        const del = h('button', { class: 'icon-btn', title: `Remove ${w}`, attrs: { 'aria-label': `Remove ${w}` } }, iconEl('close', 14));
        del.addEventListener('click', async () => {
          await this.removeWord(w);
          render();
        });
        list.append(h('div', { class: 'cd-row' }, h('span', { text: w }), del));
      }
    };
    const add = async () => {
      const w = input.value.trim();
      if (!w) return;
      if (/\s/.test(w)) return toast('Add one word at a time', 'error');
      await this.addWord(w);
      input.value = '';
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        void add();
      }
    });
    const addBtn = h('button', { class: 'btn', text: 'Add', on: { click: () => void add() } });
    render();
    modal('Custom dictionary', h('div', null, h('div', { class: 'cd-add' }, input, addBtn), list), [{ label: 'Done', primary: true }], { width: 420 });
  }
}
