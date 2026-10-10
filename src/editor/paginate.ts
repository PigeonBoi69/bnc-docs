// Page layout for the editor.
//
// The document is edited as one continuous ProseMirror document. This plugin measures the laid-out
// blocks, works out where each page ends, and inserts widget decorations (the bottom margin + footer,
// the grey gap between sheets, and the next page's header + top margin). Long paragraphs and lists are
// split across pages at a line boundary with widow/orphan control; tables and images move whole.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { HeaderFooter } from '../core/model';

const PT = 96 / 72;
export const PAGE_GAP_PX = 24;

export interface PageLayout {
  widthPt: number;
  heightPt: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  header: HeaderFooter;
  footer: HeaderFooter;
  zoom: number;
}

export interface PaginationInfo {
  pageCount: number;
  /** Document positions where a new page starts. */
  breaks: number[];
}

export interface PaginationOptions {
  getLayout: () => PageLayout;
  onChange?: (info: PaginationInfo) => void;
}

interface State {
  decos: DecorationSet;
  breaks: number[];
}

interface Break {
  pos: number;
  fill: number;
  offsetLeft: number;
}

interface Line {
  top: number;
  bottom: number;
  clientLeft: number;
  clientTop: number;
  clientBottom: number;
  block: HTMLElement;
}

export const paginationKey = new PluginKey<State>('pagination');

declare module '@tiptap/core' {
  interface Storage {
    pagination: { pageCount: number; breaks: number[]; run: () => void };
  }
}

const TEXTBLOCKS = 'p,h1,h2,h3,h4,h5,h6';
const SPLITTABLE = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote']);

function collectLines(dom: HTMLElement, pmTop: number, z: number): Line[] {
  const blocks = dom.matches(TEXTBLOCKS) ? [dom] : Array.from(dom.querySelectorAll<HTMLElement>(TEXTBLOCKS));
  const lines: Line[] = [];
  for (const block of blocks) {
    const range = document.createRange();
    range.selectNodeContents(block);
    const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0 && r.width >= 0);
    rects.sort((a, b) => a.top - b.top || a.left - b.left);
    const mine: Line[] = [];
    for (const r of rects) {
      const last = mine[mine.length - 1];
      // Glyph boxes of neighbouring lines overlap a little (line-height < content area), so a rect
      // only joins the current line if it starts well above that line's bottom.
      const tol = 0.4 * Math.min(last ? last.clientBottom - last.clientTop : 0, r.height);
      if (last && r.top < last.clientBottom - tol) {
        last.clientTop = Math.min(last.clientTop, r.top);
        last.clientBottom = Math.max(last.clientBottom, r.bottom);
        last.clientLeft = Math.min(last.clientLeft, r.left);
      } else {
        mine.push({ top: 0, bottom: 0, clientLeft: r.left, clientTop: r.top, clientBottom: r.bottom, block });
      }
    }
    if (!mine.length) {
      const r = block.getBoundingClientRect();
      mine.push({ top: 0, bottom: 0, clientLeft: r.left, clientTop: r.top, clientBottom: r.bottom, block });
    }
    for (const l of mine) {
      l.top = (l.clientTop - pmTop) / z;
      l.bottom = (l.clientBottom - pmTop) / z;
    }
    lines.push(...mine);
  }
  return lines;
}

function formatHF(hf: HeaderFooter, page: number, total: number): string {
  return hf.text.replace(/\{pages\}/g, String(total)).replace(/\{page\}/g, String(page));
}

function part(cls: string, heightPx: number): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.style.height = `${heightPx}px`;
  return el;
}

function hfPart(kind: 'head' | 'foot', layout: PageLayout, page: number, total: number): HTMLElement {
  const hf = kind === 'head' ? layout.header : layout.footer;
  const margin = kind === 'head' ? layout.marginTop : layout.marginBottom;
  const el = part(`pgw-${kind}`, margin * PT);
  el.dataset.kind = kind;
  const inner = document.createElement('div');
  inner.className = 'pgw-hf';
  inner.style.textAlign = hf.align;
  inner.style.padding = `0 ${layout.marginRight}pt 0 ${layout.marginLeft}pt`;
  const dist = Math.min(36, margin / 3);
  if (kind === 'head') inner.style.paddingTop = `${dist}pt`;
  else inner.style.paddingBottom = `${dist}pt`;
  inner.textContent = formatHF(hf, page, total);
  el.appendChild(inner);
  return el;
}

