import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Small code-drawn PNGs, with no image library or remote assets.
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([length, t, data, crc]); }
const root = fileURLToPath(new URL('../extension/icons/', import.meta.url));
await mkdir(root, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = [0, 0, 0, 0];
    const u = (x + .5) / size, v = (y + .5) / size;
    if (u > .08 && u < .92 && v > .04 && v < .82 + .14 * (1 - Math.abs(u - .5) / .42)) color = [50, 100, 85, 255];
    if (v > .27 && v < .68 && ((u > .32 && u < .43) || (u > .57 && u < .68))) color = [255, 254, 249, 255];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  await writeFile(`${root}/${size}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}
