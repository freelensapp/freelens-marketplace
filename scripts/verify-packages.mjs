#!/usr/bin/env node
// It reads the tarballs as data and runs nothing from them: it runs on pull
// requests from forks, whose manifests may point at any package.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { load } from "js-yaml";
import semver from "semver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const MANIFEST = "extension.yaml";
const NPM_REGISTRY = "https://registry.npmjs.org";
const MAX_TARBALL_BYTES = 64 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const ANNOTATE = process.env.GITHUB_ACTIONS === "true";

// An item is identified by everything that is checked, so a change of any of
// these fields verifies the item again.
function itemKey(spec, item) {
  return JSON.stringify([spec.package, item.version, item.freelens, item.url ?? null, item.integrity ?? null]);
}

function parseArgs(argv) {
  const args = { base: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && i + 1 < argv.length) {
      args.base = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

function headManifests() {
  const dir = join(REPO_ROOT, "extensions");
  const out = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const path = `extensions/${dirent.name}/${MANIFEST}`;
    try {
      out.push({ path, doc: load(readFileSync(join(REPO_ROOT, path), "utf8")) });
    } catch {
      // A missing or unparsable manifest is the business of the build.
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// The keys of the items in the manifests of the base revision. A manifest of
// an older format has no spec.versions and contributes nothing.
function baseKeys(base) {
  const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const keys = new Set();
  const paths = git("ls-tree", "-r", "--name-only", base, "--", "extensions/")
    .split("\n")
    .filter((path) => path.endsWith(`/${MANIFEST}`));
  for (const path of paths) {
    let doc;
    try {
      doc = load(git("show", `${base}:${path}`));
    } catch {
      continue;
    }
    const spec = doc?.spec;
    if (typeof spec?.package !== "string" || !Array.isArray(spec.versions)) continue;
    for (const item of spec.versions) {
      if (item && typeof item === "object") keys.add(itemKey(spec, item));
    }
  }
  return keys;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`GET ${url}: HTTP ${response.status}`);
  }
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_TARBALL_BYTES) {
    throw new Error(`GET ${url}: ${length} bytes, more than ${MAX_TARBALL_BYTES}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_TARBALL_BYTES) {
      throw new Error(`GET ${url}: more than ${MAX_TARBALL_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchJson(url) {
  return JSON.parse((await fetchBytes(url)).toString("utf8"));
}

// Checks data against a Subresource Integrity string. Of several hashes, as
// SRI allows, every one with a known algorithm must match.
function checkIntegrity(data, integrity) {
  const hashes = integrity
    .trim()
    .split(/\s+/)
    .map((token) => /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token))
    .filter(Boolean);
  if (hashes.length === 0) {
    return `no supported hash in integrity ${integrity}`;
  }
  for (const [, algorithm, expected] of hashes) {
    const actual = createHash(algorithm).update(data).digest("base64");
    if (actual !== expected) {
      return `integrity mismatch: expected ${algorithm}-${expected}, got ${algorithm}-${actual}`;
    }
  }
  return undefined;
}

function tarString(block, start, length) {
  const end = block.indexOf(0, start);
  return block.toString("utf8", start, end === -1 || end > start + length ? start + length : end);
}

// Returns the package.json at the top directory of a tarball, which npm
// names package/ but may have any name. Reads ustar, pax and GNU long names.
function readPackageJson(tgz) {
  const tar = gunzipSync(tgz, { maxOutputLength: MAX_UNPACKED_BYTES });
  let offset = 0;
  let nextPath;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(tarString(header, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error("unreadable tarball");
    }
    const type = String.fromCharCode(header[156]);
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === "x") {
      const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"));
      if (match) nextPath = match[1];
      continue;
    }
    if (type === "L") {
      nextPath = tarString(data, 0, data.length);
      continue;
    }
    let path = tarString(header, 0, 100);
    if (tarString(header, 257, 5) === "ustar") {
      const prefix = tarString(header, 345, 155);
      if (prefix) path = `${prefix}/${path}`;
    }
    if (nextPath !== undefined) {
      path = nextPath;
      nextPath = undefined;
    }
    if ((type === "0" || type === "\0") && /^[^/]+\/package\.json$/.test(path.replace(/^\.\//, ""))) {
      return JSON.parse(data.toString("utf8"));
    }
  }
  throw new Error("no package.json in the top directory of the tarball");
}

async function verifyItem(spec, item) {
  const errors = [];
  let tgz;
  if (item.url === undefined) {
    const meta = await fetchJson(
      `${NPM_REGISTRY}/${spec.package.replace("/", "%2f")}/${encodeURIComponent(item.version)}`,
    );
    if (typeof meta?.dist?.tarball !== "string" || typeof meta.dist.integrity !== "string") {
      return [`${spec.package}@${item.version}: no tarball or integrity on npm`];
    }
    tgz = await fetchBytes(meta.dist.tarball);
    const error = checkIntegrity(tgz, meta.dist.integrity);
    if (error) return [`${meta.dist.tarball}: ${error}`];
  } else {
    tgz = await fetchBytes(item.url);
    const error = checkIntegrity(tgz, item.integrity ?? "");
    if (error) return [`${item.url}: ${error}`];
  }

  const pkg = readPackageJson(tgz);
  if (pkg.name !== spec.package) {
    errors.push(`the package is ${pkg.name}, not spec.package ${spec.package}`);
  }
  if (pkg.version !== item.version) {
    errors.push(`the package has version ${pkg.version}, not ${item.version}`);
  }
  const engine = pkg.engines?.freelens;
  if (typeof engine !== "string" || semver.validRange(engine) === null) {
    errors.push(`the package has no valid engines.freelens (${JSON.stringify(engine)})`);
  } else if (semver.validRange(item.freelens) === null) {
    errors.push(`freelens ${item.freelens} is not a valid semver range`);
  } else if (!semver.subset(item.freelens, engine)) {
    errors.push(
      `freelens ${item.freelens} admits Freelens versions that engines.freelens ${engine} of the package does not`,
    );
  }
  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const known = args.base === undefined ? new Set() : baseKeys(args.base);

  let checked = 0;
  let failed = 0;
  for (const { path, doc } of headManifests()) {
    const spec = doc?.spec;
    if (typeof spec?.package !== "string" || !Array.isArray(spec.versions)) {
      console.log(`${path}: skipped, not a valid manifest`);
      continue;
    }
    for (const [index, item] of spec.versions.entries()) {
      if (known.has(itemKey(spec, item))) continue;
      const label = `${path}: versions[${index}] ${spec.package}@${item.version}${item.url ? ` (${item.url})` : ""}`;
      checked++;
      let errors;
      try {
        errors = await verifyItem(spec, item);
      } catch (error) {
        errors = [error.message];
      }
      if (errors.length === 0) {
        console.log(`ok     ${label}`);
        continue;
      }
      failed++;
      console.log(`FAILED ${label}`);
      for (const error of errors) {
        console.log(`         ${error}`);
        if (ANNOTATE) {
          console.log(`::error file=${path}::versions[${index}] ${item.version}: ${error}`);
        }
      }
    }
  }

  const scope = args.base === undefined ? "" : ` changed since ${args.base}`;
  console.log(`\nVerified ${checked} item(s)${scope}, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

await main();
