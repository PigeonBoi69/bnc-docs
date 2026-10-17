// Punctuation and simple writing checks for one paragraph of text. Rule based (no grammar engine):
// it finds typing slips, each with a ready fix. Pure functions, no DOM.
import { maskNonProse } from './words';

export interface PunctFix {
  label: string;
  /** replaces [start, end) of the issue */
  text: string;
}

export interface PunctIssue {
  start: number;
  end: number;
  rule: string;
  message: string;
  fixes: PunctFix[];
}

const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'no', 'nos', 'fig', 'figs', 'approx', 'cf', 'inc', 'ltd', 'co', 'dept', 'est',
  'min', 'max', 'ca', 'al', 'vol', 'pp', 'ed', 'eds', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'a.m', 'p.m', 'u.s',
  'u.k', 'ph.d', 'm.d', 'b.a', 'm.a', 'viz', 'ave', 'blvd', 'rd', 'mt', 'ft', 'gov', 'sen', 'rep', 'capt', 'col', 'gen', 'lt', 'sgt', 'rev', 'hon', 'op', 'ch', 'sec',
]);

const YOU_SOUND_O = /^(one|once)(?![a-z])/;
const SILENT_H = /^(hour|honest|honou?r|heir)/;

/** "an" or "a" for the word that follows, or null when it is not clear-cut (acronyms, u- words, x/y/h ...). */
function articleFor(word: string): 'a' | 'an' | null {
  if (word.length < 2) return null;
  if (/[\p{N}]/u.test(word)) return null;
  if (word === word.toUpperCase()) return null; // MBA, SQL: depends on how it is read out
  if (/\p{Ll}\p{Lu}/u.test(word)) return null;
  const w = word.toLowerCase();
  const c = w[0];
  if (c === 'u' || c === 'x' || c === 'y') return null;
  if (c === 'h') return SILENT_H.test(w) ? 'an' : null;
  if (c === 'o') return YOU_SOUND_O.test(w) ? 'a' : 'an';
  if (c === 'e') return /^(eu|ew)/.test(w) ? 'a' : 'an';
  if ('aeio'.includes(c)) return 'an';
  if (/[bcdfgjklmnpqrstvwz]/.test(c)) return 'a';
  return null;
}

/** Brackets and quotes that do not pair up inside the paragraph. */
function checkPairs(text: string, out: PunctIssue[]) {
  const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '“': '”' };
  const CLOSE = new Set([')', ']', '}', '”']);
  const stack: { ch: string; at: number }[] = [];
  let straight: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (ch === '"') {
      straight.push(i);
      continue;
    }
    if (ch in OPEN) {
      if (ch === '(' && /^[\p{L}\p{N}]{1,3}\)/u.test(text.slice(i + 1, i + 5)) && /^\s*$/.test(text.slice(0, i))) continue; // "(a) item"
      stack.push({ ch, at: i });
    } else if (CLOSE.has(ch)) {
      if (ch === ')' && (prev === ':' || prev === ';')) continue; // smiley
      const top = stack[stack.length - 1];
      if (top && OPEN[top.ch] === ch) stack.pop();
      else if (ch === ')' && /(?:^|\s)\(?[\p{L}\p{N}]{1,3}$/u.test(text.slice(0, i))) continue; // list marker "a)" or "1)"
      else
        out.push({ start: i, end: i + 1, rule: 'unmatched-close', message: `There is no opening bracket or quote for this "${ch}"`, fixes: [{ label: `Delete the "${ch}"`, text: '' }] });
    }
  }
  for (const s of stack) {
    const close = OPEN[s.ch];
    out.push({ start: s.at, end: s.at + 1, rule: 'unmatched-open', message: `"${s.ch}" is never closed with "${close}"`, fixes: [{ label: `Delete the "${s.ch}"`, text: '' }] });
  }
  if (straight.length % 2 === 1) {
    const at = straight[straight.length - 1];
    out.push({ start: at, end: at + 1, rule: 'unmatched-quote', message: 'This quotation mark has no partner', fixes: [{ label: 'Delete the quotation mark', text: '' }] });
  }
}

