// The "Spelling & Punctuation" side pane: one problem at a time with its fixes, the list of all problems,
// and the proofing options.
import type { App } from '../app';
import { ignoreIssueOnce, proofIssues, replaceIssue, showIssue, type ProofIssue } from '../editor/proofing';
import { DICTIONARIES, type DictId } from '../core/proof/speller';
import { h, iconEl } from './dom';
import type { Proof } from './proof';

interface Key {
  from: number;
  to: number;
  kind: string;
}
const keyOf = (i: ProofIssue): Key => ({ from: i.from, to: i.to, kind: i.kind });
const same = (i: ProofIssue, k: Key | null) => !!k && i.from === k.from && i.to === k.to && i.kind === k.kind;

export class ProofPane {
  readonly el = h('aside', { class: 'proofpane', attrs: { 'aria-label': 'Spelling and punctuation' } });
  private sel: Key | null = null;
  /** after a fix, go on with the issue that now sits at this index */
  private pending: number | null = null;

  constructor(private app: App, private proof: Proof) {}

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open(issue?: ProofIssue) {
    this.el.classList.add('open');
    if (issue) {
      this.sel = keyOf(issue);
      showIssue(this.app.editor, issue);
    }
    this.render();
  }

  close() {
    this.el.classList.remove('open');
    this.app.editor.commands.focus();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  refresh() {
    if (this.isOpen) this.render();
  }

  private render() {
    const ed = this.app.editor;
    const p = this.proof;
    const issues = proofIssues(ed);
    const spell = issues.filter((i) => i.kind === 'spell').length;
    const punct = issues.length - spell;

    const head = h(
      'div',
      { class: 'pp-head' },
      h('h3', { text: 'Spelling & Punctuation' }),
      h('button', { class: 'icon-btn', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: () => this.close() } }, iconEl('close', 16)),
    );
    const body = h('div', { class: 'pp-body' });
    this.el.replaceChildren(head, body, this.options());

    if (!p.spelling && !p.punctuation) {
      body.append(h('div', { class: 'pp-empty' }, h('p', { text: 'Checking is switched off.' }), h('p', { class: 'muted', text: 'Turn on spelling or punctuation below to see problems here.' })));
      return;
    }
    if (p.loading && p.spelling) {
      body.append(h('div', { class: 'pp-empty', text: 'Loading the dictionary…' }));
      return;
    }
    if (!issues.length) {
      body.append(h('div', { class: 'pp-empty ok' }, h('div', { class: 'pp-tick' }, iconEl('check', 28)), h('p', { text: 'No spelling or punctuation problems found.' })));
      return;
    }

    // which problem is in front
    let cur = issues.find((i) => same(i, this.sel));
    if (this.pending !== null) {
      cur = issues[Math.min(this.pending, issues.length - 1)];
      this.pending = null;
      if (cur) {
        this.sel = keyOf(cur);
        showIssue(ed, cur);
      }
    }
    if (!cur) {
      const at = ed.state.selection.from;
      cur = issues.find((i) => i.from >= at) ?? issues[0];
    }

    body.append(h('div', { class: 'pp-counts', text: `${spell} spelling · ${punct} punctuation` }), this.card(cur, issues), this.list(issues, cur));
  }

  private snippet(issue: ProofIssue): HTMLElement {
    const doc = this.app.editor.state.doc;
    const $p = doc.resolve(issue.from);
    const a = Math.max($p.start(), issue.from - 45);
    const b = Math.min($p.end(), issue.to + 45);
    const pre = doc.textBetween(a, issue.from, ' ', ' ');
    const post = doc.textBetween(issue.to, Math.max(issue.to, b), ' ', ' ');
    return h('div', { class: 'pp-context' }, a > $p.start() ? '…' : '', pre, h('mark', { class: issue.kind === 'spell' ? 'sp' : 'pu', text: issue.text }), post, b < $p.end() ? '…' : '');
  }

