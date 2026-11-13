// 최소 zip 리더 (ADR-08) — stored(0)·deflate(8)만. zip64·암호화·여러 디스크는 거부.
// 중앙 디렉터리를 기준으로 읽는다.
import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/**
 * @param {Buffer} buf
 * @param {object} [o]
 * @param {number} [o.maxEntries=200]
 * @param {number} [o.maxEntryBytes]  압축 해제 후 항목당 상한 (zip 폭탄 방지)
 * @returns {Array<{name:string, data:Buffer, dir:boolean}>}
 */
export function readZip(buf, { maxEntries = 200, maxEntryBytes = 64 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('zip 형식이 아닙니다');
  // EOCD: 끝에서 최대 65557 바이트 안
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('zip 형식이 아닙니다');
  const disk = buf.readUInt16LE(eocd + 4);
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (disk !== 0 || total === 0xffff || cdOff === 0xffffffff) throw new ZipError('zip64·분할 zip 은 지원하지 않습니다');
  if (total > maxEntries) throw new ZipError(`항목이 너무 많습니다 (${total})`);
  if (cdOff + cdSize > buf.length) throw new ZipError('zip 이 손상되었습니다');

  const out = [];
  let p = cdOff;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new ZipError('zip 중앙 디렉터리 손상');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const loc = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    p += 46 + nlen + elen + clen;

    if (flags & 0x1) throw new ZipError('암호화된 zip 은 지원하지 않습니다');
    if (csize === 0xffffffff || usize === 0xffffffff) throw new ZipError('zip64 는 지원하지 않습니다');
    if (usize > maxEntryBytes) throw new ZipError(`항목이 너무 큽니다: ${name}`);
    if (buf.readUInt32LE(loc) !== LOC_SIG) throw new ZipError('zip 로컬 헤더 손상');
    const lnlen = buf.readUInt16LE(loc + 26);
    const lelen = buf.readUInt16LE(loc + 28);
    const start = loc + 30 + lnlen + lelen;
    if (start + csize > buf.length) throw new ZipError('zip 이 손상되었습니다');
    const raw = buf.subarray(start, start + csize);
    const dir = name.endsWith('/');
    let data;
    if (dir) data = Buffer.alloc(0);
    else if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: maxEntryBytes });
    else throw new ZipError(`지원하지 않는 압축 방식: ${method}`);
    if (!dir && data.length !== usize) throw new ZipError(`zip 항목 크기 불일치: ${name}`);
    out.push({ name, data, dir });
  }
  return out;
}

// ---- 테스트·도구용 최소 zip 쓰기 (stored 또는 deflate) ------------------------
import { deflateRawSync, crc32 } from 'node:zlib';

export function writeZip(entries, { deflate = true } = {}) {
  const locals = [];
  const cens = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data ?? []);
    const method = deflate && data.length ? 8 : 0;
    const comp = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(LOC_SIG, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(CEN_SIG, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    cens.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cens);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD_SIG, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
