// Generates the BNC Docs app icon (open book) as SVG, PNG and ICO.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'build'), { recursive: true });
mkdirSync(join(root, 'public'), { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b7cf6"/>
      <stop offset="1" stop-color="#4a3fd1"/>
    </linearGradient>
    <linearGradient id="pageL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dcd9fb"/>
    </linearGradient>
    <linearGradient id="pageR" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dcd9fb"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- cover -->
  <path d="M96 150c0-10 8-18 18-18h86c32 0 56 12 56 12v250s-24-14-56-14h-86c-10 0-18-8-18-18z" fill="#2f2796" opacity=".55"/>
  <path d="M416 150c0-10-8-18-18-18h-86c-32 0-56 12-56 12v250s24-14 56-14h86c10 0 18-8 18-18z" fill="#2f2796" opacity=".55"/>
  <!-- pages -->
  <path d="M112 138c0-8 6-14 14-14h72c30 0 50 12 58 22v236c-14-10-34-18-58-18h-72c-8 0-14-6-14-14z" fill="url(#pageL)"/>
  <path d="M400 138c0-8-6-14-14-14h-72c-30 0-50 12-58 22v236c14-10 34-18 58-18h72c8 0 14-6 14-14z" fill="url(#pageR)"/>
  <!-- text lines -->
  <g stroke="#6c5fe0" stroke-width="12" stroke-linecap="round" opacity=".75">
    <path d="M148 190h74M148 232h74M148 274h74M148 316h50"/>
    <path d="M290 190h74M290 232h74M290 274h74M290 316h50"/>
  </g>
  <!-- bookmark ribbon -->
  <path d="M322 124h40v92l-20-14-20 14z" fill="#ffcf5c"/>
</svg>`;

writeFileSync(join(root, 'build', 'icon.svg'), svg);
writeFileSync(join(root, 'public', 'icon.svg'), svg);

const png = (size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
writeFileSync(join(root, 'build', 'icon.png'), await png(512));
writeFileSync(join(root, 'public', 'icon.png'), await png(256));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const ico = await pngToIco(await Promise.all(sizes.map(png)));
writeFileSync(join(root, 'build', 'icon.ico'), ico);

// macOS icon (.icns): a small container of PNGs. Types: icp4=16, icp5=32, icp6=64, ic07=128, ic08=256, ic09=512, ic10=1024.
const icnsEntries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];
const chunks = [];
for (const [type, size] of icnsEntries) {
  const data = await png(size);
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(8 + data.length, 4);
  chunks.push(head, data);
}
const body = Buffer.concat(chunks);
const icnsHead = Buffer.alloc(8);
icnsHead.write('icns', 0, 'ascii');
icnsHead.writeUInt32BE(8 + body.length, 4);
writeFileSync(join(root, 'build', 'icon.icns'), Buffer.concat([icnsHead, body]));

console.log('icons written to build/ and public/ (png, ico, icns)');
