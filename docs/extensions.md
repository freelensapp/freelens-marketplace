# Marketplace extensions

An entry of the Freelens marketplace is a YAML file,
`extensions/<name>/extension.yaml`, in this repository. To offer an extension
in the marketplace, add such a file in a pull request; the marketplace of
Freelens reads the list of all entries, `extensions.json`, which is generated
from them.

## A manifest

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/freelensapp/freelens-marketplace/main/schemas/marketplace-extension-v1.schema.json
apiVersion: freelens.app/v1
kind: MarketplaceExtension
metadata:
  name: my-extension
spec:
  displayName: My Extension
  summary: Shows what my extension does, in one line.
  description: |
    Markdown shown in the details view.

    - What it adds to Freelens
    - What it needs in the cluster
  tier: community
  package: "@jane-doe/my-extension"
  versions:
  - version: 2.1.0
    freelens: ^2.0.0
  homepage: https://github.com/jane-doe/freelens-my-extension
  repository: https://github.com/jane-doe/freelens-my-extension
  license: MIT
  icon: icon.png
  authors:
  - name: Jane Doe
    url: https://github.com/jane-doe
```

The file has the shape of a Kubernetes object, as the
[themes of Freelens](https://github.com/freelensapp/freelens/blob/main/docs/themes.md)
do:

- `apiVersion` is `freelens.app/v1` and `kind` is `MarketplaceExtension`.
- `metadata.name` identifies the entry. It takes lowercase letters, digits
  and `-`, starts and ends with a letter or a digit, is at most 63 characters
  long, and is the name of the directory of the file. It is free: it need not
  match the name of the npm package. `metadata` may also have `labels` and
  `annotations`, which the marketplace does not interpret.
- `spec` describes the extension.

The comment on the first line lets an editor with the YAML language server
validate the file and complete its fields.

## The fields of `spec`

| Field         | Required | Shown in Freelens                 | Rules                                                                                            |
| ------------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `displayName` | yes      | the card, the details             | one line                                                                                         |
| `summary`     | yes      | the card                          | plain text, one line, at most 160 characters                                                     |
| `description` | no       | the details, rendered as Markdown | without it, the details show `summary`                                                           |
| `tier`        | yes      | the card                          | `official` for the extensions of the Freelens organization, `community` for every other one      |
| `package`     | yes      | matching installed extensions     | the `name` in the `package.json` of the package, by which Freelens identifies extensions         |
| `versions`    | yes      | install, compatibility filter     | newest first; see [Versions](#versions)                                                          |
| `homepage`    | no       | the card under the icon, details  | an `https:` URL                                                                                  |
| `license`     | no       | the card, the details             | an [SPDX](https://spdx.org/licenses/) identifier, such as `MIT` or `Apache-2.0`                  |
| `icon`        | no       | the card                          | a PNG file in the directory of the entry; see [Icon](#icon)                                      |
| `repository`  | no       | the details                       | an `https:` URL                                                                                  |
| `authors`     | no       | the details                       | each with `name`, the full name, and optionally `email` and `url`, as a person in `package.json` |

Two entries cannot have the same `package`.

## Versions

Each item of `versions` is a version of the package that the marketplace may
install:

- `version` is the version of the package, as in its `package.json`.
- `freelens` is the [semver range](https://github.com/npm/node-semver#ranges)
  of the Freelens versions it works with. Take it from `engines.freelens` of
  its `package.json`; it may be narrower, but not wider.
- `url` is the URL of the tarball of the package, for a package that is not
  on npm, such as an asset of a GitHub release. Without `url`, the version is
  installed from npm as `<package>@<version>`.
- `integrity` is the
  [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
  of the tarball at `url`, and is required with it: an asset of a release can
  be replaced, while a version on npm cannot.

The keys of an item are in this order: `version`, `freelens`, `url`,
`integrity`. Renovate depends on the order (see
[Updating an extension](#updating-an-extension)), so the build refuses
another.

The items are listed newest first, and each version once. Freelens offers the
newest item whose `freelens` range matches the running Freelens, and does not
offer an entry with no such item. An entry therefore keeps one item for each
range of Freelens it still supports, typically the newest version for each
major version of Freelens. Only Freelens 2.0.0 and newer have the marketplace,
so the build refuses an item whose range admits none of them:

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
versions:
- version: 7.0.0
  freelens: ^3.0.0
- version: 6.2.0
  freelens: ^2.0.0
```

