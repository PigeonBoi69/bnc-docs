import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { sinkListItem, liftListItem } from '@tiptap/pm/schema-list';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import CharacterCount from '@tiptap/extension-character-count';
import { FindExtension } from './find';
import { PaginationExtension, type PaginationOptions } from './paginate';
import { Proofing, type ProofHost } from './proofing';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setParagraphFormat: (attrs: Record<string, any>) => ReturnType;
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
    };
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

const ptOf = (v: string | undefined | null): number | null => {
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (/px$/.test(v)) return n * 0.75;
  return n;
};

const BLOCKS = ['paragraph', 'heading'];

/** Word-style paragraph formatting: spacing, line height, indents, shading, named style. */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          spaceBefore: {
            default: null,
            parseHTML: (el: HTMLElement) => ptOf(el.style.paddingTop),
            renderHTML: (a: any) => (a.spaceBefore != null ? { style: `padding-top:${a.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el: HTMLElement) => ptOf(el.style.paddingBottom),
            renderHTML: (a: any) => (a.spaceAfter != null ? { style: `padding-bottom:${a.spaceAfter}pt` } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const v = el.style.lineHeight;
              if (!v) return null;
              return /pt$/.test(v) ? v : Number(v) || null;
            },
            renderHTML: (a: any) => (a.lineHeight != null ? { style: `line-height:${a.lineHeight}` } : {}),
          },
          indentLeft: {
            default: null,
            parseHTML: (el: HTMLElement) => ptOf(el.style.marginLeft),
            renderHTML: (a: any) => (a.indentLeft ? { style: `margin-left:${a.indentLeft}pt` } : {}),
          },
          indentRight: {
            default: null,
            parseHTML: (el: HTMLElement) => ptOf(el.style.marginRight),
            renderHTML: (a: any) => (a.indentRight ? { style: `margin-right:${a.indentRight}pt` } : {}),
          },
          indentFirst: {
            default: null,
            parseHTML: (el: HTMLElement) => ptOf(el.style.textIndent),
            renderHTML: (a: any) => (a.indentFirst ? { style: `text-indent:${a.indentFirst}pt` } : {}),
          },
          shading: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-shading'),
            renderHTML: (a: any) => (a.shading ? { 'data-shading': a.shading, style: `background-color:${a.shading}` } : {}),
          },
          styleId: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-style'),
            renderHTML: (a: any) => (a.styleId ? { 'data-style': a.styleId } : {}),
          },
          pageBreakBefore: {
            default: null,
            parseHTML: (el: HTMLElement) => (el.getAttribute('data-pbb') ? true : null),
            renderHTML: (a: any) => (a.pageBreakBefore ? { 'data-pbb': '1' } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphFormat:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (BLOCKS.includes(node.type.name)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
          });
          dispatch?.(tr);
          return true;
        },
      increaseIndent:
        () =>
        ({ editor, state, commands }) => {
          if (editor.isActive('listItem')) return commands.sinkListItem('listItem');
          const cur = editor.getAttributes(state.selection.$from.parent.type.name).indentLeft ?? 0;
          return commands.setParagraphFormat({ indentLeft: cur + 36 });
        },
      decreaseIndent:
        () =>
        ({ editor, state, commands }) => {
          if (editor.isActive('listItem')) return commands.liftListItem('listItem');
          const cur = editor.getAttributes(state.selection.$from.parent.type.name).indentLeft ?? 0;
          return commands.setParagraphFormat({ indentLeft: Math.max(0, cur - 36) });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('table')) return false;
        if (editor.isActive('listItem')) {
          const { state, view } = editor;
          return sinkListItem(state.schema.nodes.listItem)(state, view.dispatch);
        }
        return editor.commands.insertContent('\t');
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('table')) return false;
        if (editor.isActive('listItem')) {
          const { state, view } = editor;
          return liftListItem(state.schema.nodes.listItem)(state, view.dispatch);
        }
        return true;
      },
    };
  },
});

/** Extra character-level effects stored on the textStyle mark. */
export const TextEffects = Extension.create({
  name: 'textEffects',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          textTransform: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.textTransform || null,
            renderHTML: (a: any) => (a.textTransform ? { style: `text-transform:${a.textTransform}` } : {}),
          },
          fontVariant: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontVariant || null,
            renderHTML: (a: any) => (a.fontVariant ? { style: `font-variant:${a.fontVariant}` } : {}),
          },
          letterSpacing: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.letterSpacing || null,
            renderHTML: (a: any) => (a.letterSpacing ? { style: `letter-spacing:${a.letterSpacing}` } : {}),
          },
        },
      },
    ];
  },
});

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page-break', class: 'page-break' })];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'pageBreak' }),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});

const TableWithAttrs = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bordered: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-bordered') !== 'false',
        renderHTML: (a: any) => ({ 'data-bordered': String(a.bordered !== false) }),
      },
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
        renderHTML: (a: any) => (a.align ? { 'data-align': a.align } : {}),
      },
    };
  },
  addProseMirrorPlugins() {
    const key = new PluginKey('tableClasses');
    return [
      ...(this.parent?.() ?? []),
      // Tables use a node view, so border/alignment flags are applied as wrapper classes.
      new Plugin({
        key,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'table') {
                const cls = [node.attrs.bordered === false ? 'tbl-borderless' : 'tbl-bordered'];
                if (node.attrs.align === 'center') cls.push('tbl-center');
                if (node.attrs.align === 'right') cls.push('tbl-right');
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: cls.join(' ') }));
                return false;
              }
              return true;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

const cellAttrs = () => ({
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || el.getAttribute('data-bg'),
    renderHTML: (a: any) => (a.backgroundColor ? { 'data-bg': a.backgroundColor, style: `background-color:${a.backgroundColor}` } : {}),
  },
  verticalAlign: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.verticalAlign || null,
    renderHTML: (a: any) => (a.verticalAlign ? { style: `vertical-align:${a.verticalAlign === 'center' ? 'middle' : a.verticalAlign}` } : {}),
  },
});

const CellWithAttrs = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs() };
  },
});
const HeaderWithAttrs = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs() };
  },
});

export function buildExtensions(paginationOptions: PaginationOptions, proof?: ProofHost) {
  return [
    StarterKit.configure({
      // StarterKit v3 ships these; configure instead of re-adding.
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: false,
      code: false,
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    TextEffects,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    Image.configure({
      inline: true,
      allowBase64: true,
      resize: { enabled: true, minWidth: 24, minHeight: 24, alwaysPreserveAspectRatio: true },
    }),
    TableWithAttrs.configure({ resizable: true, lastColumnResizable: false }),
    TableRow,
    HeaderWithAttrs,
    CellWithAttrs,
    CharacterCount,
    ParagraphFormat,
    PageBreak,
    FindExtension,
    PaginationExtension.configure(paginationOptions),
    Proofing.configure({ host: proof ?? null }),
  ];
}
