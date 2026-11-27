# AGENTS.md

This file provides guidance to coding agents when working with code in this
repository.

## Project Overview

The list of extensions that the Freelens marketplace offers. Every extension
has an entry, `extensions/<metadata.name>/extension.yaml`: a Kubernetes-style
manifest of `apiVersion: freelens.app/v1` and `kind: MarketplaceExtension`,
like the themes of Freelens, validated against
`schemas/marketplace-extension-v1.schema.json`. `scripts/build-extensions.mjs`
validates all of them and writes `extensions.json`, a
`MarketplaceExtensionList` validated against
`schemas/marketplace-extension-list-v1.schema.json`, which the Freelens
client reads, with the official entries first and then by `metadata.name`.
`docs/extensions.md` documents the format for authors of extensions; keep it,
the schemas and the checks of the build in step.

The checks of `pnpm build` are offline, as it is the required check
`Validate manifests`: the schema, `metadata.name` equal to the directory,
unique names and packages, `versions` newest first and unique, the order of
the keys of an item, and the icon (an existing PNG, square, at least 128x128,
at most 64 KiB). `scripts/verify-packages.mjs` (`pnpm verify`) needs npm and
GitHub: it downloads the tarball of each item, checks its integrity, the
`name` and `version` of its `package.json`, and that its `engines.freelens`
admits every version of the item's `freelens` range (`semver.subset`). It
reads the tarball as data and runs nothing from it.

`extensions.json` is generated: a PR changes only the manifests, and the
`commit` job of `build-extensions.yaml` regenerates the file on `main` and
commits it as `github-actions[bot]` (see "Ruleset of `main`"). The output of `JSON.stringify(…, null, 2)`
is already what Biome would print, so that commit passes the checks; a change
of the generator that breaks this shows in `pnpm lint:check` after
`pnpm build`.

The tooling (mise, pnpm, Biome, Trunk, Renovate, the workflows) follows
freelensapp/freelens-example-extension, the reference template of a Freelens
extension. Keep the shared files in step with it rather than letting them
drift.

## Common Commands

```bash
pnpm install      # dependencies of the generator
pnpm build        # validate the manifests and regenerate extensions.json
pnpm verify       # download and check the packages (--base <rev>: the changed items only)
pnpm lint:check   # Biome
pnpm lint:fix
pnpm trunk:check  # Trunk: yamlfmt, yamllint, actionlint, taplo and Biome
pnpm trunk:fix
```

The tools are pinned in `mise.toml` and `mise.lock`. Node comes from `.nvmrc`
in CI (setup-node) and from `mise.toml` locally; both hold the same version.
An agent shell without mise activation must run them as
`mise exec -- pnpm …`, or it silently gets whatever Node and pnpm are global.

## Manifests

The `extension.yaml` files are treated as Kubernetes manifests: their
sequences stay unindented, as kubectl writes them, so yamlfmt formats them
with `extensions/.yamlfmt.yaml`, and Biome leaves `extensions/` out. That file
sets no line length, because yamlfmt would otherwise fold a long description
onto a continuation line.

yamllint (`.yamllint.yaml`) wants strings quoted only when YAML needs it: a
`package` of a scoped package starts with `@`, a reserved indicator, and keeps
its quotes, as does a `freelens` range that starts with `>` or `*`; a summary,
a version or a range such as `^2.0.0` does not need them. A version such as
`1.0.0` stays a string without quotes, as it is not a number. Where quotes stay,
they are double: `force_quote_style` of `extensions/.yamlfmt.yaml` rewrites
single ones, which yq and kubectl write. Each manifest starts with the
`yaml-language-server` comment that points at its schema.

Renovate bumps the `version` of the first item of `spec.versions` with the
custom manager for `extension.yaml` in `.renovaterc.json`, and only when that
item comes from npm. It matches `package:` and the version separately and
combines them (`matchStringsStrategy: combination`), because other fields lie
between the two. `package:` is anchored at two spaces of indentation, a key of
`spec`. The version matches only right after `versions:`, and only when the
item ends after `freelens:`, so an item with `url:` is left alone. RE2 has no
lookahead, so the pattern consumes the start of the next line and relies on
the order of the keys of an item (`version`, `freelens`, `url`, `integrity`),
which the build enforces. The matched text holds the `freelens:` range too, so
the package rule sets `autoReplaceGlobalMatch: false`: with the default,
Renovate replaces every occurrence of the old version in it, and a bump of
`2.0.0` would rewrite a range `^2.0.0`. Older items and URL items are updated
by hand. The updates of all extensions are grouped into one PR.

