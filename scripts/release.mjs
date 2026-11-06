#!/usr/bin/env node
// Bump the app version everywhere, verify the build, commit, tag and push.
//
//   npm run release:patch            0.1.3 → 0.1.4
//   npm run release:minor            0.1.3 → 0.2.0
//   npm run release:major            0.1.3 → 1.0.0
//   npm run release:patch -- --dry-run   show what would happen, change nothing
//
// The version lives in five files. The installers and the auto-updater's
// latest.json take it from tauri.conf.json, so all of them must agree or
// users will never be offered the update.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const noPush = args.includes("--no-push");

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8", ...opts }).trim();
}

function step(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

// ── Work out the new version ───────────────────────────────────────────────
if (!["patch", "minor", "major"].includes(bump)) {
  fail("Usage: node scripts/release.mjs <patch|minor|major> [--dry-run] [--no-push]");
}

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) fail(`package.json version "${current}" is not plain MAJOR.MINOR.PATCH`);
let [major, minor, patch] = m.slice(1).map(Number);
if (bump === "major") [major, minor, patch] = [major + 1, 0, 0];
if (bump === "minor") [minor, patch] = [minor + 1, 0];
if (bump === "patch") patch += 1;
const next = `${major}.${minor}.${patch}`;
const tag = `v${next}`;

// ── Preflight checks ───────────────────────────────────────────────────────
const branch = run("git rev-parse --abbrev-ref HEAD");
const dirty = run("git status --porcelain");
const tagExists = run(`git tag --list ${tag}`) !== "";

// Every file must currently agree, or we'd be "bumping" from a wrong base.
const files = {
  "package.json": {
    read: (s) => JSON.parse(s).version,
    write: (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  },
  "package-lock.json": {
    read: (s) => JSON.parse(s).version,
    // Top-level version and the root package entry ("packages" → "").
    write: (s) => {
      const lock = JSON.parse(s);
      lock.version = next;
      if (lock.packages?.[""]) lock.packages[""].version = next;
      return JSON.stringify(lock, null, 2) + "\n";
    },
  },
  "src-tauri/tauri.conf.json": {
    read: (s) => JSON.parse(s).version,
    write: (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  },
  "src-tauri/Cargo.toml": {
    read: (s) => /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(s)?.[1],
    write: (s) => s.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${next}$2`),
  },
  "src-tauri/Cargo.lock": {
    read: (s) => /name = "stageclock"\nversion = "([^"]+)"/.exec(s)?.[1],
    write: (s) => s.replace(/(name = "stageclock"\nversion = ")[^"]+(")/, `$1${next}$2`),
  },
};

const mismatched = [];
for (const [file, f] of Object.entries(files)) {
  const v = f.read(readFileSync(join(root, file), "utf8"));
  if (v !== current) mismatched.push(`${file} has ${v ?? "no version"}`);
}

console.log(`StageClock release: ${current} → ${next}  (branch ${branch}${dryRun ? ", dry run" : ""})`);

const problems = [];
if (dirty) problems.push("You have uncommitted changes. Commit or stash them first:\n" + dirty);
if (tagExists) problems.push(`Tag ${tag} already exists.`);
if (mismatched.length) problems.push(`Versions are out of sync (expected ${current} everywhere):\n  ${mismatched.join("\n  ")}`);
if (branch !== "main") problems.push(`You're on "${branch}". Releases are made from main.`);
if (problems.length) {
  if (dryRun) {
    console.log("\nA real release would stop here:\n- " + problems.join("\n- "));
  } else {
    fail(problems.join("\n\n"));
  }
}

if (dryRun) {
  console.log(`\nWould update: ${Object.keys(files).join(", ")}`);
  console.log("Would run:    npm run build, cargo test");
  console.log(`Would commit: "chore: release ${tag}"`);
  console.log(`Would tag:    ${tag}`);
  console.log(noPush ? "Would not push (--no-push)." : `Would push:   main and ${tag} to origin`);
  console.log("\nNothing was changed.");
  process.exit(0);
}

// ── Bump, verify, commit, tag, push ────────────────────────────────────────
for (const [file, f] of Object.entries(files)) {
  const path = join(root, file);
  writeFileSync(path, f.write(readFileSync(path, "utf8")));
  const now = f.read(readFileSync(path, "utf8"));
  if (now !== next) fail(`Failed to update ${file} (it now says ${now}).`);
  console.log(`  ✔ ${file} → ${next}`);
}

try {
  step("npm run build");
  step("cargo test --quiet --manifest-path src-tauri/Cargo.toml");
} catch {
  // Put the version files back so a failed release leaves no trace.
  run(`git checkout -- ${Object.keys(files).join(" ")}`);
  fail("Build or tests failed. Version files were restored; nothing was committed.");
}

step(`git add ${Object.keys(files).join(" ")}`);
step(`git commit -m "chore: release ${tag}"`);
step(`git tag -a ${tag} -m "StageClock ${tag}"`);

if (noPush) {
  console.log(`\n✔ Committed and tagged ${tag}. Push when ready:\n  git push --atomic origin main ${tag}\n`);
} else {
  step(`git push --atomic origin main ${tag}`);
  console.log(
    `\n✔ Pushed ${tag}. GitHub Actions is building the installers into a draft release.\n` +
      "  When it finishes, publish the draft on GitHub so running apps get the update.\n"
  );
}
