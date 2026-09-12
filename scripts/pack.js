'use strict';
/*
 * scripts/pack.js — package extension/ into a distributable ZIP (zero dependencies).
 *
 * Uses scripts/lib/zip.js (stored-mode writer) to pack every file under
 * extension/ (manifest.json at ZIP root, as the Chrome Web Store requires)
 * into dist/universal-smart-invert-extension-v<version>.zip, then verifies
 * the archive by parsing its central directory. Never commit dist/ (it is
 * gitignored); CI uploads the artifact from here.
 *
 * Deterministic: fixed file order (sorted), fixed DOS-epoch timestamps, so
 * identical extension/ content produces a byte-identical archive.
 */

const fs = require('fs');
const path = require('path');
const { buildZip, readCentralDirectory, crc32 } = require(path.join(__dirname, 'lib', 'zip.js'));

const ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT, 'extension');
const DIST_DIR = path.join(ROOT, 'dist');

function fail(msg) {
  console.error('[pack] ERROR: ' + msg);
  process.exit(1);
}

// Collect all files under dir as POSIX-style relative paths, sorted for determinism.
function collectFiles(dir, baseDir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, baseDir));
    } else if (entry.isFile()) {
      out.push(path.relative(baseDir, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
    fail('extension/manifest.json not found — run: node scripts/build-extension.js');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  if (!version) fail('manifest.json has no version field');

  const files = collectFiles(EXT_DIR, EXT_DIR);
  if (!files.includes('manifest.json')) fail('manifest.json missing from extension/ file set');

  const entries = files.map((name) => ({
    name,
    data: fs.readFileSync(path.join(EXT_DIR, ...name.split('/'))),
  }));
  const zip = buildZip(entries);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const zipName = `universal-smart-invert-extension-v${version}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);
  fs.writeFileSync(zipPath, zip);

  // Verify: parse the central directory of the file we just wrote.
  const written = fs.readFileSync(zipPath);
  const cd = readCentralDirectory(written);
  if (cd.count !== entries.length) fail(`central directory count ${cd.count} != ${entries.length}`);
  for (let i = 0; i < entries.length; i++) {
    if (cd.entries[i].name !== entries[i].name) fail(`entry ${i} name mismatch: ${cd.entries[i].name} != ${entries[i].name}`);
    if (cd.entries[i].method !== 0) fail(`entry ${cd.entries[i].name} is not stored-mode`);
    if (cd.entries[i].size !== entries[i].data.length) fail(`entry ${cd.entries[i].name} size mismatch`);
    if (cd.entries[i].crc !== crc32(entries[i].data)) fail(`entry ${cd.entries[i].name} crc mismatch`);
  }

  console.log('[pack] packed ' + entries.length + ' files (' + zip.length + ' bytes) from extension/:');
  for (const name of files) console.log('  ' + name);
  console.log('[pack] output  : ' + path.relative(ROOT, zipPath));
  console.log('[pack] verified: central directory parses, ' + cd.count + ' entries, stored-mode, CRC OK');
}

main();
