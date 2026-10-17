# Third-party notices

BNC Docs is MIT licensed (see LICENSE). The spell checker uses these packages, which are bundled into the app:

| Package | Licence | What it is |
| --- | --- | --- |
| [nspell](https://github.com/wooorm/nspell) | MIT | Hunspell-compatible spell checker in JavaScript |
| [dictionary-en](https://github.com/wooorm/dictionaries) (en-US) | MIT AND BSD | Hunspell dictionary derived from SCOWL |
| dictionary-en-gb (en-GB) | MIT AND BSD | Hunspell dictionary derived from SCOWL |
| dictionary-en-au (en-AU) | MIT AND BSD | Hunspell dictionary derived from SCOWL |

The dictionary word lists come from [SCOWL](http://wordlist.aspell.net) and the Hunspell en_GB / en_AU projects; the full licence texts are in each package's `license` file under `node_modules`.
The other libraries (TipTap, ProseMirror, docx, JSZip, lucide, marked, turndown, fast-xml-parser) are all MIT licensed.