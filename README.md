# Freelens Marketplace

List of extensions available in the Freelens marketplace.

Each extension lives in its own folder under `extensions/`. Renovate watches
each `extension.yaml` and opens a PR when the npm version changes.

## Layout

- `renovate.json` — Renovate config (auto-bump npm versions)
- `schema/lens-extension.schema.json` — JSON Schema for `extension.yaml`
- `extensions/<name>/extension.yaml` — the manifest (name, description, status, version)
- `extensions/<name>/icon.png` — 256x256 PNG, optional but recommended
- `extensions.json` — generated artifact consumed by the Freelens client

## Adding an extension

1. Create `extensions/<npm-name>/extension.yaml` with the four fields.
2. Drop `icon.png` (256x256) next to it.
3. Open a PR. The CI will validate the manifest and (on merge to `main`)
   regenerate `extensions.json`.

## Schema

`lens-extension/v1`. See `schema/lens-extension.schema.json`.

## CI

`.github/workflows/build-extensions.yml`:

- On pull requests touching `extensions/`, `schema/`, or the script:
  validates every `extension.yaml` against the schema. Fails the PR on
  invalid manifests.
- On push to `main`: regenerates `extensions.json` and commits it back
  if it changed.

## Local development

```sh
npm install
npm run build
```

This regenerates `extensions.json` from the manifests under `extensions/`.