Items from npm and from a URL can be mixed in one entry. An item from a URL:

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
versions:
- version: 1.0.0
  freelens: ^2.0.0
  url: https://github.com/jane-doe/freelens-my-extension/releases/download/v1.0.0/jane-doe-my-extension-1.0.0.tgz
  integrity: sha256-s6PpsK6kuWfyw0I43+NigYudCXL+jfsQjlgM5D5xVv4=
```

`integrity` takes `sha256-`, `sha384-` or `sha512-` followed by the hash in
base64. To compute it:

```sh
curl -sSL "$URL" | openssl dgst -sha256 -binary | base64
```

GitHub shows the SHA-256 of a release asset as `sha256:<hex>`; the same hash
in base64 is `echo <hex> | xxd -r -p | base64`.

A range that starts with `>` or `*` is quoted, as YAML reads these
characters differently at the start of a value. Other ranges, such as `^2.0.0`
or `<3.0.0`, stay unquoted:

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
- version: 1.0.0
  freelens: ">=2.0.0 <4.0.0"
```

Freelens still checks `engines.freelens` of the package when it installs it,
so a wrong range in the manifest ends in a failed install, never in an
incompatible extension.

## Icon

`icon` is the name of a PNG file in the directory of the entry, next to
`extension.yaml`, such as `icon.png`. The file:

- is a PNG: SVG is not accepted, as `raw.githubusercontent.com` serves it in
  a way that an image does not render;
- is square, at least 128x128 pixels;
- has at most 64 KiB.

Icons come from this repository only, so that they are reviewed with the
rest of the entry, and Freelens loads them from the same place as the list:
`extensions/<metadata.name>/<icon>`, relative to `extensions.json`. An entry
without `icon` gets the default icon of Freelens.

## Adding an extension

1. Publish the package, on npm or as an asset of a release, with
   `engines.freelens` in its `package.json`.
2. Create `extensions/<name>/extension.yaml` as above, and the icon next to
   it.
3. Check it locally, if you can (see [README.md](../README.md#local-development)):

   ```sh
   pnpm build
   pnpm verify
   pnpm trunk:fix
   ```

4. Open a pull request with the new directory only. `extensions.json` is
   regenerated after the merge; leave it out of the pull request.

Two checks run on the pull request:

- **Validate manifests** checks every manifest offline: the schema, the name
  of the directory, unique names and packages, the order and uniqueness of
  `versions`, the order of the keys of an item, and the icon. It must pass.
- **Verify packages** downloads the tarball of every item the pull request
  adds or changes, from npm or from its `url`, and checks its integrity, that
  `name` and `version` of its `package.json` are `package` and `version`, and
  that its `engines.freelens` admits every Freelens version of `freelens`.

## Updating an extension

Renovate watches the first item of `versions`, when it comes from npm: after
a new version of the package is published on npm, it opens a pull request
that bumps that `version`. It does not touch the other items, nor an item
from a URL, which are updated by hand.

When a new version needs another range of Freelens, such as a major version
that moves to `^3.0.0`, the Renovate pull request fails **Verify packages**,
as it keeps the old range. Fix it by hand: add the new version as a new first
item with its range, and restore the item it replaced, which still serves the
older Freelens 2.x:

<!-- biome-ignore format: indentless sequences, as in the manifests -->

```yaml
versions:
- version: 7.0.0
  freelens: ^3.0.0
- version: 6.2.0
  freelens: ^2.0.0
```

An item is removed when its range of Freelens is no longer to be offered.

## The list

`extensions.json` is generated by `pnpm build` from the manifests, and
committed on `main` by the CI. It is a list of the entries, each as its full
manifest, the official ones first, then by `metadata.name`:

```json
{
  "apiVersion": "freelens.app/v1",
  "kind": "MarketplaceExtensionList",
  "items": [
    {
      "apiVersion": "freelens.app/v1",
      "kind": "MarketplaceExtension",
      "metadata": { "name": "fluxcd" },
      "spec": { "displayName": "FluxCD", "...": "..." }
    }
  ]
}
```

## Schemas

- [`schemas/marketplace-extension-v1.schema.json`](../schemas/marketplace-extension-v1.schema.json):
  a manifest.
- [`schemas/marketplace-extension-list-v1.schema.json`](../schemas/marketplace-extension-list-v1.schema.json):
  the list, whose items refer to the schema of a manifest.

Both are JSON Schema, draft 2020-12.
