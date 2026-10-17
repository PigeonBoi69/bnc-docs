import { describe, expect, it } from 'vitest';
import { findWords, matchCase } from '../src/core/proof/words';
import { checkPunctuation } from '../src/core/proof/punctuation';
import { autocorrectWord, capitalizeI } from '../src/core/proof/autocorrect';
import { Speller, dictionaryForLocale } from '../src/core/proof/speller';

/** The text after applying every first fix of every issue (from the end, so offsets stay valid). */
function fixAll(text: string): string {
  let out = text;
  for (const i of [...checkPunctuation(text)].reverse()) if (i.fixes.length) out = out.slice(0, i.start) + i.fixes[0].text + out.slice(i.end);
  return out;
}
const rules = (t: string) => checkPunctuation(t).map((i) => i.rule);

describe('findWords', () => {
  it('finds plain words and keeps apostrophes inside them', () => {
    expect(findWords("It's Brock's dog").map((w) => w.word)).toEqual(["It's", "Brock's", 'dog']);
  });
  it('skips acronyms, camelCase, numbers, single letters and other scripts', () => {
    expect(findWords('NASA iPhone abc123 x привет 日本語 word').map((w) => w.word)).toEqual(['word']);
  });
  it('skips web addresses, e-mail addresses and file names', () => {
    expect(findWords('see https://exampel.com/pgae or me@exampel.com and report.pdf now').map((w) => w.word)).toEqual(['see', 'or', 'and', 'now']);
  });
  it('reports correct offsets', () => {
    const t = 'one  two';
    const [a, b] = findWords(t);
    expect(t.slice(a.start, a.end)).toBe('one');
    expect(t.slice(b.start, b.end)).toBe('two');
  });
  it('matchCase copies the capitalisation', () => {
    expect(matchCase('Teh', 'the')).toBe('The');
    expect(matchCase('TEH', 'the')).toBe('THE');
    expect(matchCase('teh', 'the')).toBe('the');
  });
});

describe('checkPunctuation', () => {
  it('finds nothing wrong in clean text', () => {
    expect(checkPunctuation('Hello, world. This is "fine" (really)! Visit https://a.com/x,y now; e.g. today, 1,000 times at 10:30.')).toEqual([]);
  });
  it('extra spaces and spaces before punctuation', () => {
    expect(fixAll('Hello  world , again .')).toBe('Hello world, again.');
    expect(rules('Hello  world')).toEqual(['extra-space']);
  });
  it('leaves two spaces after a full stop alone', () => {
    expect(checkPunctuation('One.  Two.')).toEqual([]);
  });
  it('missing space after a comma or full stop', () => {
    expect(fixAll('red,green and blue')).toBe('red, green and blue');
    expect(fixAll('It ended.Then it began')).toBe('It ended. Then it began');
    expect(checkPunctuation('Version 2.5 of node.js and 1,000')).toEqual([]);
  });
  it('capital letter after a sentence end, but not after abbreviations or ellipses', () => {
    expect(fixAll('It ended. then it began')).toBe('It ended. Then it began');
    expect(rules('Is it? yes it is')).toEqual(['capital']);
    expect(checkPunctuation('Use e.g. apples, etc. and so on. Dr. smith said wait... maybe 3. later')).toEqual([]);
  });
  it('the word I', () => {
    expect(fixAll("i think i'm right and i.e. fine")).toBe("I think I'm right and i.e. fine");
    expect(checkPunctuation('list item (i) and i) too')).toEqual([]);
  });
  it('repeated words', () => {
    expect(fixAll('This is is a test')).toBe('This is a test');
    expect(fixAll('The the end')).toBe('The end');
    expect(checkPunctuation('This is a test of the system')).toEqual([]);
  });
  it('doubled punctuation', () => {
    expect(fixAll('Wait,, what;; no')).toBe('Wait, what; no');
    expect(fixAll('The end..')).toBe('The end.');
    expect(checkPunctuation('Wait... what')).toEqual([]);
  });
  it('a / an', () => {
    expect(fixAll('a apple and an banana')).toBe('an apple and a banana');
    expect(fixAll('A hour later')).toBe('An hour later');
    expect(checkPunctuation('a unit, an hour, a one-off, an MBA, a European, an honest man, a user, an umbrella, an X-ray')).toEqual([]);
  });
  it('brackets and quotes that do not pair up', () => {
    expect(rules('Some (text here')).toEqual(['unmatched-open']);
    expect(rules('Some text) here')).toEqual(['unmatched-close']);
    expect(rules('He said "hello')).toEqual(['unmatched-quote']);
    expect(checkPunctuation('Fine (nested [ok] ones) and "quoted" text :) done')).toEqual([]);
    expect(checkPunctuation('a) first b) second')).toEqual([]);
  });
  it('space just inside brackets', () => {
    expect(fixAll('This ( odd ) text')).toBe('This (odd) text');
  });
});

describe('autocorrect', () => {
  it('fixes known typos and keeps the capitalisation', () => {
    expect(autocorrectWord('teh')).toBe('the');
    expect(autocorrectWord('Teh')).toBe('The');
    expect(autocorrectWord('RECIEVE')).toBe('RECEIVE');
    expect(autocorrectWord('dont')).toBe("don't");
  });
  it('leaves real words alone', () => {
    for (const w of ['the', 'quiet', 'loose', 'were', 'cant', 'well']) expect(autocorrectWord(w)).toBeNull();
  });
  it('capitalizes I', () => {
    expect(capitalizeI('i')).toBe('I');
    expect(capitalizeI("i'm")).toBe("I'm");
    expect(capitalizeI('in')).toBeNull();
  });
});

describe('speller', () => {
  it('picks a dictionary for a locale', () => {
    expect(dictionaryForLocale('en-AU')).toBe('en-AU');
    expect(dictionaryForLocale('en-GB')).toBe('en-GB');
    expect(dictionaryForLocale('de-DE')).toBe('en-US');
    expect(dictionaryForLocale(undefined)).toBe('en-US');
  });
  it('checks words, offers suggestions and remembers words', async () => {
    const sp = await Speller.load('en-US', ['Hobart']);
    expect(sp.isCorrect('hello')).toBe(true);
    expect(sp.isCorrect("don't")).toBe(true);
    expect(sp.isCorrect('don’t')).toBe(true);
    expect(sp.isCorrect("Brock's")).toBe(true);
    expect(sp.isCorrect('Hobart')).toBe(true);
    expect(sp.isCorrect('recieve')).toBe(false);
    expect(sp.isCorrect('colour')).toBe(false);
    expect(sp.suggest('recieve')[0]).toBe('receive');
    expect(sp.suggest('Definately')[0]).toBe('Definitely');
    expect(sp.suggest('wich')[0]).toBe('which');
    sp.addCustom('Zorblax');
    expect(sp.isCorrect('Zorblax')).toBe(true);
    sp.removeCustom('Zorblax');
    expect(sp.isCorrect('Zorblax')).toBe(false);
    sp.ignoreAll('Flurbo');
    expect(sp.isCorrect('flurbo')).toBe(true);
  });
  it('knows the spelling differences between the dictionaries', async () => {
    const au = await Speller.load('en-AU');
    const us = await Speller.load('en-US');
    expect(au.isCorrect('colour')).toBe(true);
    expect(us.isCorrect('colour')).toBe(false);
    expect(us.isCorrect('color')).toBe(true);
    expect(au.isCorrect('color')).toBe(false);
  });
});
