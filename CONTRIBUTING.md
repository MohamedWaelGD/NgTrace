# Contributing

Thanks for helping. Bug reports with a small reproduction are the most useful contribution of all.

## Reporting a bug

Use the [bug report form](https://github.com/MohamedWaelGD/NgTrace/issues/new?template=bug.yml). The quickest way is the *Report a bug* link at the bottom of the extension's options page, which fills in the extension and browser versions for you.

For a request attributed to the wrong component (or to none), please include a screenshot of the request's **Initiator** tab: it shows the confidence and Call Chain behind the decision. If you can, reproduce it in a fresh `ng new` app or by adding a component to [`demo-app`](demo-app).

Questions and ideas go in [Discussions](https://github.com/MohamedWaelGD/NgTrace/discussions). Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Development setup

Requires Node 22+ and Google Chrome.

```bash
npm install
npm run build        # builds dist/extension
```

Load `dist/extension` with *Load unpacked* on `chrome://extensions`. Then:

```bash
npm run build:demo && npm run demo   # demo app on http://localhost:4321
```

The demo app has one component per attribution scenario, in zone and zoneless builds.

## Before opening a pull request

```bash
npm run typecheck
npm test             # unit tests (vitest)
npm run test:e2e     # Playwright against real Chrome
```

- Read [`GLOSSARY.md`](GLOSSARY.md) and use its terms (Captured Request, Owner Component, Attribution Confidence…) in code, UI text and commit messages.
- Design decisions are recorded in [`docs/adr/`](docs/adr). A change that goes against one needs a new ADR, so please open an issue first to discuss it.
- Add a unit test for logic changes and a demo-app scenario plus e2e test for new attribution cases.
- Keep pull requests to one change. For anything larger than a bug fix, open an issue first.

## Privacy rules for contributions

These are what users trust the extension for; a pull request that breaks them will not be merged:

- The extension makes no network requests of its own: no analytics, telemetry, remote config or CDN assets.
- Captured requests are never written to persistent storage.
- New export or copy features respect masked headers.

If a change touches what is read, stored or where, update [PRIVACY.md](PRIVACY.md) in the same pull request.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
