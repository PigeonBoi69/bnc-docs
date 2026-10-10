import {
  createElement,
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript, Highlighter, Baseline, RemoveFormatting,
  List, ListOrdered, IndentIncrease, IndentDecrease, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, ClipboardPaste, Paintbrush, PaintBucket, Search, Mic, PenLine, Table, Image, Link, FileText,
  Bookmark, MessageSquare, Sigma, Omega, Smile, SeparatorHorizontal, PanelTop, PanelBottom, Ruler, BookOpen,
  Moon, Sun, ZoomIn, ZoomOut, Printer, Download, Share2, Save, FolderOpen, FilePlus, Cloud, CloudUpload,
  CloudDownload, Settings, ChevronDown, ChevronRight, X, Check, Maximize2, Palette, Columns2, RotateCw, FileDown,
  Copy, Scissors, Plus, Minus, Pencil, Eye, Info, History, Trash2, Star, FolderPlus, Folder, File, LogOut, User,
  ArrowLeft, ListTree, SpellCheck, Languages, Accessibility, Layers, Frame, LayoutTemplate, Keyboard, CircleHelp,
  RefreshCw, TableOfContents, Quote, FileCode, BookMarked, ArrowUpDown, PanelLeft, MessageSquarePlus, Files, Upload,
  Home, Ellipsis, Type, Hash, Minus as Dash, MoveVertical, FileType, Replace, ChevronUp, Square,
} from 'lucide';

const ICONS = {
  bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, subscript: Subscript, superscript: Superscript,
  highlight: Highlighter, fontColor: Baseline, clearFormat: RemoveFormatting, bullets: List, numbering: ListOrdered,
  indent: IndentIncrease, outdent: IndentDecrease, alignLeft: AlignLeft, alignCenter: AlignCenter, alignRight: AlignRight,
  alignJustify: AlignJustify, undo: Undo2, redo: Redo2, paste: ClipboardPaste, formatPainter: Paintbrush, shading: PaintBucket,
  search: Search, mic: Mic, editor: PenLine, table: Table, image: Image, link: Link, file: FileText, bookmark: Bookmark,
  comment: MessageSquare, equation: Sigma, symbol: Omega, emoji: Smile, pageBreak: SeparatorHorizontal, header: PanelTop,
  footer: PanelBottom, ruler: Ruler, reading: BookOpen, moon: Moon, sun: Sun, zoomIn: ZoomIn, zoomOut: ZoomOut, print: Printer,
  export: Download, share: Share2, save: Save, open: FolderOpen, new: FilePlus, cloud: Cloud, cloudUp: CloudUpload,
  cloudDown: CloudDownload, settings: Settings, chevron: ChevronDown, chevronRight: ChevronRight, close: X, check: Check,
  fit: Maximize2, palette: Palette, columns: Columns2, orientation: RotateCw, pdf: FileDown, copy: Copy, cut: Scissors,
  plus: Plus, minus: Minus, rename: Pencil, view: Eye, info: Info, history: History, trash: Trash2, star: Star,
  newFolder: FolderPlus, folder: Folder, doc: File, logout: LogOut, user: User, back: ArrowLeft, nav: ListTree,
  spelling: SpellCheck, translate: Languages, accessibility: Accessibility, layers: Layers, margins: Frame,
  template: LayoutTemplate, keyboard: Keyboard, help: CircleHelp, refresh: RefreshCw, toc: TableOfContents, quote: Quote,
  code: FileCode, bookmarked: BookMarked, lineSpacing: ArrowUpDown, panel: PanelLeft, newComment: MessageSquarePlus,
  files: Files, upload: Upload, home: Home, more: Ellipsis, type: Type, hash: Hash, rule: Dash, spacing: MoveVertical,
  size: FileType, replace: Replace, up: ChevronUp, square: Square,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 18): SVGElement {
  const node = createElement(ICONS[name], { width: size, height: size, 'stroke-width': 1.8 }) as unknown as SVGElement;
  node.classList.add('ic');
  return node;
}
