import { readFileSync } from 'node:fs';
import { importDocx } from '../src/core/docx-import';
import { exportDocx } from '../src/core/docx-export';

// Dev tool: import each .docx, re-export it, import that again, and compare structure + text.
const count = (n: any, acc: Record<string, number> = {}) => {
  if (n.type && n.type !== 'text' && n.type !== 'doc') acc[n.type] = (acc[n.type] ?? 0) + 1;
  for (const c of n.content ?? []) count(c, acc);
  return acc;
};
const text = (n: any): string => (n.text ?? '') + (n.content ?? []).map(text).join(n.type === 'paragraph' || n.type === 'heading' ? '\n' : '');

async function main() {
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const name = f.split('\\').pop();
    try {
      const a = await importDocx(readFileSync(f));
      const out = await exportDocx(a.doc, a.meta);
      const b = await importDocx(out);
      const ca = count(a.doc);
      const cb = count(b.doc);
      const same = JSON.stringify(Object.entries(ca).sort()) === JSON.stringify(Object.entries(cb).sort());
      const ta = text(a.doc).replace(/\s+/g, ' ').trim();
      const tb = text(b.doc).replace(/\s+/g, ' ').trim();
      const ok = same && ta === tb;
      if (!ok) bad++;
      console.log(ok ? 'OK  ' : 'DIFF', name, JSON.stringify(ca), ok ? '' : `\n   after: ${JSON.stringify(cb)}\n   textMatch=${ta === tb} (${ta.length} vs ${tb.length})`);
    } catch (e: any) {
      bad++;
      console.log('FAIL', name, e.message);
    }
  }
  console.log(`\n${bad} of ${process.argv.length - 2} files had differences`);
}
main();
