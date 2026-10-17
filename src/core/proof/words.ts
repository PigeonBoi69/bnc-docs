// Finding the words that should be spell-checked in a piece of text. Pure functions, no DOM.

export interface WordSpan {
  start: number;
  end: number;
  word: string;
}

/** Things that look like words but are not: web addresses, e-mail addresses, file names, Windows paths. */
const NOT_PROSE = /(?:https?:\/\/|ftp:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|edu|gov|io|au|uk|us|co|app|dev|html?|css|js|ts|json|txt|docx?|xlsx?|pptx?|pdf|png|jpe?g|gif|zip|exe|md)\b|[A-Za-z]:\\\S+/gi;

/** Replace everything that is not prose by "_" (same length, so offsets stay valid). */
export function maskNonProse(text: string): string {
  return text.replace(NOT_PROSE, (m) => '_'.repeat(m.length));
}

const TOKEN = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const LATIN = /^[\p{Script=Latin}\p{M}'’]+$/u;

/** Words worth checking: letters only, Latin script, not an ACRONYM, not camelCase, at least two letters. */
export function findWords(text: string): WordSpan[] {
  const masked = maskNonProse(text);
  const out: WordSpan[] = [];
  for (const m of masked.matchAll(TOKEN)) {
    const word = m[0];
    const start = m.index!;
    if (word.length < 2) continue;
    if (/[\p{N}_]/u.test(word)) continue;
    if (!LATIN.test(word)) continue;
    if (word === word.toUpperCase()) continue; // NASA, USB, ...
    if (/\p{Ll}\p{Lu}/u.test(word)) continue; // iPhone, McDonald, camelCase
    out.push({ start, end: start + word.length, word: text.slice(start, start + word.length) });
  }
  return out;
}

/** Same word with the case pattern of `model` (Hello -> Goodbye, HELLO -> GOODBYE, hello -> goodbye). */
export function matchCase(model: string, word: string): string {
  if (model.length > 1 && model === model.toUpperCase() && model !== model.toLowerCase()) return word.toUpperCase();
  if (model[0] && model[0] !== model[0].toLowerCase()) return word.charAt(0).toUpperCase() + word.slice(1);
  return word;
}
