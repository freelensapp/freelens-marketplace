# Freelens Marketplace

List of extensions available in the Freelens marketplace.

Each extension lives in its own folder under `extensions/`. Renovate watches
each `extension.yaml` and opens a PR when the npm version changes.

## Layout

- `extensions/<name>/extension.yaml` — the manifest (name, description, status, version, and optionally
  repository and authors)
- `extensions/<name>/icon.png` — 256x256 PNG, optional but recommended
- `schema/lens-extension.schema.json` — JSON Schema for `extension.yaml`
- `extensions.json` — generated artifact consumed by the Freelens client

## Adding an extension

1. Create `extensions/<npm-name>/extension.yaml`:

   ```yaml
   name: "@scope/my-extension"
   description: What the extension does.
   status: community
   version: 1.0.0
   repository: https://github.com/owner/my-extension
   authors:
   - name: Jane
     surname: Doe
     github: https://github.com/jane-doe
   ```

2. Drop `icon.png` (256x256) next to it.
3. Open a PR. The CI will validate the manifest and (on merge to `main`)
   regenerate `extensions.json`.

## Updating an extension

After publishing a new version to npm, update `version` in the extension's
`extension.yaml` and open a PR. The workflow regenerates `extensions.json`
after merge; it does not need to be edited in the PR.

## Schema

`lens-extension/v1`. See `schema/lens-extension.schema.json`.

## CI

`.github/workflows/build-extensions.yaml`:

- On pull requests touching `extensions/`, `schema/`, or the script:
  validates every `extension.yaml` against the schema. Fails the PR on
  invalid manifests.
- On push to `main`: regenerates `extensions.json` and commits it back
  if it changed.

Trunk and Biome check the formatting of every file, the manifests included.

## Local development

The tools are pinned in `mise.toml`. With [mise](https://mise.jdx.dev) installed:

```sh
mise install
pnpm install
pnpm build
```

`pnpm build` validates the manifests and regenerates `extensions.json`.

Before opening a PR, check and fix the formatting:

```sh
pnpm trunk:fix
pnpm lint:fix
```
