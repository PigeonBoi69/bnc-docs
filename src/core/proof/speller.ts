// The spell checker: Hunspell dictionaries (the same engine and word lists LibreOffice uses) through nspell,
// running inside the app, so it works offline and gives the same answers on Windows, macOS and Linux.
import nspell from 'nspell';
import { knownTypo } from './autocorrect';
import { matchCase } from './words';

export type DictId = 'en-US' | 'en-GB' | 'en-AU';

export const DICTIONARIES: { id: DictId; label: string }[] = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-AU', label: 'English (Australia)' },
];

type Loader = () => Promise<[string, string]>;

// Each dictionary is its own lazily loaded chunk (about 0.5 MB of text), so only the chosen one is ever read.
const LOADERS: Record<DictId, Loader> = {
  'en-US': async () => [(await import('../../../node_modules/dictionary-en/index.aff?raw')).default, (await import('../../../node_modules/dictionary-en/index.dic?raw')).default],
  'en-GB': async () => [(await import('../../../node_modules/dictionary-en-gb/index.aff?raw')).default, (await import('../../../node_modules/dictionary-en-gb/index.dic?raw')).default],
  'en-AU': async () => [(await import('../../../node_modules/dictionary-en-au/index.aff?raw')).default, (await import('../../../node_modules/dictionary-en-au/index.dic?raw')).default],
};

/** Best dictionary for a locale such as "en-AU" (used until the user picks one). */
export function dictionaryForLocale(locale: string | undefined): DictId {
  const l = (locale ?? '').toLowerCase();
  if (l === 'en-au') return 'en-AU';
  if (/^en-(gb|ie|nz|za|in|sg)/.test(l)) return 'en-GB';
  return 'en-US';
}

export class Speller {
  private sp: ReturnType<typeof nspell>;
  private session = new Set<string>();
  private suggestCache = new Map<string, string[]>();
  /** word -> is it correct; a big document asks about the same few thousand words over and over */
  private memo = new Map<string, boolean>();

  private constructor(readonly id: DictId, aff: string, dic: string, custom: Iterable<string>) {
    this.sp = nspell(aff, dic);
    for (const w of custom) this.sp.add(w);
  }

  static async load(id: DictId, custom: Iterable<string> = []): Promise<Speller> {
    const [aff, dic] = await LOADERS[id]();
    return new Speller(id, aff, dic, custom);
  }

  /** Is this word spelt correctly (or ignored / in the custom dictionary)? */
  isCorrect(word: string): boolean {
    const known = this.memo.get(word);
    if (known !== undefined) return known;
    const w = word.replace(/’/g, "'");
    let ok = this.session.has(w.toLowerCase()) || this.sp.correct(w);
    if (!ok) {
      // a possessive of a word the dictionary knows ("Brock's", "Hobart's")
      const poss = /^(.+)'s$/i.exec(w);
      ok = !!poss && this.sp.correct(poss[1]);
    }
    if (this.memo.size > 50000) this.memo.clear();
    this.memo.set(word, ok);
    return ok;
  }

  /** Suggestions, best first (known typos before the dictionary's guesses). */
  suggest(word: string): string[] {
    const key = word;
    const hit = this.suggestCache.get(key);
    if (hit) return hit;
    const w = word.replace(/’/g, "'");
    const out: string[] = [];
    const typo = knownTypo(w);
    if (typo && !typo.includes(' ')) out.push(typo);
    for (const s of this.sp.suggest(w)) {
      const fixed = matchCase(w, s);
      if (!out.includes(fixed)) out.push(fixed);
      if (out.length >= 8) break;
    }
    if (this.suggestCache.size > 500) this.suggestCache.clear();
    this.suggestCache.set(key, out);
    return out;
  }

  /** Remember a word for good (the caller stores it in the settings). */
  addCustom(word: string) {
    this.sp.add(word);
    this.suggestCache.clear();
    this.memo.clear();
  }

  removeCustom(word: string) {
    this.sp.remove(word);
    this.suggestCache.clear();
    this.memo.clear();
  }

  /** "Ignore All": accept the word for this session only. */
  ignoreAll(word: string) {
    this.session.add(word.replace(/’/g, "'").toLowerCase());
    this.memo.clear();
  }

  clearIgnored() {
    this.session.clear();
    this.memo.clear();
  }
}
