// Proofing inside the editor: red wavy lines under misspelt words, blue ones under punctuation slips, and AutoCorrect.
// The checks themselves live in src/core/proof (pure functions); this file only connects them to ProseMirror.
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { checkPunctuation, type PunctFix } from '../core/proof/punctuation';
import { findWords } from '../core/proof/words';
import { autocorrectWord, capitalizeI } from '../core/proof/autocorrect';
import type { Speller } from '../core/proof/speller';

export interface ProofIssue {
  kind: 'spell' | 'punct';
  from: number;
  to: number;
  /** the text the issue covers */
  text: string;
  rule?: string;
  message?: string;
  fixes?: PunctFix[];
}

export interface ProofHost {
  speller(): Speller | null;
  spelling(): boolean;
  punctuation(): boolean;
  autocorrect(): boolean;
  /** changes whenever the answer for an unchanged paragraph could change (language, custom words, switches) */
  cacheKey(): string;
  /** called (not more than once per update) when the list of issues changed */
  onIssues(issues: ProofIssue[]): void;
}

interface Rel {
  kind: 'spell' | 'punct';
  s: number;
  e: number;
  rule?: string;
  message?: string;
  fixes?: PunctFix[];
}

interface State {
  issues: ProofIssue[];
  deco: DecorationSet;
  ignored: { from: number; to: number; kind: string }[];
}

export const proofKey = new PluginKey<State>('proofing');

let cache = { key: '', map: new WeakMap<PMNode, Rel[]>() };

/** All checkable text of one block (a paragraph, heading ...) with a map from text offsets to document offsets. */
function blockText(node: PMNode): { text: string; segs: { t: number; rel: number }[] } {
  let text = '';
  const segs: { t: number; rel: number }[] = [];
  node.forEach((child, offset) => {
    segs.push({ t: text.length, rel: offset });
    if (child.isText) {
      const code = child.marks.some((m) => m.type.name === 'code');
      text += code ? '_'.repeat(child.text!.length) : child.text!;
    } else text += '\n'; // an image, a line break ...: one position, treated as white space
  });
  return { text, segs };
}

function scanBlock(node: PMNode, host: ProofHost, sp: Speller | null): Rel[] {
  const hit = cache.map.get(node);
  if (hit) return hit;
  const out: Rel[] = [];
  if (!node.type.spec.code && node.content.size) {
    const { text, segs } = blockText(node);
    const at = (i: number) => {
      let k = segs.length - 1;
      while (k > 0 && segs[k].t > i) k--;
      return segs[k].rel + (i - segs[k].t);
    };
    const span = (s: number, e: number) => ({ s: at(s), e: at(e - 1) + 1 });
    if (host.punctuation()) {
      for (const p of checkPunctuation(text)) out.push({ kind: 'punct', ...span(p.start, p.end), rule: p.rule, message: p.message, fixes: p.fixes });
    }
    if (host.spelling() && sp) {
      for (const w of findWords(text)) if (!sp.isCorrect(w.word)) out.push({ kind: 'spell', ...span(w.start, w.end) });
    }
  }
  cache.map.set(node, out);
  return out;
}

export function scanDoc(doc: PMNode, host: ProofHost): ProofIssue[] {
  const key = host.cacheKey();
  if (cache.key !== key) cache = { key, map: new WeakMap() };
  const sp = host.speller();
  const out: ProofIssue[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const r of scanBlock(node, host, sp)) {
      const from = pos + 1 + r.s;
      const to = pos + 1 + r.e;
      out.push({ kind: r.kind, from, to, text: doc.textBetween(from, to, ' ', ' '), rule: r.rule, message: r.message, fixes: r.fixes });
    }
    return false;
  });
  return out;
}

const DELIMITER = /^[\s.,;:!?)\]}"”]$/;
const CAPITAL_I_AFTER = new Set([' ', ',', ';', '!', '?']);