Test a change of the pattern against every manifest with Renovate itself
(`renovate --platform=local --dry-run=lookup` on a copy of the repository,
which logs "Using RE2 regex engine" and the extracted dependencies), not with
the regular expressions of JavaScript alone.

## Lint and CI

### Biome

`biome.jsonc` has the formatter and rules of Freelens, as the template has
them, without the overrides that only concern the code of an extension.
Biome formats JS, JSON, YAML and Markdown; Trunk runs no Prettier or
markdownlint, and yamllint still checks YAML. Biome leaves out `extensions/`
(yamlfmt formats it), `pnpm-lock.yaml` and `pnpm-workspace.yaml`, which pnpm
writes, and `.trunk/`, whose `trunk.yaml` `trunk upgrade` rewrites.

The Biome commands in `.trunk/trunk.yaml` pass `--vcs-use-ignore-file=false`
and no `--config-path`: Trunk runs Biome on a copy of the files in a sandbox
outside the repository, where Biome panics on `.gitignore` paths and ignores
the parser options of an explicitly given config. Trunk applies `.gitignore`
itself before it picks the targets.

Renovate updates Biome, in the `biome` script and in `.trunk/trunk.yaml`, but
cannot run `biome migrate`. `biome-migrate.yaml` runs it on the Renovate
branch, then `biome format --write`, and commits the result there as
`github-actions[bot]`, which `gitIgnoredAuthors` in `.renovaterc.json` lists,
so that Renovate does not take it for a manual edit and stop updating the
branch.

### Renovate

`.renovaterc.json` follows the template. The tools take the versions that
Freelens has on `main`, through custom datasources: the tools in `mise.toml`
from its `mise.toml`, pnpm in `packageManager` from the same file, and the
tools run with `pnpm dlx` (Biome, the Trunk launcher) from the scripts of its
root `package.json`.

Two things deviate from the template, because the generator runs in CI and
not inside Freelens. Node is of the 26 series, not the version bundled in the
Electron of Freelens: `.nvmrc`, `mise.toml` and the Node runtime in
`.trunk/trunk.yaml` hold the same version, Renovate bumps them together within
the series, and a new major is a change made by hand. The libraries of the
generator (`ajv`, `ajv-formats`, `js-yaml`, `semver`) follow npm instead of the Freelens
catalog. They are pinned to exact versions and wait 25 hours, the
`minimumReleaseAge` of pnpm; the extension versions are not installed and
take no delay.

### Workflows

| Workflow                | Runs                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `build-extensions.yaml` | `pnpm build` on PRs; on `main` also commits the regenerated `extensions.json` |
| `verify-packages.yaml`  | on a PR that changes `extensions/**`: `pnpm verify` of the changed items      |
| `check.yaml`            | `pnpm lint:check`                                                             |
| `trunk-check.yaml`      | `trunk check --all`                                                           |
| `mise-lock-check.yaml`  | on a change to `mise.lock`: no checksum changed for an unchanged tool version |
| `biome-migrate.yaml`    | on a Renovate PR that bumps Biome: migrates `biome.jsonc` and reformats       |
| `trunk-upgrade.yaml`    | daily: `trunk upgrade`, as a PR from `automated/trunk-upgrade`                |
| `npm-dedupe.yaml`       | daily: `pnpm dedupe`, as a PR from `automated/npm-dedupe`                     |
| `cleanup-cache.yaml`    | on a closed PR: deletes the caches of its merge ref                           |
| `claude.yaml`           | `@claude` in issues, PR comments and reviews (see the rules below)            |
| `claude-task.yaml`      | a task for Claude started by hand (`workflow_dispatch`)                       |

