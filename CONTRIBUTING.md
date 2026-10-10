# Contributing to BNC Docs

Thanks for helping! BNC Docs is open source (MIT) and pre-release, so rough edges are expected.

## Reporting a bug

Open an issue and include: your operating system (Windows / macOS / Linux and version), the BNC Docs version (**File > Info** or the About box),
what you did, what you expected, what happened, and, if it is about a document, a small `.docx` that shows it (remove anything private first).

## Running it from source

```bash
npm install
npm run dev          # the app with hot reload
npm test             # unit tests
npm run typecheck
```

Node.js 18+ is needed. See the README for building the Windows installer, the Linux packages (`npm run build:linux`, needs Docker) and the macOS app (`npm run build:mac`, needs Docker).

## Pull requests

- One change per pull request, with a short description of *why*.
- `npm run typecheck` and `npm test` must pass. Add a test for new file-format behaviour (`tests/`).
- Keep the Windows, macOS and Linux apps identical: platform-specific code lives in `electron/` and is guarded by `process.platform`.
- Do not commit build output, installers or plugins. **App colour styles live in their own repository, [bnc-plugins](https://github.com/PigeonBoi69/bnc-plugins).**

## Version numbers

The app is pre-release. Each update bumps the version by one step and each digit rolls over after 9
(`0.1.3` -> `0.1.4` ... `0.1.9` -> `0.2.0` ... `0.9.9` -> `1.0.0`). Maintainers do it with `npm run version:bump` before building a release.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
