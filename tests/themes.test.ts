import { beforeAll, describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { installTheme, loadThemes, parseTheme, removeTheme } from '../electron/themes';

// The real plugins live in their own repository (bnc-plugins). These tests build small themes in memory instead.
const PNG_MAGIC = 0x89504e47;
/** Not a picture, but it starts with the PNG signature, which is all the reader checks. */
const fakePng = (label: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);

async function makeTheme(id: string, accent: string, extra: Record<string, unknown> = {}) {
  const zip = new JSZip();
  zip.file(
    'data.json',
    JSON.stringify({
      id,
      name: id,
      version: '1.0.0',
      type: 'theme',
      apiVersion: 1,
      colors: { accent, accentInk: '#04210f', swatch: [accent, '#084c28'] },
      apps: { 'bnc-ambient': { icon: 'bnc-ambient/icon.png' }, 'bnc-docs': { icon: 'bnc-docs/icon.png' } },
      ...extra,
    }),
  );
  zip.file('bnc-ambient/icon.png', fakePng(`${id}-ambient`));
  zip.file('bnc-docs/icon.png', fakePng(`${id}-docs`));
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

let green: Buffer;
let red: Buffer;
beforeAll(async () => {
  green = await makeTheme('sample.green', '#3ddc84');
  red = await makeTheme('sample.red', '#ff4d5a');
});

describe('.bnctheme reader', () => {
  it('reads a theme for bnc-docs', () => {
    const t = parseTheme(green, 'bnc-docs');
    expect(t.appliesHere).toBe(true);
    expect(t.id).toBe('sample.green');
    expect(t.accent).toBe('#3ddc84');
    expect(t.accentRgb).toBe('61, 220, 132');
    expect(t.accentInk).toBe('#04210f');
    expect(t.swatch).toEqual(['#3ddc84', '#084c28']);
    expect(t.apps).toEqual(['bnc-ambient', 'bnc-docs']);
    expect(t.iconPng!.readUInt32BE(0)).toBe(PNG_MAGIC);
  });

  it('keeps themes apart', () => {
    const r = parseTheme(red, 'bnc-docs');
    const g = parseTheme(green, 'bnc-docs');
    expect(r.accent).toBe('#ff4d5a');
    expect(r.iconPng!.equals(g.iconPng!)).toBe(false);
  });

  it('picks the right icon per app', () => {
    const docs = parseTheme(red, 'bnc-docs').iconPng!;
    const amb = parseTheme(red, 'bnc-ambient').iconPng!;
    expect(docs.equals(amb)).toBe(false);
  });

  it('says "not for this app" when the theme has nothing for bnc-docs', async () => {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify({ id: 'other.style', name: 'Other', apps: { 'bnc-sheets': { colors: { accent: '#112233' } } } }));
    const t = parseTheme(Buffer.from(await zip.generateAsync({ type: 'uint8array' })), 'bnc-docs');
    expect(t.appliesHere).toBe(false);
  });

  it('rejects garbage with a readable message', () => {
    expect(() => parseTheme(Buffer.from('not a zip at all, definitely not'), 'bnc-docs')).toThrow(/zip/);
  });
});

describe('plugins folder', () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bncdocs-plugins-'))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('installs, lists, updates and removes', () => {
    const a = installTheme(green, 'green.bnctheme', dir);
    expect(a.replaced).toBe(false);
    installTheme(red, 'red.bnctheme', dir);
    expect(loadThemes(dir).themes.map((t) => t.id).sort()).toEqual(['sample.green', 'sample.red']);
    const again = installTheme(green, 'green.bnctheme', dir);
    expect(again.replaced).toBe(true);
    expect(removeTheme('sample.green', dir)).toBe(true);
    expect(loadThemes(dir).themes.map((t) => t.id)).toEqual(['sample.red']);
  });

  it('refuses visualizers and other file types', () => {
    expect(() => installTheme(Buffer.from('x'), 'a.bncvis', dir)).toThrow(/visualizer/);
    expect(() => installTheme(Buffer.from('x'), 'a.txt', dir)).toThrow(/Unsupported/);
  });
});
