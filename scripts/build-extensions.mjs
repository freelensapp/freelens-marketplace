#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EXTENSIONS_DIR = join(REPO_ROOT, "extensions");
const SCHEMA_PATH = join(REPO_ROOT, "schema", "lens-extension.schema.json");
const OUTPUT_PATH = join(REPO_ROOT, "extensions.json");
const SCHEMA_VERSION = "lens-extension/v1";

function findManifests(dir) {
  const out = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      out.push(...findManifests(full));
    } else if (dirent.name === "extension.yaml") {
      out.push(full);
    }
  }
  return out;
}

function loadSchema() {
  const raw = readFileSync(SCHEMA_PATH, "utf8");
  return JSON.parse(raw);
}

function loadManifest(path) {
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw);
}

function main() {
  const schema = loadSchema();
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const manifestPaths = findManifests(EXTENSIONS_DIR);
  const extensions = [];

  for (const manifestPath of manifestPaths) {
    const doc = loadManifest(manifestPath);
    const ok = validate(doc);
    if (!ok) {
      const relPath = relative(REPO_ROOT, manifestPath);
      const details = ajv.errorsText(validate.errors, { separator: "\n  " });
      throw new Error(`Invalid manifest ${relPath}:\n  ${details}`);
    }
    extensions.push(doc);
  }

  extensions.sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    meta: {
      version: 0,
    },
    extensions,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${OUTPUT_PATH} with ${extensions.length} extension(s).`
  );
}

main();