/** Check one paragraph (a text block). Offsets are into `text`. */
export function checkPunctuation(text: string): PunctIssue[] {
  if (!text.trim()) return [];
  const t = maskNonProse(text);
  const out: PunctIssue[] = [];
  const add = (start: number, end: number, rule: string, message: string, fixes: PunctFix[]) => out.push({ start, end, rule, message, fixes });

  // two or more spaces between words (two after a full stop is a typewriter habit and is left alone)
  for (const m of t.matchAll(/(?<=[^\s.!?:]) {2,}(?=\S)/g)) add(m.index!, m.index! + m[0].length, 'extra-space', 'Extra space between words', [{ label: 'Use a single space', text: ' ' }]);

  // space before , ; : ! ? .
  for (const m of t.matchAll(/(?<=\S) +(?=[,;:!?.](?![.\d]))/g)) {
    const after = t[m.index! + m[0].length];
    const next = t[m.index! + m[0].length + 1] ?? '';
    if (after === ':' && /^\s*\d/.test(t.slice(m.index! + m[0].length + 1, m.index! + m[0].length + 3))) continue; // ratios like 1 : 2
    if ((after === ':' || after === ';') && /[)(DPp]/.test(next) && !/[\p{L}\p{N}]/u.test(t[m.index! + m[0].length + 2] ?? '')) continue; // smileys
    add(m.index!, m.index! + m[0].length, 'space-before', `Remove the space before "${after}"`, [{ label: 'Remove the space', text: '' }]);
  }

  // missing space after a comma / semicolon / full stop / ! / ?
  for (const m of t.matchAll(/(?<=\p{L}),(?=\p{L})/gu)) add(m.index!, m.index! + 1, 'space-after', 'Add a space after the comma', [{ label: 'Add a space', text: ', ' }]);
  for (const m of t.matchAll(/(?<=\p{L});(?=\p{L})/gu)) add(m.index!, m.index! + 1, 'space-after', 'Add a space after the semicolon', [{ label: 'Add a space', text: '; ' }]);
  for (const m of t.matchAll(/(?<=\p{Ll}{2})([.!?])(?=\p{Lu}\p{Ll})/gu)) {
    const before = t.slice(0, m.index!).match(/(\S+)$/)?.[1]?.toLowerCase() ?? '';
    if (ABBREVIATIONS.has(before) || before.includes('.')) continue;
    add(m.index!, m.index! + 1, 'space-after', `Add a space after the "${m[1]}"`, [{ label: 'Add a space', text: `${m[1]} ` }]);
  }

  // doubled punctuation
  for (const m of t.matchAll(/,{2,}|;{2,}|:{2,}/g)) add(m.index!, m.index! + m[0].length, 'double-punct', 'Doubled punctuation', [{ label: `Use a single "${m[0][0]}"`, text: m[0][0] }]);
  for (const m of t.matchAll(/(?<![.\d])\.\.(?![.\d])/g)) add(m.index!, m.index! + 2, 'double-punct', 'Two full stops in a row', [{ label: 'Use one full stop', text: '.' }, { label: 'Use an ellipsis (...)', text: '...' }]);

  // spaces just inside brackets
  for (const m of t.matchAll(/(?<=[(\[]) +(?=\S)/g)) add(m.index!, m.index! + m[0].length, 'bracket-space', 'Remove the space after the opening bracket', [{ label: 'Remove the space', text: '' }]);
  for (const m of t.matchAll(/(?<=\S) +(?=[)\]])/g)) add(m.index!, m.index! + m[0].length, 'bracket-space', 'Remove the space before the closing bracket', [{ label: 'Remove the space', text: '' }]);

  // a repeated word
  for (const m of t.matchAll(/(?<![\p{L}\p{N}'’])(\p{L}+(?:['’]\p{L}+)?)(\s+)\1(?![\p{L}\p{N}'’])/giu)) {
    const first = m[1].length;
    add(m.index! + first, m.index! + m[0].length, 'repeated-word', `Repeated word: "${m[1]}"`, [{ label: `Delete the second "${m[1]}"`, text: '' }]);
  }

  // a sentence that starts with a small letter
  for (const m of t.matchAll(/([.!?])(["'”’)\]]*)(\s+)(\p{Ll})/gu)) {
    const idx = m.index!;
    if (t[idx - 1] === '.' || m[1] === '.' && t[idx + 1] === '.') continue; // ellipsis
    const before = t.slice(0, idx).match(/(\S+)$/)?.[1] ?? '';
    const lower = before.toLowerCase().replace(/^[("'“\[]+/, '');
    if (!lower) continue;
    if (m[1] === '.' && (ABBREVIATIONS.has(lower) || /^\d+$/.test(lower) || /^\p{L}$/u.test(lower) || /\p{L}\.\p{L}/u.test(lower))) continue;
    const at = idx + m[1].length + m[2].length + m[3].length;
    add(at, at + 1, 'capital', 'A sentence should start with a capital letter', [{ label: `Change to "${m[4].toUpperCase()}"`, text: m[4].toUpperCase() }]);
  }

  // lower case "i" on its own
  for (const m of t.matchAll(/(?<![\p{L}\p{N}_.'’(\-])i(['’](?:m|ll|ve|d))?(?![\p{L}\p{N}_'’\-])/gu)) {
    const end = m.index! + m[0].length;
    if (t[end] === '.' || t[end] === ')') continue; // "i.e.", "i)"
    add(m.index!, end, 'lowercase-i', 'The word "I" is always a capital letter', [{ label: `Change to "I${m[1] ?? ''}"`, text: `I${m[1] ?? ''}` }]);
  }

  // a / an
  for (const m of t.matchAll(/(?<![\p{L}\p{N}'’\-])(an?)(\s+)([\p{L}][\p{L}\p{N}'’\-]*)/giu)) {
    const want = articleFor(m[3]);
    if (!want) continue;
    const have = m[1].toLowerCase();
    if (want === have) continue;
    const fixed = matchArticle(m[1], want);
    add(m.index!, m.index! + m[1].length, 'a-an', `Use "${fixed}" before "${m[3]}"`, [{ label: `Change to "${fixed}"`, text: fixed }]);
  }

  checkPairs(t, out);

  // keep the first of any overlapping issues
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  const kept: PunctIssue[] = [];
  for (const i of out) if (!kept.length || i.start >= kept[kept.length - 1].end) kept.push(i);
  return kept;
}

function matchArticle(model: string, want: 'a' | 'an'): string {
  if (model === model.toUpperCase() && model.length > 1) return want.toUpperCase();
  return model[0] === model[0].toUpperCase() ? want[0].toUpperCase() + want.slice(1) : want;
}
