import { describe, expect, it } from 'vitest';
import { exportDocx } from '../src/core/docx-export';
import { importDocx } from '../src/core/docx-import';
import { loadBncdoc, saveBncdoc } from '../src/core/bncdoc';
import { defaultMeta, JSONNode } from '../src/core/model';

// 1x1 transparent PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const p = (text: string, marks: any[] = [], attrs: any = {}): JSONNode => ({
  type: 'paragraph',
  attrs,
  content: [{ type: 'text', text, marks }],
});

const sample = (): JSONNode => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
    p('Bold and italic', [{ type: 'bold' }, { type: 'italic' }]),
    p('Sized red text', [{ type: 'textStyle', attrs: { fontSize: '18pt', color: '#FF0000', fontFamily: 'Arial' } }]),
    p('Centered', [], { textAlign: 'center', spaceAfter: 20 }),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p('one')] },
        {
          type: 'listItem',
          content: [p('two'), { type: 'orderedList', attrs: { start: 1, type: 'a' }, content: [{ type: 'listItem', content: [p('nested')] }] }],
        },
      ],
    },
    { type: 'orderedList', attrs: { start: 3, type: '1' }, content: [{ type: 'listItem', content: [p('three')] }] },
    {
      type: 'table',
      attrs: { bordered: true },
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 2, colwidth: [100] }, content: [p('A')] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [100], backgroundColor: '#FFFF00' }, content: [p('B')] },
          ],
        },
        { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [100] }, content: [p('C')] }] },
      ],
    },
    { type: 'pageBreak' },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        { type: 'image', attrs: { src: PNG, width: 72, height: 36 } },
      ],
    },
  ],
});

const textOf = (n: JSONNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('|');

describe('docx roundtrip', () => {
  it('exports a valid docx and imports it back with structure intact', async () => {
    const meta = defaultMeta();
    meta.page.width = 595.3;
    meta.page.height = 841.9;
    meta.header = { text: 'My header', align: 'right' };
    meta.footer = { text: 'Page {page} of {pages}', align: 'center' };
    const bytes = await exportDocx(sample(), meta);
    expect(bytes.length).toBeGreaterThan(1000);

    const { doc, meta: m2 } = await importDocx(bytes);
    const types = doc.content!.map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('bulletList');
    expect(types).toContain('orderedList');
    expect(types).toContain('table');
    expect(types).toContain('pageBreak');

    const h = doc.content!.find((n) => n.type === 'heading')!;
    expect(h.attrs!.level).toBe(1);
    expect(textOf(h)).toContain('Hello World');

    const flat = JSON.stringify(doc);
    expect(flat).toContain('"bold"');
    expect(flat).toContain('"italic"');
    expect(flat).toContain('18pt');
    expect(flat).toContain('#FF0000');
    expect(flat).toContain('https://example.com');
    expect(flat).toContain('"image"');
    expect(flat).toContain('nested');

    const table = doc.content!.find((n) => n.type === 'table')!;
    const firstCell = table.content![0].content![0];
    expect(firstCell.attrs!.rowspan).toBe(2);
    expect(table.content![1].content!.length).toBe(1);
    expect(table.attrs!.bordered).toBe(true);

    const ol = doc.content!.filter((n) => n.type === 'orderedList').pop()!;
    expect(ol.attrs!.start).toBe(3);

    expect(Math.round(m2.page.width)).toBe(595);
    expect(m2.header.text).toBe('My header');
    expect(m2.header.align).toBe('right');
    expect(m2.footer.text).toBe('Page {page} of {pages}');
  });
});

describe('bncdoc roundtrip', () => {
  it('stores images as media and restores them', async () => {
    const meta = defaultMeta();
    meta.title = 'T';
    const bytes = await saveBncdoc(sample(), meta);
    const { doc, meta: m2 } = await loadBncdoc(bytes);
    expect(m2.title).toBe('T');
    expect(JSON.stringify(doc)).toContain(PNG);
    expect(JSON.stringify(doc)).not.toContain('media/image');
  });
});
