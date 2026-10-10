import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      setFindQuery: (query: string, caseSensitive?: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (text: string) => ReturnType;
      replaceAll: (text: string) => ReturnType;
      clearFind: () => ReturnType;
    };
  }
}

declare module '@tiptap/core' {
  interface Storage {
    find: { count: number; current: number; query: string };
  }
}

interface Range {
  from: number;
  to: number;
}
interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: Range[];
  current: number;
}

export const findKey = new PluginKey<FindState>('find');

function searchDoc(doc: PMNode, query: string, caseSensitive: boolean): Range[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Range[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) {
          text += child.text![i];
          map.push(start + i);
        }
      } else {
        text += '￼';
        map.push(start);
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      out.push({ from: map[idx], to: map[idx + needle.length - 1] + 1 });
      idx = hay.indexOf(needle, idx + needle.length);
    }
    return false;
  });
  return out;
}

export const FindExtension = Extension.create({
  name: 'find',

  addStorage() {
    return { count: 0, current: -1, query: '' };
  },

  addCommands() {
    const select = (editor: any, r: Range) => {
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, r.from, r.to)).scrollIntoView());
    };
    return {
      setFindQuery:
        (query, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(findKey, { query, caseSensitive }));
          return true;
        },
      findNext:
        () =>
        ({ editor, state, tr, dispatch }) => {
          const s = findKey.getState(state);
          if (!s || !s.matches.length) return false;
          // next match after the cursor
          const head = state.selection.to;
          let i = s.matches.findIndex((m) => m.from >= head);
          if (i === -1) i = 0;
          dispatch?.(tr.setMeta(findKey, { current: i }));
          setTimeout(() => select(editor, s.matches[i]), 0);
          return true;
        },
      findPrevious:
        () =>
        ({ editor, state, tr, dispatch }) => {
          const s = findKey.getState(state);
          if (!s || !s.matches.length) return false;
          const head = state.selection.from;
          let i = -1;
          for (let k = s.matches.length - 1; k >= 0; k--) {
            if (s.matches[k].to <= head - 0 && s.matches[k].from < head) {
              i = k;
              break;
            }
          }
          if (i === -1) i = s.matches.length - 1;
          dispatch?.(tr.setMeta(findKey, { current: i }));
          setTimeout(() => select(editor, s.matches[i]), 0);
          return true;
        },
      replaceCurrent:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = findKey.getState(state);
          if (!s || !s.matches.length) return false;
          const { from, to } = state.selection;
          const m = s.matches.find((r) => r.from === from && r.to === to) ?? s.matches[Math.max(0, s.current)];
          if (!m) return false;
          dispatch?.(tr.insertText(text, m.from, m.to));
          return true;
        },
      replaceAll:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = findKey.getState(state);
          if (!s || !s.matches.length) return false;
          for (const m of [...s.matches].reverse()) tr.insertText(text, m.from, m.to);
          dispatch?.(tr);
          return true;
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(findKey, { query: '', caseSensitive: false }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, matches: [], current: -1 }),
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
            let next = prev;
            if (meta && (meta.query !== undefined || meta.caseSensitive !== undefined)) {
              const query = meta.query ?? prev.query;
              const cs = meta.caseSensitive ?? prev.caseSensitive;
              const matches = searchDoc(tr.doc, query, cs);
              next = { query, caseSensitive: cs, matches, current: matches.length ? 0 : -1 };
            } else if (tr.docChanged && prev.query) {
              const matches = searchDoc(tr.doc, prev.query, prev.caseSensitive);
              next = { ...prev, matches, current: Math.min(prev.current, matches.length - 1) };
            }
            if (meta && meta.current !== undefined && meta.query === undefined) next = { ...next, current: meta.current };
            storage.count = next.matches.length;
            storage.current = next.current;
            storage.query = next.query;
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state);
            if (!s || !s.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'find-match find-current' : 'find-match' })),
            );
          },
        },
      }),
    ];
  },
});