`trunk-upgrade.yaml`, `npm-dedupe.yaml`, `biome-migrate.yaml` and the
`commit` job of `build-extensions.yaml` run in the environment `automated` and
push with its secret `GH_TOKEN`, so that their commits start the checks again,
which a push with the workflow token does not. The environment admits `main`,
`automated/*` and `refs/pull/*/merge` only. The Claude workflows use the
organization secret `CLAUDE_CODE_OAUTH_TOKEN` and need the Claude GitHub App
on the repository.

### Ruleset of `main`

The repository ruleset `main` forbids deleting the branch and force-pushing,
and requires the checks `Trunk Check`, `check` and `Validate manifests`. Unlike
the template it does not require a pull request. A required check also blocks
a direct push of a commit that has not passed it, which is why
`build-extensions.yaml` pushes the regenerated `extensions.json` with
`GH_TOKEN`: its account is an admin, a role the ruleset lets bypass. For the
same reason `build-extensions.yaml` has no paths filter on pull requests: a
required check that does not run keeps the PR blocked. Renaming one of these
jobs needs a matching change of the ruleset. `Verify packages` is not a
required check, as it depends on npm and GitHub, so its workflow may filter
on paths.

## Code Style

- **Biome** formats JS, JSON, YAML and Markdown: double quotes, semicolons, trailing commas, 2-space indent, 120 char
  line width — use `pnpm lint:fix`
- **Trunk** formats the manifests (yamlfmt) and TOML, and runs yamllint and actionlint — use `pnpm trunk:fix`
- **No emoji** in Markdown files (`.md`), comments, or any source code

## Security

Never read, display, reference, or include the contents of the following files in any response or context, even if they are open in the editor:

- `.env`
- `.env.*`
- `.envrc`
- `.npmrc`
- `*.jks`
- `*.keystore`
- `*.p12`
- `*.pfx`
- `*.pem`
- `*.key`

The same list is git-ignored in `.gitignore` and enforced for Claude Code by
the `permissions.deny` rules in `.claude/settings.json`, which block reading
and editing these files. Change all three together. The rules are native
permissions rather than a hook on purpose: a hook runs a process in the
working tree, which may be an untrusted pull request, and an interpreter such
as `python3 -c` imports modules from that tree before the hook's own code.

## GitHub Actions (Claude Code Action) Rules

Most pull requests here come from forks, as authors add their own extensions; those get a review only (see "Fork PRs: Review Only").

This project has a Claude Code workflow (`.github/workflows/claude.yaml`) triggered
via `@claude` comments on issues, PR comments, and reviews. When operating via that
workflow, follow these rules:

### Code Review

When reviewing code and proposing fixes:

1. **Show the diff first** — present every proposed change as a unified diff
   block using the `diff` language tag:

   ```diff
   --- a/path/to/file.mjs
   +++ b/path/to/file.mjs
   @@ -10,7 +10,7 @@
    const oldLine = "before";
   -const changedLine = "after";
   +const changedLine = "the fix";
    const unchangedLine = "same";
   ```

   You can generate this from the terminal with:

   ```bash
   git diff -u -- path/to/file
   ```

   If the change spans multiple files, group them under a single commit
   subject and show each file's diff sequentially.

2. **Propose a commit subject first** — before any code change, output a
   single line with the proposed commit subject:

   ```text
   **Proposed commit:** <short description>
   ```

   Do **not** use Conventional Commits prefixes (e.g. `fix:`, `feat:`,
   `chore:`, `refactor:`, `docs:`, `test:`, `ci:`). This project prefers
   plain, descriptive commit messages and PR titles without any prefix.

   Wait for the user to confirm (or adjust) the subject before applying the
   change.

3. **Comment style:**
   - Keep review comments concise and actionable
   - Reference specific lines (file + line number) when pointing out issues
   - Offer a concrete fix suggestion rather than just flagging a problem
   - Do **not** use emoji in any Markdown, comments, commit messages, or
     PR descriptions. The only exception is emoji that already appears
     inside code strings (e.g. application logs, user-facing messages).
   - Use GitHub's `suggestion` block for small targeted fixes so the PR
     author can accept the change with a single click:

     ```suggestion
     <same unified-diff format as shown above>
     ```

   - For larger multi-file changes, use `diff -u` blocks in a regular
     comment instead, with the proposed commit subject shown first