function createWidget(kind: 'start' | 'break' | 'end', layout: PageLayout, page: number, total: number, fillPx: number, offsetLeft: number): HTMLElement {
  const w = document.createElement('div');
  w.className = `pgw pgw-${kind}`;
  w.contentEditable = 'false';
  w.style.width = `${layout.widthPt}pt`;
  w.style.marginLeft = `-${offsetLeft}px`;
  if (kind === 'start') {
    w.appendChild(hfPart('head', layout, 1, total));
    return w;
  }
  if (fillPx > 0) w.appendChild(part('pgw-fill', fillPx));
  w.appendChild(hfPart('foot', layout, page, total));
  if (kind === 'break') {
    w.appendChild(part('pgw-gap', PAGE_GAP_PX));
    w.appendChild(hfPart('head', layout, page + 1, total));
  }
  return w;
}

function findSplit(view: EditorView, node: PMNode, offset: number, dom: HTMLElement, pageStart: number, Hc: number, pmTop: number, pmLeft: number, z: number, mlPx: number, blockTop: number) {
  const all = collectLines(dom, pmTop, z);
  const lines = all.filter((l) => l.top >= pageStart - 1);
  let idx = lines.findIndex((l) => l.bottom > pageStart + Hc + 0.5);
  if (idx <= 0) return null;
  const single = all.every((l) => l.block === all[0].block);
  const startsHere = blockTop >= pageStart - 1;
  if (single) {
    if (startsHere && idx < 2) return null; // orphan control
    const remaining = lines.length - idx;
    if (remaining < 2) {
      if (idx - 1 >= (startsHere ? 2 : 1)) idx -= 1; // widow control: take one more line along
      else return null;
    }
  }
  const l = lines[idx];
  const hit = view.posAtCoords({ left: l.clientLeft + 1, top: (l.clientTop + l.clientBottom) / 2 });
  if (!hit) return null;
  const pos = hit.pos;
  if (pos <= offset + 1 || pos >= offset + node.nodeSize - 1) return null;
  if (!view.state.doc.resolve(pos).parent.isTextblock) return null;
  const blockLeft = l.block.getBoundingClientRect().left;
  return { pos, lineTop: l.top, offsetLeft: (blockLeft - pmLeft) / z };
}

function measure(view: EditorView, layout: PageLayout) {
  const z = layout.zoom || 1;
  const pmRect = view.dom.getBoundingClientRect();
  const Hc = (layout.heightPt - layout.marginTop - layout.marginBottom) * PT;
  const mlPx = layout.marginLeft * PT;
  const breaks: Break[] = [];
  let pageStart = 0;
  let prevWasBreak = false;
  let lastBottom = 0;

  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom || dom.nodeType !== 1) return;
    const r = dom.getBoundingClientRect();
    const T = (r.top - pmRect.top) / z;
    const B = (r.bottom - pmRect.top) / z;
    const forced = prevWasBreak || !!node.attrs?.pageBreakBefore;
    prevWasBreak = node.type.name === 'pageBreak';
    lastBottom = B;

    if (forced && T > pageStart + 1) {
      breaks.push({ pos: offset, fill: Math.max(0, pageStart + Hc - T), offsetLeft: mlPx });
      pageStart = T;
    }

    let pushedWhole = false;
    let guard = 0;
    while (B > pageStart + Hc + 0.5 && guard++ < 500) {
      if (SPLITTABLE.has(node.type.name)) {
        const s = findSplit(view, node, offset, dom, pageStart, Hc, pmRect.top, pmRect.left, z, mlPx, T);
        if (s && s.lineTop > pageStart + 1) {
          breaks.push({ pos: s.pos, fill: Math.max(0, pageStart + Hc - s.lineTop), offsetLeft: s.offsetLeft });
          pageStart = s.lineTop;
          continue;
        }
      }
      if (!pushedWhole && T > pageStart + 1) {
        breaks.push({ pos: offset, fill: Math.max(0, pageStart + Hc - T), offsetLeft: mlPx });
        pageStart = T;
        pushedWhole = true;
        continue;
      }
      // Taller than a page and not splittable: let it overflow.
      pageStart += Hc;
    }
  });

  return { breaks, endFill: Math.max(0, pageStart + Hc - lastBottom) };
}

