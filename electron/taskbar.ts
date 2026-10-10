// Keeps the Windows taskbar / shortcut icons in step with the active app style.
//
// What we learned the hard way (tested against the real taskbar):
//   * If the running app uses the SAME AppUserModelID as its installed Start Menu / Desktop shortcut, Windows draws the
//     *shortcut's* icon on the taskbar button and ignores BrowserWindow.setIcon(). So the running app uses its own
//     runtime id (below), which differs from the installer's id (electron-builder's appId).
//   * Setting an explicit "relaunch icon" (setAppDetails) makes the button stick to the first icon it was given, so we don't.
// With that, setIcon() updates the taskbar button live. We additionally rewrite the icon of every shortcut that launches
// this exe (Desktop, Start Menu, pinned) so they match too. All best effort: the app works the same if any of it fails.
import { app, nativeImage, shell, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Must NOT equal the installer's appId ("com.bncplayer.bncdocs"), see above. */
export const APP_USER_MODEL_ID = 'com.bncplayer.bncdocs.window';
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Wraps a PNG as a multi-size .ico (PNG-compressed entries, supported since Windows Vista). */
export function buildIco(png: Buffer): Buffer {
  const src = nativeImage.createFromBuffer(png);
  const entries = ICO_SIZES.map((s) => ({
    size: s,
    data: src.resize({ width: s, height: s, quality: 'best' }).toPNG(),
  }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size === 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size === 256 ? 0 : e.size, o + 1);
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

/** Writes <userData>/icons/<key>-<hash>.ico (the name changes with the picture so Windows never reuses a stale icon). */
export function writeIcoFile(png: Buffer, key: string): string {
  const dir = path.join(app.getPath('userData'), 'icons');
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash('sha1').update(png).digest('hex').slice(0, 8);
  const file = path.join(dir, `${key.replace(/[^\w.-]/g, '_')}-${hash}.ico`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, buildIco(png));
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.ico') && path.join(dir, f) !== file) fs.rmSync(path.join(dir, f), { force: true });
  }
  return file;
}

function shortcutFolders(): string[] {
  const appData = app.getPath('appData');
  const list = [
    app.getPath('desktop'),
    path.join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'Desktop'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'StartMenu'),
  ];
  // test hook: extra folders to scan (semicolon separated)
  if (process.env.BNC_SHORTCUT_DIRS) list.push(...process.env.BNC_SHORTCUT_DIRS.split(';').filter(Boolean));
  return list;
}

function findShortcuts(dir: string, depth = 0): string[] {
  let names: fs.Dirent[] = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    const full = path.join(dir, n.name);
    if (n.isFile() && n.name.toLowerCase().endsWith('.lnk')) out.push(full);
    else if (n.isDirectory() && depth < 1) out.push(...findShortcuts(full, depth + 1));
  }
  return out;
}

/** Points every shortcut that launches this exe at `ico`. Returns how many were changed. */
export function updateShortcutIcons(ico: string): number {
  const exe = path.resolve(process.execPath).toLowerCase();
  let changed = 0;
  for (const dir of shortcutFolders()) {
    for (const file of findShortcuts(dir)) {
      try {
        const sc = shell.readShortcutLink(file);
        if (!sc.target || path.resolve(sc.target).toLowerCase() !== exe) continue;
        if (sc.icon && path.resolve(sc.icon).toLowerCase() === ico.toLowerCase() && (sc.iconIndex ?? 0) === 0) continue;
        if (shell.writeShortcutLink(file, 'update', { target: sc.target, icon: ico, iconIndex: 0 })) changed++;
      } catch {
        /* not ours, or not writable (e.g. all-users folders without admin rights) */
      }
    }
  }
  return changed;
}

function refreshIconCache() {
  try {
    spawn('ie4uinit.exe', ['-show'], { stdio: 'ignore', windowsHide: true, detached: true }).on('error', () => {}).unref();
  } catch {
    /* ignore */
  }
}

/** Apply `png` as the icon of the window / taskbar button and of the shortcuts that launch this exe. */
export function applyIcon(win: BrowserWindow, png: Buffer, key: string) {
  const image = nativeImage.createFromBuffer(png);
  win.setIcon(image); // Windows / Linux (no effect on macOS)
  if (process.platform === 'darwin') {
    app.dock?.setIcon(image); // macOS: the Dock icon follows the app style
    return;
  }
  if (process.platform !== 'win32') return;
  try {
    const ico = writeIcoFile(png, key);
    if (!app.isPackaged && !process.env.BNC_SHORTCUT_DIRS) return; // dev runs have no shortcuts of their own
    if (updateShortcutIcons(ico) > 0) refreshIconCache();
  } catch (e) {
    console.warn('Could not update the shortcut icons:', e);
  }
}
