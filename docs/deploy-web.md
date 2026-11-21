# Deploying a GameDream Web Build

`dream web package` turns a generated project into a checked static directory
that can be uploaded to any static host. It checks required files and copies
the managed runtime/assets; run `dream web verify` for the marker gate.

```bash
dream web compose --out ./web-game --content templates/rpg-action-m1/content --modules modules
dream web verify --path ./web-game --visual
dream web package --path ./web-game --out ./release/web-game
```

The package contains the runtime modules, `game.json`, `vendor/phaser.min.js`,
`README.md`, and `assets/` (when present). Screenshots, browser profiles, and
logs are excluded. `deployment.json` lists the entry point and the path, byte
size, and SHA-256 hash of every packaged file except itself; its `bytes` field
is content bytes, not including the manifest.

Serve or upload the package directory as-is. Paths are relative, so it works at
a domain root or a subdirectory (for example GitHub Pages) without a build step.

```bash
cd release/web-game
python3 -m http.server 8080
# open http://localhost:8080
```

For static hosts:

- GitHub Pages: publish the package directory contents.
- Netlify/Cloudflare Pages: upload the directory as the publish root.
- Any CDN/object store: preserve the directory structure and serve `.mjs` as
  `text/javascript`.

Re-run `dream web package --force` after recomposing or editing the project. The
packager builds in a staging directory and swaps it into place with a backup, so
a failed copy or rename leaves the previous release intact. Do not upload
`screenshot.png`, `.profile`, or local browser directories; the packager already
filters those out.