export const Proofing = Extension.create<{ host: ProofHost | null }>({
  name: 'proofing',
  addOptions() {
    return { host: null };
  },
  addProseMirrorPlugins() {
    const host = this.options.host;
    if (!host) return [];
    return [
      new Plugin<State>({
        key: proofKey,
        state: {
          init: () => ({ issues: [], deco: DecorationSet.empty, ignored: [] }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(proofKey) as { refresh?: boolean; ignore?: { from: number; to: number; kind: string } } | undefined;
            if (!tr.docChanged && !tr.selectionSet && !meta) return prev;
            let ignored = prev.ignored;
            if (tr.docChanged && ignored.length) {
              ignored = ignored.flatMap((r) => {
                const a = tr.mapping.mapResult(r.from, 1);
                const b = tr.mapping.mapResult(r.to, -1);
                return a.deleted || b.deleted || b.pos <= a.pos ? [] : [{ from: a.pos, to: b.pos, kind: r.kind }];
              });
            }
            if (meta?.ignore) ignored = [...ignored, meta.ignore];
            let issues = scanDoc(state.doc, host).filter((i) => !ignored.some((g) => g.from === i.from && g.to === i.to && g.kind === i.kind));
            // while typing, leave the word under the cursor alone until it is finished
            if (tr.docChanged && state.selection.empty && !meta) {
              const head = state.selection.head;
              issues = issues.filter((i) => !(i.from <= head && head <= i.to));
            }
            const deco = DecorationSet.create(
              state.doc,
              issues.map((i) => Decoration.inline(i.from, i.to, { class: i.kind === 'spell' ? 'proof-spell' : 'proof-punct' }, { kind: i.kind })),
            );
            return { issues, deco, ignored };
          },
        },
        props: {
          decorations: (state) => proofKey.getState(state)?.deco ?? DecorationSet.empty,
          // AutoCorrect: when a word is finished (space or punctuation typed), fix a known typo
          handleTextInput(view, from, to, text) {
            if (!host.autocorrect() || from !== to || !DELIMITER.test(text)) return false;
            const { state } = view;
            const $from = state.doc.resolve(from);
            if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
            if ($from.marks().some((m) => m.type.name === 'code')) return false;
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
            const m = /(?<![\p{L}\p{N}_@/\\:.\-'’])([\p{L}'’]+)$/u.exec(before);
            if (!m) return false;
            const word = m[1];
            const fixed = autocorrectWord(word) ?? (CAPITAL_I_AFTER.has(text) ? capitalizeI(word) : null);
            if (!fixed || fixed === word) return false;
            const start = from - word.length;
            // the typed space/punctuation goes in as usual; the correction is its own undo step, so one Ctrl+Z gives the typo back
            view.dispatch(state.tr.insertText(text, from));
            view.dispatch(closeHistory(view.state.tr));
            const fix = view.state.tr.insertText(fixed, start, from);
            closeHistory(fix);
            view.dispatch(fix);
            view.dispatch(closeHistory(view.state.tr));
            return true;
          },
        },
        view() {
          let last: ProofIssue[] | null = null;
          return {
            update(view) {
              const issues = proofKey.getState(view.state)?.issues ?? [];
              if (issues !== last) {
                last = issues;
                host.onIssues(issues);
              }
            },
          };
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Helpers used by the menu and the pane
// ---------------------------------------------------------------------------
export const proofIssues = (editor: Editor): ProofIssue[] => proofKey.getState(editor.state)?.issues ?? [];

/** Re-run the checks now (after the language, the dictionary or a switch changed). */
export function refreshProofing(editor: Editor) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(proofKey, { refresh: true }).setMeta('addToHistory', false));
}

export function issueAt(editor: Editor, pos: number): ProofIssue | undefined {
  return proofIssues(editor).find((i) => i.from <= pos && pos <= i.to);
}

export function replaceIssue(editor: Editor, issue: ProofIssue, text: string) {
  editor.view.dispatch(editor.state.tr.insertText(text, issue.from, issue.to));
  editor.view.focus();
}

export function ignoreIssueOnce(editor: Editor, issue: ProofIssue) {
  editor.view.dispatch(editor.state.tr.setMeta(proofKey, { ignore: { from: issue.from, to: issue.to, kind: issue.kind } }).setMeta('addToHistory', false));
}

/** Select the issue's text and scroll it into view. */
export function showIssue(editor: Editor, issue: ProofIssue) {
  editor.chain().setTextSelection({ from: issue.from, to: issue.to }).scrollIntoView().run();
}