export const PaginationExtension = Extension.create<PaginationOptions, { pageCount: number; breaks: number[]; run: () => void }>({
  name: 'pagination',

  addOptions() {
    return {
      getLayout: () => ({
        widthPt: 612,
        heightPt: 792,
        marginTop: 72,
        marginBottom: 72,
        marginLeft: 72,
        marginRight: 72,
        header: { text: '', align: 'left' as const },
        footer: { text: '', align: 'center' as const },
        zoom: 1,
      }),
      onChange: undefined,
    };
  },

  addStorage() {
    return { pageCount: 1, breaks: [] as number[], run: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const storage = this.storage;

    return [
      new Plugin<State>({
        key: paginationKey,
        state: {
          init: () => ({ decos: DecorationSet.empty, breaks: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as State | undefined;
            if (meta) return meta;
            if (tr.docChanged) {
              return { decos: value.decos.map(tr.mapping, tr.doc), breaks: value.breaks.map((b) => tr.mapping.map(b)) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state)?.decos ?? DecorationSet.empty;
          },
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let running = false;

          const run = () => {
            if (view.isDestroyed || running) return;
            if (view.composing) {
              timer = setTimeout(run, 300);
              return;
            }
            if (!view.dom.offsetWidth) return;
            running = true;
            try {
              const layout = options.getLayout();
              const current = paginationKey.getState(view.state);
              if (current && current.decos !== DecorationSet.empty) {
                view.dispatch(view.state.tr.setMeta(paginationKey, { decos: DecorationSet.empty, breaks: [] }).setMeta('addToHistory', false));
              }
              const { breaks, endFill } = measure(view, layout);
              const total = breaks.length + 1;
              const decos: Decoration[] = [];
              decos.push(
                Decoration.widget(0, () => createWidget('start', layout, 1, total, 0, layout.marginLeft * PT), {
                  side: -1,
                  key: `start-${total}-${layout.header.text}-${layout.marginTop}-${layout.widthPt}`,
                }),
              );
              breaks.forEach((b, i) => {
                const page = i + 1;
                decos.push(
                  Decoration.widget(b.pos, () => createWidget('break', layout, page, total, b.fill, b.offsetLeft), {
                    side: -1,
                    key: `br-${page}-${total}-${Math.round(b.fill)}-${Math.round(b.offsetLeft)}-${layout.header.text}-${layout.footer.text}-${layout.marginTop}-${layout.marginBottom}-${layout.widthPt}`,
                  }),
                );
              });
              decos.push(
                Decoration.widget(view.state.doc.content.size, () => createWidget('end', layout, total, total, endFill, layout.marginLeft * PT), {
                  side: 1,
                  key: `end-${total}-${Math.round(endFill)}-${layout.footer.text}-${layout.marginBottom}-${layout.widthPt}`,
                }),
              );
              const positions = breaks.map((b) => b.pos);
              view.dispatch(
                view.state.tr.setMeta(paginationKey, { decos: DecorationSet.create(view.state.doc, decos), breaks: positions }).setMeta('addToHistory', false),
              );
              storage.pageCount = total;
              storage.breaks = positions;
              options.onChange?.({ pageCount: total, breaks: positions });
            } finally {
              running = false;
            }
          };

          const schedule = (delay: number) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(run, delay);
          };

          storage.run = () => schedule(0);
          const onLoad = () => schedule(60);
          view.dom.addEventListener('load', onLoad, true);
          document.fonts?.ready.then(() => schedule(0));
          schedule(0);

          return {
            update(v, prev) {
              if (!running && v.state.doc !== prev.doc) schedule(120);
            },
            destroy() {
              if (timer) clearTimeout(timer);
              view.dom.removeEventListener('load', onLoad, true);
            },
          };
        },
      }),
    ];
  },
});
