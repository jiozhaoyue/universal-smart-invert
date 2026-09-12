'use strict';
/*
 * scripts/lib/zip.js — minimal ZIP writer + central-directory reader (zero dependencies).
 *
 * Both sides are hand-rolled from the PKWARE APPNOTE structure:
 *   - buildZip(entries):  stored-mode (method 0, no compression) archive builder.
 *     Local file headers + central directory + end-of-central-directory record.
 *     Timestamps are fixed to the DOS epoch (1980-01-01) so identical inputs yield
 *     byte-identical archives (deterministic packaging, stable for CI caches/diffs).
 *   - readCentralDirectory(buf): strict-enough reader used by scripts/pack.js and the
 *     test-browser.js node-only extension smoke to verify written archives.
 *
 * Only Node built-ins are used (no npm install anywhere in this project).
 */

// CRC-32 lookup table (IEEE 802.3, reflected polynomial 0xEDB88320).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// DOS epoch 1980-01-01 00:00:00 — deterministic; ZIP viewers accept it.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // (year-1980)<<9 | month<<5 | day  →  1980-01-01

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * Build a stored-mode (uncompressed) ZIP archive.
 * @param {Array<{name: string, data: Buffer}>} entries file names use forward slashes
 * @returns {Buffer}
 */
function buildZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('zip.buildZip: entries must be a non-empty array');
  }
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !Buffer.isBuffer(entry.data)) {
      throw new Error('zip.buildZip: each entry needs { name: string, data: Buffer }');
    }
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const sum = crc32(data);
    // UTF-8 name flag (bit 11) only when the name is not pure ASCII.
    const flags = /^[\x20-\x7E]*$/.test(entry.name) ? 0 : 0x0800;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(SIG_LOCAL, 0);
    lh.writeUInt16LE(20, 4);            // version needed to extract
    lh.writeUInt16LE(flags, 6);         // general purpose flags
    lh.writeUInt16LE(0, 8);             // compression method: stored
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(sum, 14);          // crc-32
    lh.writeUInt32LE(data.length, 18);  // compressed size
    lh.writeUInt32LE(data.length, 22);  // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);            // extra field length
    localParts.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(SIG_CENTRAL, 0);
    ch.writeUInt16LE(20, 4);            // version made by
    ch.writeUInt16LE(20, 6);            // version needed to extract
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(0, 10);            // method: stored
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(sum, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);            // extra len
    ch.writeUInt16LE(0, 32);            // comment len
    ch.writeUInt16LE(0, 34);            // disk number start
    ch.writeUInt16LE(0, 36);            // internal attrs
    ch.writeUInt32LE(0, 38);            // external attrs
    ch.writeUInt32LE(offset, 42);       // local header offset
    centralParts.push(ch, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  let centralSize = 0;
  for (const p of centralParts) centralSize += p.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);             // disk number
  eocd.writeUInt16LE(0, 6);             // disk with central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);       // central directory offset
  eocd.writeUInt16LE(0, 20);            // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/**
 * Parse the central directory of a ZIP buffer (reader side, used for verification).
 * @param {Buffer} buf
 * @returns {{count: number, entries: Array<{name: string, method: number, crc: number, size: number}>}}
 */
function readCentralDirectory(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('zip.readCentralDirectory: need a Buffer');
  // Scan backwards for the EOCD record (comment may append up to 65535 bytes).
  const minPos = Math.max(0, buf.length - 22 - 65535);
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error('zip: end of central directory not found (not a ZIP?)');

  const count = buf.readUInt16LE(eocdPos + 10);
  const cdOffset = buf.readUInt32LE(eocdPos + 16);
  let ptr = cdOffset;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== SIG_CENTRAL) {
      throw new Error('zip: corrupt central directory entry ' + i);
    }
    const flags = buf.readUInt16LE(ptr + 8);
    const method = buf.readUInt16LE(ptr + 10);
    const crc = buf.readUInt32LE(ptr + 16);
    const size = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    entries.push({ name, method, crc, size, utf8Flag: (flags & 0x0800) !== 0 });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return { count, entries };
}

module.exports = { buildZip, readCentralDirectory, crc32 };
