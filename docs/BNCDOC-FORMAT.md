# `.bncdoc` format (version 1)

A `.bncdoc` file is a standard ZIP archive (media type `application/vnd.bnc.doc+zip`).

| Entry | Description |
| --- | --- |
| `mimetype` | The text `application/vnd.bnc.doc+zip`, stored uncompressed and first in the archive |
| `manifest.json` | `{ "format": "bncdoc", "version": 1, "app": "BNC Docs", "created": ISO date, "modified": ISO date }` |
| `meta.json` | Page setup, document defaults, header/footer, title, author (see below) |
| `content.json` | The document as ProseMirror JSON (`{ "type": "doc", "content": [...] }`) |
| `media/*` | Embedded images; `image` nodes reference them as `"src": "media/image1.png"` |

All lengths are in points (1/72 inch).

## `meta.json`

```json
{
  "page": { "width": 612, "height": 792, "marginTop": 72, "marginBottom": 72, "marginLeft": 72, "marginRight": 72,
            "orientation": "portrait", "color": null },
  "defaults": { "fontFamily": "Aptos", "fontSize": 12, "color": null, "spaceBefore": 0, "spaceAfter": 8, "lineHeight": 1.08 },
  "header": { "text": "", "align": "left" },
  "footer": { "text": "Page {page} of {pages}", "align": "center" },
  "title": "", "author": "", "created": "...", "modified": "..."
}
```

## `content.json` nodes

Block nodes: `paragraph`, `heading` (`level` 1-6), `bulletList`, `orderedList` (`start`, `type` of `1 a A i I`), `listItem`,
`table` (`bordered`, `align`), `tableRow`, `tableCell` / `tableHeader` (`colspan`, `rowspan`, `colwidth` px, `backgroundColor`, `verticalAlign`),
`pageBreak`, `blockquote`, `horizontalRule`. Inline nodes: `text`, `hardBreak`, `image` (`src`, `alt`, `width`, `height` in px).

Paragraph/heading attributes: `textAlign`, `spaceBefore`, `spaceAfter`, `lineHeight` (number multiplier or `"14pt"`), `indentLeft`,
`indentRight`, `indentFirst` (negative = hanging), `shading`, `styleId` (`Title`, `Subtitle`, `Quote`, `IntenseQuote`), `pageBreakBefore`.

Marks: `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `highlight` (`color`), `link` (`href`),
`textStyle` (`fontFamily`, `fontSize` like `"12pt"`, `color`, `textTransform`, `fontVariant`, `letterSpacing`).

Readers must ignore unknown entries, nodes and attributes. A reader that sees `version` greater than it supports should refuse to open the file.