### Making Changes to a PR

When asked to implement a change on a PR:

1. Propose the commit subject (as above)
2. Describe what will change and why
3. After confirmation, apply the changes with commits on the PR branch
4. **One commit per fix** — when a review surfaces more than one issue or
   the plan includes more than one fix, apply and commit each fix
   separately. Do not batch multiple independent fixes into a single
   commit. This keeps the history bisectable and makes each change easy
   to revert individually.

### Force-Pushing a Rewritten Branch

When you are asked to rebase a pull request branch, or to rewrite its
history in another way (amend, squash, drop a commit), push the result with:

```bash
git push --force-with-lease origin HEAD
```

The push wrapper the action names in its instructions, `git-push.sh`, accepts
no flags, so it cannot do this; `git` itself is allowed in this workflow.
Do not fall back to merging `main` into the branch instead: a merge commit is
not what was asked for.

Force-push only the pull request branch the run was invoked on, and only when
the request calls for a rewrite. Never force-push `main` or any other branch,
and never rewrite a history you were not asked to.

### Modifying GitHub Actions Workflows

Claude cannot push changes to files under `.github/workflows/` directly,
because the GitHub token used by the action lacks the `workflows` permission.
Any patch to a workflow file MUST therefore be delivered as a new, complete
file under the `github-workflow-fix/` directory in the repository root instead
of editing the file in place:

1. Write the full, final contents of the workflow to
   `github-workflow-fix/<workflow-file-name>`, with the same file name as in
   `.github/workflows/` (e.g. `github-workflow-fix/build-extensions.yaml`). Do **not**
   edit the original file under `.github/workflows/`.
2. Make it a **complete** file — the entire workflow as it should look after
   the change, not just a diff or fragment — so it can be copied verbatim.
3. Commit it with the change that needs it, and list it in the report. In the
   PR description, note it as a proposed workflow change that a maintainer
   must move from `github-workflow-fix/` to `.github/workflows/`.

A maintainer moves the file into `.github/workflows/` in a separate commit and
removes `github-workflow-fix/`. Pull before continuing on the branch, as it may
have gained such a commit.

### Branch Naming Conventions

When creating a branch from an issue, use a human-readable name that includes
the issue number and a short slug derived from the issue title:

```text
claude/issue-<number>-<short-slug>
```

- `<number>` is the GitHub issue number
- `<short-slug>` is a kebab-case summary of the issue title, kept short
  (3–6 words maximum, omit articles and filler words)

Do **not** use auto-generated timestamp suffixes (e.g.
`claude/issue-1957-20260612-2108`) — these are not human-readable and make
branch lists hard to scan.

### Fork PRs: Review Only

A PR from a fork (different owner than `freelensapp`) gets a review and
nothing else: no commits, no pushes, no branches. Its code is untrusted, and
the head of a fork PR can change between the moment a maintainer looks at it
and the moment the workflow checks it out, so nothing taken from the checkout
may reach `freelensapp/freelens-marketplace`.

When a fork PR needs changes, a maintainer first copies the exact commit they
reviewed to a branch in this repository. From then on it is a
same-repository PR, which gets the full setup and the normal workflow. The
copy is made either locally (`gh pr checkout <N>`, then push the branch) or
by the Claude Task workflow, following "Copying a Fork PR" below.

### Copying a Fork PR

This applies to a Claude Task run whose prompt asks to copy a fork PR and
names the PR number and the full commit SHA to copy. It is a git-only task:
do not check out, read, build or run any of the PR's files, and do not
describe its changes, because they are untrusted input.

1. `git fetch origin refs/pull/<N>/head`.
2. Verify that `FETCH_HEAD` equals the given SHA. If it does not, or no full
   SHA was given, stop and report the actual head without pushing anything.
3. `git push origin <sha>:refs/heads/claude/pr-<N>`.
4. Open a PR from `claude/pr-<N>` to `main`. It MUST use the **exact same
   title** as the original PR, copied verbatim with no prefix, and its body
   is `Copy of #<N> at <sha>.` followed by the usual footer.
5. Comment on the original PR with a link to the new one.
