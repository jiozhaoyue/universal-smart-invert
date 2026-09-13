// Sync Dark Reader upstream config sources into machine-generated,
// ONE-CLICK-MERGEABLE compat files for this project.
//
// Why conflict-free: every file under rules/ is regenerated WHOLESALE on each
// run (never hand-edited), so git merges/PRs of these artifacts are always
// clean. The .import.json uses the svi-rules envelope consumed by the settings
// panel's 导入并合并 path, which dedups arrays per contract.
//
// License note: darkreader/darkreader is AGPL-3.0; this project is
// AGPL-3.0-or-later since v4.1.0, so ingesting their config data is compliant.
// Source attribution is embedded in every generated artifact.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('assert');

const REPO = 'darkreader/darkreader';
const REF = 'main';
const SOURCES = [
  { key: 'darkSites', file: 'src/config/dark-sites.config', note: 'sites Dark Reader considers already-dark (inversion blacklist seeds)' },
  { key: 'inversionFixes', file: 'src/config/inversion-fixes.config', note: 'per-site inversion fix hosts' },
];

const root = path.join(__dirname, '..');
const version = (fs.readFileSync(path.join(root, 'universal-smart-invert.user.js'), 'utf8').match(/\/\/\s*@version\s+(\S+)/) || [])[1];
assert.ok(version, 'cannot read @version');

// curl honors HTTPS_PROXY/HTTP_PROXY env automatically — works behind local
// proxies and on CI runners alike, no Node proxy plumbing required.
function fetchText(url) {
  try {
    return execFileSync('curl', ['-sSLf', '--max-time', '90', '-A', 'universal-smart-invert-sync', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error('fetch failed for ' + url + ' (curl exit ' + e.status + '): is the network/proxy reachable?');
  }
}

// DR .config files are newline-separated host patterns ("*.cdn.net", "example.com").
// Normalize: strip leading "*.", drop residual wildcards/puns, dedupe, sort.
function extractHosts(text) {
  const hosts = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    let h = rawLine.trim().toLowerCase();
    if (!h || h.startsWith('/') || h.startsWith('#') || h.startsWith('!')) continue;
    while (h.startsWith('*.')) h = h.slice(2);
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(h)) continue;
    if (h.includes('*')) continue;
    hosts.add(h);
  }
  return Array.from(hosts).sort();
}

(async () => {
  const out = {
    schema: 1,
    kind: 'svi-darkreader-compat',
    generatedAt: new Date().toISOString(),
    generator: 'scripts/sync-darkreader.js',
    projectVersion: version,
    source: {
      repo: REPO,
      ref: REF,
      license: 'AGPL-3.0 (this project is AGPL-3.0-or-later — compatible)',
      files: SOURCES.map((s) => ({ file: s.file, note: s.note })),
    },
  };
  for (const s of SOURCES) {
    const text = fetchText(`https://raw.githubusercontent.com/${REPO}/${REF}/${s.file}`);
    out[s.key] = extractHosts(text);
    console.log('[sync-darkreader]', s.file, '→', out[s.key].length, 'hosts');
  }
  assert.ok(out.darkSites.length > 50, 'dark-sites extraction looks broken (too few hosts)');

  const rulesDir = path.join(root, 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  const compatPath = path.join(rulesDir, 'darkreader-compat.json');
  fs.writeFileSync(compatPath, JSON.stringify(out, null, 2) + '\n');
  console.log('[sync-darkreader] wrote', path.relative(root, compatPath));

  const importEnvelope = {
    kind: 'svi-rules',
    schema: 1,
    version,
    exportedAt: new Date().toISOString(),
    generator: 'scripts/sync-darkreader.js',
    note: 'Machine-generated Dark Reader compatibility seeds (dark-sites → siteBlacklist). Import via 设置 → 数据与备份 → 导入并合并; array merge dedups, idempotent.',
    rules: {
      siteBlacklist: out.darkSites,
    },
  };
  const importPath = path.join(rulesDir, 'darkreader-compat.import.json');
  fs.writeFileSync(importPath, JSON.stringify(importEnvelope, null, 2) + '\n');
  console.log('[sync-darkreader] wrote', path.relative(root, importPath), '(one-click merge: ' + importEnvelope.rules.siteBlacklist.length + ' blacklist seeds)');
})().catch((e) => {
  console.error('[sync-darkreader] FAILED:', e.message);
  process.exit(1);
});
