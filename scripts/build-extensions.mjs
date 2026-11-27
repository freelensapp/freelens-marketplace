#!/usr/bin/env node
// Every check is offline, as this is the required check "Validate manifests";
// the checks that need npm and the URLs are in scripts/verify-packages.mjs.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { load } from "js-yaml";
import semver from "semver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EXTENSIONS_DIR = join(REPO_ROOT, "extensions");
const SCHEMAS_DIR = join(REPO_ROOT, "schemas");
const ENTRY_SCHEMA = "marketplace-extension-v1.schema.json";
const LIST_SCHEMA = "marketplace-extension-list-v1.schema.json";
const OUTPUT_PATH = join(REPO_ROOT, "extensions.json");
const MANIFEST = "extension.yaml";
const API_VERSION = "freelens.app/v1";
const TIER_ORDER = { official: 0, community: 1 };

// The order of the keys of an item of versions. The Renovate pattern relies
// on it: it bumps the first item only when the item ends after `freelens:`.
const VERSION_KEYS = ["version", "freelens", "url", "integrity"];

// Freelens 1.x has no marketplace, so an item only for it would never be
// offered.
const MARKETPLACE_FREELENS = ">=2.0.0";

const ICON_MIN_SIZE = 128;
const ICON_MAX_BYTES = 64 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Each entry is a directory extensions/<metadata.name>/ with an extension.yaml.
// Anything else at that level is an error, so that a manifest in a nested or
// misnamed directory cannot be skipped silently.
function findEntries(errors) {
  const entries = [];
  for (const dirent of readdirSync(EXTENSIONS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      if (!dirent.name.startsWith(".")) {
        errors.push(`extensions/${dirent.name}: not a directory of an entry`);
      }
      continue;
    }
    const manifestPath = join(EXTENSIONS_DIR, dirent.name, MANIFEST);
    if (!existsSync(manifestPath)) {
      errors.push(`extensions/${dirent.name}: no ${MANIFEST}`);
      continue;
    }
    entries.push({ dirName: dirent.name, manifestPath });
  }
  return entries.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

function loadSchema(name) {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, name), "utf8"));
}

function checkVersions(spec, fail) {
  const seen = new Set();
  let previous;
  spec.versions.forEach((item, index) => {
    const where = `spec.versions[${index}]`;

    const keys = Object.keys(item);
    const expected = VERSION_KEYS.filter((key) => keys.includes(key));
    if (keys.join(",") !== expected.join(",")) {
      fail(`${where}: keys must be in the order ${VERSION_KEYS.join(", ")}, not ${keys.join(", ")}`);
    }

    if (semver.valid(item.version) !== item.version) {
      fail(`${where}.version: ${item.version} is not a valid semver version`);
      return;
    }
    if (semver.validRange(item.freelens) === null) {
      fail(`${where}.freelens: ${item.freelens} is not a valid semver range`);
    } else if (!semver.intersects(item.freelens, MARKETPLACE_FREELENS)) {
      fail(`${where}.freelens: ${item.freelens} admits no Freelens ${MARKETPLACE_FREELENS}, which has the marketplace`);
    }
    if (seen.has(item.version)) {
      fail(`${where}.version: ${item.version} is listed more than once`);
    } else if (previous !== undefined && semver.compare(previous, item.version) <= 0) {
      fail(`${where}.version: ${item.version} must be older than ${previous}, as versions are listed newest first`);
    }
    seen.add(item.version);
    previous = item.version;
  });
}

function checkIcon(dirName, icon, fail) {
  const path = join(EXTENSIONS_DIR, dirName, icon);
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`spec.icon: extensions/${dirName}/${icon} does not exist`);
    return;
  }
  const size = statSync(path).size;
  if (size > ICON_MAX_BYTES) {
    fail(`spec.icon: ${icon} has ${size} bytes, more than ${ICON_MAX_BYTES}`);
  }
  const data = readFileSync(path);
  // A PNG starts with its signature and the IHDR chunk, which holds the width
  // and the height as 32-bit big-endian integers.
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE) || data.toString("ascii", 12, 16) !== "IHDR") {
    fail(`spec.icon: ${icon} is not a PNG file`);
    return;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== height) {
    fail(`spec.icon: ${icon} is ${width}x${height}, not square`);
  }
  if (width < ICON_MIN_SIZE || height < ICON_MIN_SIZE) {
    fail(`spec.icon: ${icon} is ${width}x${height}, smaller than ${ICON_MIN_SIZE}x${ICON_MIN_SIZE}`);
  }
}

function main() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(loadSchema(ENTRY_SCHEMA));
  ajv.addSchema(loadSchema(LIST_SCHEMA));
  const validateEntry = ajv.getSchema(loadSchema(ENTRY_SCHEMA).$id);
  const validateList = ajv.getSchema(loadSchema(LIST_SCHEMA).$id);

  const errors = [];
  const items = [];
  const names = new Map();
  const packages = new Map();

  for (const { dirName, manifestPath } of findEntries(errors)) {
    const relPath = relative(REPO_ROOT, manifestPath);
    const fail = (message) => errors.push(`${relPath}: ${message}`);

    let doc;
    try {
      doc = load(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      fail(error.message);
      continue;
    }

    if (!validateEntry(doc)) {
      for (const error of validateEntry.errors) {
        fail(`${error.instancePath || "/"} ${error.message}`);
      }
      continue;
    }

    const { metadata, spec } = doc;
    if (metadata.name !== dirName) {
      fail(`metadata.name ${metadata.name} must be equal to the name of its directory, ${dirName}`);
    }
    if (names.has(metadata.name)) {
      fail(`metadata.name ${metadata.name} is taken by ${names.get(metadata.name)}`);
    }
    names.set(metadata.name, relPath);
    if (packages.has(spec.package)) {
      fail(`spec.package ${spec.package} is taken by ${packages.get(spec.package)}`);
    }
    packages.set(spec.package, relPath);

    checkVersions(spec, fail);
    if (spec.icon !== undefined) {
      checkIcon(dirName, spec.icon, fail);
    }

    items.push(doc);
  }

  if (errors.length > 0) {
    console.error(`Invalid manifests:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }

  items.sort(
    (a, b) => TIER_ORDER[a.spec.tier] - TIER_ORDER[b.spec.tier] || a.metadata.name.localeCompare(b.metadata.name),
  );

  const list = {
    apiVersion: API_VERSION,
    kind: "MarketplaceExtensionList",
    items,
  };

  if (!validateList(list)) {
    const details = ajv.errorsText(validateList.errors, { separator: "\n  " });
    console.error(`Invalid list:\n  ${details}`);
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
  console.log(`Wrote ${relative(REPO_ROOT, OUTPUT_PATH)} with ${items.length} extension(s).`);
}

main();
