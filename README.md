# Freelens Marketplace

The list of extensions that the marketplace of Freelens offers.

Each extension has an entry, a Kubernetes-style manifest of
`apiVersion: freelens.app/v1` and `kind: MarketplaceExtension`, in its own
directory under `extensions/`. The manifests are validated against JSON
Schemas and generate `extensions.json`, a `MarketplaceExtensionList` that
Freelens reads.

To add or update an extension, see [docs/extensions.md](docs/extensions.md).

## Layout

- `extensions/<name>/extension.yaml`: the manifest of an entry, where `<name>`
  is its `metadata.name`
- `extensions/<name>/<icon>.png`: the icon of an entry, optional
- `schemas/marketplace-extension-v1.schema.json`: JSON Schema of a manifest
- `schemas/marketplace-extension-list-v1.schema.json`: JSON Schema of the list
- `scripts/build-extensions.mjs`: validates the manifests and writes the list
- `scripts/verify-packages.mjs`: checks the packages against the manifests
- `extensions.json`: the list, generated, read by Freelens
- `docs/extensions.md`: the documentation for authors of extensions

## A manifest

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/freelensapp/freelens-marketplace/main/schemas/marketplace-extension-v1.schema.json
apiVersion: freelens.app/v1
kind: MarketplaceExtension
metadata:
  name: fluxcd
spec:
  displayName: FluxCD
  summary: Integrates FluxCD support.
  tier: official
  package: "@freelensapp/fluxcd-extension"
  versions:
  - version: 6.2.0
    freelens: ^2.0.0
  homepage: https://github.com/freelensapp/freelens-fluxcd-extension
  repository: https://github.com/freelensapp/freelens-fluxcd-extension
  license: MIT
```

Freelens offers the newest item of `versions` whose `freelens` range matches
the running Freelens. An item without `url` is installed from npm; an item
with `url` and `integrity` from that tarball.

## CI

- **Validate manifests** (`build-extensions.yaml`, `pnpm build`): checks every
  manifest offline, against the schema and the rules of
  [docs/extensions.md](docs/extensions.md), and the generated list against its
  schema. On `main`, it also commits the regenerated `extensions.json`.
- **Verify packages** (`verify-packages.yaml`, `pnpm verify`): on a pull
  request that changes `extensions/`, downloads the package of every added or
  changed item of `versions`, from npm or from its `url`, and checks its
  integrity, its name and version, and its `engines.freelens`.
- **Renovate** bumps the first item of `versions` of an entry when it comes
  from npm.

Trunk and Biome check the formatting of every file, the manifests included.

## Local development

The tools are pinned in `mise.toml`. With [mise](https://mise.jdx.dev) installed:

```sh
mise install
pnpm install
pnpm build
```

`pnpm build` validates the manifests and regenerates `extensions.json`.
`pnpm verify` downloads and checks the packages of every item, or with
`pnpm verify --base main` those that `main` lacks.

Before opening a PR, check and fix the formatting:

```sh
pnpm trunk:fix
pnpm lint:fix
```
