# BNC Docs

An open-source word processor in the spirit of Microsoft Word: ribbon UI, real paginated pages,
headers/footers, tables, images, lists, styles, find & replace, and **high-fidelity `.docx` import/export**.
It connects to **Nextcloud** so you can open and save documents straight from your own cloud.

> Status: **pre-release** (v0.1.x) for Windows, macOS and Linux. A web version shares the same editor and
> file-format code (`src/core`, `src/editor`, `src/ui`).

## Download

Installers for Windows, macOS and Linux are on the **[Releases page](https://github.com/PigeonBoi69/bnc-docs/releases)**.
While the app is a pre-release, GitHub's "latest release" link does not point to it, so open the Releases page and pick the newest version.
The installers are not code-signed yet, so Windows and macOS show a warning the first time; each release's notes explain how to continue.

## Features

- Ribbon with Home / Insert / Layout / References / Review / View / Help tabs (+ a contextual Table tab), in two styles you can switch between (File > Ribbon style, or the arrow at the right of the tabs): **Classic** (labelled groups, large buttons) and **Simplified** (one compact row; what does not fit moves into a ... menu)
- True page view: page size & margins, orientation, page colour, repeating header/footer with `{page}` / `{pages}`,
  paragraphs split across pages with widow/orphan control, page breaks
- Fonts, sizes, bold/italic/underline/strike, super/subscript, colours, highlight, case, clear formatting
- Paragraph formatting: alignment, line spacing, spacing before/after, indents, shading, bulleted & numbered lists (1, a, A, i, I)
- Styles: Normal, No Spacing, Title, Subtitle, Heading 1-6, Quote, Intense Quote
- Tables (merge/split, shading, borders, resizing), pictures (paste / drag & drop / resize), links, table of contents, symbols, emoji
- Find & replace, word count, navigation pane, ruler, zoom, reading view, dark/light theme, spell check (right-click for suggestions)
- Command search (`Alt+Q`) and the usual shortcuts

## File formats

| Format | Open | Save / Export |
| --- | --- | --- |
| `.docx` (Word) | yes | yes |
| `.bncdoc` (native) | yes | yes |
| `.md` Markdown | yes | yes |
| `.html` | yes | yes |
| `.txt` | yes | yes |
| `.rtf` | – | yes |
| `.pdf` | – | yes (export + print) |

`.docx` import reads the WordprocessingML package directly (styles with inheritance, theme fonts/colours, numbering,
tables with merged cells and shading, inline images, hyperlinks, headers/footers, page setup). It is not a pixel-perfect clone of
Word's layout engine; see *Known limitations*.

The native **`.bncdoc`** format is a zip containing JSON — see [docs/BNCDOC-FORMAT.md](docs/BNCDOC-FORMAT.md).

## Nextcloud

`File > Nextcloud account` (or the **Nextcloud** button) signs you in with Nextcloud's *Login Flow v2*: your browser opens,
you approve BNC Docs, and Nextcloud hands the app a revocable **app password**. No password is ever typed into BNC Docs
(manual app-password entry is also available). The app password is encrypted with the OS keychain (Electron `safeStorage`).

Open and save over WebDAV, with a folder browser, ETag conflict detection and optional AutoSave.

## Plugins: app styles (`.bnctheme`)

BNC Docs reads the same `.bnctheme` app styles as BNC Ambient (a zip with `data.json` plus an icon per app). A style recolors the
whole app and swaps the app logo and the window/taskbar icon. BNC Docs reads only its own entry (`"bnc-docs"`) and ignores the rest;
a style with no `bnc-docs` entry and no shared colors is listed as "Not for BNC Docs".

- **Install:** `View > App Color > Plugins…` (or `File > Plugins…`, or the `Alt+Q` search) then **Install plugin…**, or just drag a
  `.bnctheme` file onto the window.
- **Get styles:** ready-made colours (red, orange, yellow, green, blue, pink, purple, brown, black, grey) live in their own repository,
  **[bnc-plugins](https://github.com/PigeonBoi69/bnc-plugins)**, shared by all the BNC apps. Download a `.bnctheme` file from there and install it as above.
  Plugins are not part of this repository.
- **Use:** pick it under `View > App Color` or `File > App color`. Styles can be switched off or removed in the Plugins window.
- **Where they live:** the `plugins` folder inside the app's user-data folder (**Open plugins folder** in the Plugins window).
- **Code:** `electron/themes.ts` (reader, a port of BNC Ambient's `bnctheme.js` + `zip.js`, and install/list/remove),
  `src/ui/styles.ts` (applying a style and the Plugins window). Colors are applied through the CSS variables
  `--accent`, `--accent-rgb`, `--accent-ink`, `--accent-soft`.
- A style tints the whole app (backgrounds, ribbon, borders) using its dark swatch colour in dark mode and its accent in light mode.
- **Taskbar icon:** the running app deliberately uses its own Windows taskbar id (`com.bncplayer.bncdocs.window`, see `electron/taskbar.ts`),
  different from the installer's. If both were the same, Windows would show the Start Menu shortcut's icon on the taskbar and ignore the
  window icon, so the icon could never follow a style. Desktop / Start Menu / pinned shortcuts that launch the installed exe are rewritten to the
  style's icon too. If you pin BNC Docs, pin it from the running window.
- Not supported: visualizer plugins (`.bncvis`), which don't apply to a word processor. Desktop/Start Menu shortcut icons keep the default icon
  (the running window and taskbar icon do change).

## Linux (Ubuntu / Debian)

The same app, built for Linux. Two files in `release-linux\` (built from Windows with `.\tools\build-linux.ps1`, which uses Docker Desktop):

| File | Use |
| --- | --- |
| `BNC-Docs-<version>-amd64.deb` | Installer for Ubuntu 22.04+ / Debian. `sudo apt install ./BNC-Docs-<version>-amd64.deb` (adds the Start-menu entry, icon and `.bncdoc` file type; `sudo apt remove bnc-docs` uninstalls) |
| `BNC-Docs-<version>-x86_64.AppImage` | Portable single file, no install. `chmod +x BNC-Docs-<version>-x86_64.AppImage` then double-click it or run it |

The `.deb` recommends the Carlito, Caladea and Liberation fonts so Word documents that use Calibri, Cambria or Arial lay out like they do in Word.
It is the same code as Windows (editor, `.docx`, Nextcloud, plugins/app colours). `.docx`, Markdown, HTML and text are listed under "Open With" but BNC Docs does not take over as the default.

```powershell
.\tools\build-linux.ps1                       # build the .deb + AppImage (Docker Desktop must be running)
.\tools\linux-smoke.ps1 -Document x.docx      # install the .deb in a clean Ubuntu container, run it and screenshot it
.\tools\linux-smoke.ps1 -AppImage             # same for the AppImage
```

## macOS

The same app for Mac, in `release-mac\` (built from Windows with `.\tools\build-mac.ps1`, which uses Docker Desktop):

| File | For |
| --- | --- |
| `BNC-Docs-<version>-mac-arm64.zip` | Apple Silicon Macs (M1, M2, M3, M4 ...) |
| `BNC-Docs-<version>-mac-x64.zip` | Intel Macs |

**Install:** double-click the zip, drag **BNC Docs** into **Applications**.

**First launch:** the app is signed ad-hoc but **not notarized** (that needs a paid Apple Developer account), so macOS shows an "unidentified developer" warning once.
Right-click (or Control-click) BNC Docs > **Open** > **Open**. On macOS 15+, if there is no Open button, open **System Settings > Privacy & Security** and press **Open Anyway** next to BNC Docs.
Or run `xattr -dr com.apple.quarantine "/Applications/BNC Docs.app"` in Terminal. After that it opens normally.

It is the same code as Windows and Linux. Mac specifics: the window's red/yellow/green buttons sit on the left of the title bar, there is a normal macOS menu bar (BNC Docs, Edit, View, Window) so Cmd+C / Cmd+V / Cmd+Q work,
Cmd takes the place of Ctrl in shortcuts (shown as ⌘ in the app; **Replace is Ctrl+H on a Mac too**, because Cmd+H hides the app), the Dock icon follows the app colour style, and double-clicking a `.bncdoc` file opens it.

```powershell
.\tools\build-mac.ps1      # build both zips (Docker Desktop must be running)
.\tools\mac-check.ps1      # inspect them: CPU type, Info.plist, signature, icon, packed app (cannot start the app: that needs a Mac)
```

On a Mac itself you can build with `npm run dist:mac` (it signs with the built-in `codesign`). To remove the warning for everyone you would need an Apple Developer certificate and notarization.

## Version numbers

BNC Docs is pre-release. **Every time it is updated or rebuilt the version goes up one step**, and each digit rolls over after 9:
`0.1.3` -> `0.1.4` ... `0.1.9` -> `0.2.0` ... `0.9.9` -> `1.0.0`.

```powershell
npm run version:bump             # next version, written to package.json and package-lock.json
npx tsx tools/bump-version.ts --set 0.1.3   # or set an exact one
```

The version lives in `package.json` only; the Windows installer, the Linux `.deb` and the AppImage all use it.

## Develop

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run build      # production build into dist/ and dist-electron/
npm start          # run the built app
npm test           # unit tests (docx / bncdoc round-trips)
npm run dist       # Windows installer + portable exe into release/
npm run icons      # regenerate the app icon
```

Layout:

```
electron/        main process, preload, Nextcloud WebDAV client
src/core/        document model, docx import/export, .bncdoc, RTF/HTML/MD, print HTML  (UI-free, shared with the future web app)
src/editor/      TipTap/ProseMirror extensions, pagination engine, find
src/ui/          ribbon, dialogs, pickers, Nextcloud dialogs
src/app.ts       application shell (documents, files, zoom, status)
src/commands.ts  every action in one registry (ribbon, shortcuts and command search all use it)
tools/           icon generator, docx round-trip checker, CDP driver for UI testing
tests/
```

Theme colours are CSS variables at the top of `src/styles/app.css`.

## Known limitations (v0.1)

- Not implemented yet: comments, track changes, footnotes/endnotes, equations, text boxes/shapes, columns, page borders, `.odt`
- Tables are not split across pages (a table moves whole to the next page); floating/anchored images import as inline images
- Section breaks with different page setups collapse to the final section's setup
- Fonts that are not installed (e.g. Aptos on a machine without Office) fall back to similar system fonts, so line breaks can differ from Word
- Numbered headings (multilevel list tied to heading styles) import without their numbers

## License

MIT — see [LICENSE](LICENSE).
