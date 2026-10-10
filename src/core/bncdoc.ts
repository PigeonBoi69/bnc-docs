// The native .bncdoc format: a zip package.
//   mimetype        application/vnd.bnc.doc+zip
//   manifest.json   { format, version, app, created, modified }
//   content.json    ProseMirror/TipTap document JSON (images reference media/…)
//   meta.json       page setup, defaults, header/footer, title, author
//   media/…         embedded images as binary files
// Open, documented, and trivially readable with any zip tool + JSON parser.
import JSZip from 'jszip';
import { DocMeta, JSONNode, normalizeMeta } from './model';

export const BNCDOC_MIME = 'application/vnd.bnc.doc+zip';
export const BNCDOC_VERSION = 1;

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function saveBncdoc(doc: JSONNode, meta: DocMeta): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', BNCDOC_MIME, { compression: 'STORE' });
  const media = new Map<string, string>(); // data URI -> path
  let n = 0;

  const walk = (node: JSONNode): JSONNode => {
    const copy: JSONNode = { ...node };
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.startsWith('data:')) {
      const uri: string = node.attrs.src;
      let path = media.get(uri);
      if (!path) {
        const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
        if (m) {
          path = `media/image${++n}.${EXT[m[1]] ?? 'bin'}`;
          zip.file(path, b64ToBytes(m[2]));
          media.set(uri, path);
        }
      }
      if (path) copy.attrs = { ...node.attrs, src: path };
    }
    if (node.content) copy.content = node.content.map(walk);
    return copy;
  };

  const content = walk(doc);
  const now = new Date().toISOString();
  zip.file(
    'manifest.json',
    JSON.stringify({ format: 'bncdoc', version: BNCDOC_VERSION, app: 'BNC Docs', created: meta.created, modified: now }, null, 2),
  );
  zip.file('meta.json', JSON.stringify({ ...meta, modified: now }, null, 2));
  zip.file('content.json', JSON.stringify(content));
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function loadBncdoc(data: Uint8Array | ArrayBuffer): Promise<{ doc: JSONNode; meta: DocMeta }> {
  const zip = await JSZip.loadAsync(data);
  const manifest = zip.file('manifest.json');
  const contentFile = zip.file('content.json');
  if (!manifest || !contentFile) throw new Error('This is not a valid .bncdoc file.');
  const info = JSON.parse(await manifest.async('string'));
  if (info.format !== 'bncdoc') throw new Error('This is not a valid .bncdoc file.');
  if (info.version > BNCDOC_VERSION) throw new Error('This document was made with a newer version of BNC Docs. Please update the app.');

  const doc: JSONNode = JSON.parse(await contentFile.async('string'));
  const metaFile = zip.file('meta.json');
  const meta = normalizeMeta(metaFile ? JSON.parse(await metaFile.async('string')) : null);

  const cache = new Map<string, string>();
  const walk = async (node: JSONNode): Promise<void> => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.startsWith('media/')) {
      const path: string = node.attrs.src;
      let uri = cache.get(path);
      if (!uri) {
        const f = zip.file(path);
        if (f) {
          const mime = MIME_BY_EXT[path.split('.').pop() ?? ''] ?? 'application/octet-stream';
          uri = `data:${mime};base64,${await f.async('base64')}`;
          cache.set(path, uri);
        }
      }
      if (uri) node.attrs = { ...node.attrs, src: uri };
    }
    for (const c of node.content ?? []) await walk(c);
  };
  await walk(doc);
  return { doc, meta };
}
