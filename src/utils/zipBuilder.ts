// Pure TypeScript ZIP encoder (STORE / no-compression method)
// Implements PKZIP 2.0 spec — works in all modern browsers via Blob API

function makeCRCTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = makeCRCTable();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF]);
}
function merge(arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

export function buildZip(files: Record<string, string>): Blob {
  const enc = new TextEncoder();
  const localEntries: Uint8Array[] = [];
  const centralEntries: Uint8Array[] = [];
  let offset = 0;

  const d = new Date();
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);

  for (const [name, content] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const dataB = enc.encode(content);
    const crc   = crc32(dataB);
    const size  = dataB.length;

    // Local file header (30 bytes fixed) + name + data
    const local = merge([
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // PK local sig
      u16(20), u16(0), u16(0),                   // version=2.0, flags=0, compress=STORE
      u16(dosTime), u16(dosDate),
      u32(crc), u32(size), u32(size),
      u16(nameB.length), u16(0),
      nameB, dataB,
    ]);

    // Central directory entry (46 bytes fixed) + name
    const central = merge([
      new Uint8Array([0x50, 0x4B, 0x01, 0x02]), // PK central sig
      u16(20), u16(20), u16(0), u16(0),
      u16(dosTime), u16(dosDate),
      u32(crc), u32(size), u32(size),
      u16(nameB.length), u16(0), u16(0),         // name len, extra len, comment len
      u16(0), u16(0),                             // disk start, int attrs
      u32(0), u32(offset),                        // ext attrs, local header offset
      nameB,
    ]);

    localEntries.push(local);
    centralEntries.push(central);
    offset += local.length;
  }

  const cdData = merge(centralEntries);
  const count  = localEntries.length;

  // End of central directory record (22 bytes)
  const eocd = merge([
    new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
    u16(0), u16(0),
    u16(count), u16(count),
    u32(cdData.length), u32(offset),
    u16(0),
  ]);

  const zipBytes = merge([...localEntries, cdData, eocd]);
  return new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