  private card(cur: ProofIssue, issues: ProofIssue[]): HTMLElement {
    const ed = this.app.editor;
    const p = this.proof;
    const idx = issues.indexOf(cur);
    // run a fix, then show the problem that takes its place
    const act = (fn: () => void) => () => {
      this.pending = idx;
      fn();
    };
    const btn = (label: string, fn: () => void, cls = '') => {
      const b = h('button', { class: `btn small ${cls}`, text: label });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', act(fn));
      return b;
    };
    const card = h('div', { class: 'pp-card' });
    card.append(h('div', { class: 'pp-kind', text: cur.kind === 'spell' ? 'Spelling' : `Punctuation: ${cur.message ?? ''}` }), this.snippet(cur));
    if (cur.kind === 'spell') {
      const sugg = p.speller?.suggest(cur.text).slice(0, 6) ?? [];
      const box = h('div', { class: 'pp-sugg' });
      if (!sugg.length) box.append(h('div', { class: 'muted', text: 'No suggestions' }));
      for (const s of sugg) {
        const b = h('button', { class: 'pp-s', text: s, title: `Change to “${s}”` });
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', act(() => replaceIssue(ed, cur, s)));
        box.append(b);
      }
      card.append(box, h('div', { class: 'pp-actions' }, btn('Ignore Once', () => ignoreIssueOnce(ed, cur)), btn('Ignore All', () => p.ignoreAll(cur.text)), btn('Add to Dictionary', () => void p.addWord(cur.text))));
    } else {
      const box = h('div', { class: 'pp-sugg' });
      for (const f of cur.fixes ?? []) {
        const b = h('button', { class: 'pp-s', text: f.label });
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', act(() => replaceIssue(ed, cur, f.text)));
        box.append(b);
      }
      card.append(box, h('div', { class: 'pp-actions' }, btn('Ignore Once', () => ignoreIssueOnce(ed, cur))));
    }
    const nav = h(
      'div',
      { class: 'pp-nav' },
      h('button', { class: 'btn small', text: 'Previous', on: { click: () => this.go(issues, idx - 1) } }),
      h('span', { class: 'muted', text: `${idx + 1} of ${issues.length}` }),
      h('button', { class: 'btn small', text: 'Next', on: { click: () => this.go(issues, idx + 1) } }),
    );
    card.append(nav);
    return card;
  }

  private go(issues: ProofIssue[], i: number) {
    const n = issues.length;
    const target = issues[((i % n) + n) % n];
    this.sel = keyOf(target);
    showIssue(this.app.editor, target);
    this.render();
  }

  private list(issues: ProofIssue[], cur: ProofIssue): HTMLElement {
    const wrap = h('div', { class: 'pp-list' }, h('div', { class: 'pp-list-title', text: 'All problems' }));
    for (const i of issues.slice(0, 300)) {
      const row = h(
        'button',
        { class: `pp-row${i === cur ? ' sel' : ''}` },
        h('span', { class: `dot ${i.kind}` }),
        h('span', { class: 'pp-row-text', text: i.text.trim() || '(space)' }),
        h('span', { class: 'muted pp-row-msg', text: i.kind === 'spell' ? 'spelling' : (i.message ?? 'punctuation') }),
      );
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => {
        this.sel = keyOf(i);
        showIssue(this.app.editor, i);
        this.render();
      });
      wrap.append(row);
    }
    if (issues.length > 300) wrap.append(h('div', { class: 'muted', text: `…and ${issues.length - 300} more` }));
    return wrap;
  }

  private options(): HTMLElement {
    const p = this.proof;
    const check = (label: string, on: boolean, fn: () => void) => {
      const input = h('input', { attrs: { type: 'checkbox' } });
      input.checked = on;
      input.addEventListener('change', fn);
      return h('label', { class: 'pp-check' }, input, label);
    };
    const select = h('select', { class: 'select', attrs: { 'aria-label': 'Proofing language' } }, ...DICTIONARIES.map((d) => h('option', { text: d.label, attrs: { value: d.id } })));
    select.value = p.lang;
    select.addEventListener('change', () => void p.setLanguage(select.value as DictId));
    return h(
      'div',
      { class: 'pp-options' },
      check('Check spelling as you type', p.spelling, () => void p.toggle('spelling')),
      check('Check punctuation as you type', p.punctuation, () => void p.toggle('punctuation')),
      check('AutoCorrect common typos', p.autocorrect, () => void p.toggle('autocorrect')),
      select,
      h('button', { class: 'btn small', text: 'Custom dictionary…', on: { click: () => p.customDictionaryDialog() } }),
    );
  }
}
