// Canonical 32x32 pixel drawing. No raster tracing, smoothing or external packages.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const directory = fileURLToPath(
  new URL("../assets/branding/", import.meta.url),
);
mkdirSync(directory, { recursive: true });
const size = 32;
const palette = {
  ".": [0, 0, 0, 0],
  b: [35, 37, 47, 255],
  p: [180, 148, 237, 255],
  w: [248, 243, 223, 255],
  g: [174, 246, 60, 255],
};
const pixels = Array.from({ length: size }, () => Array(size).fill("."));
function rect(x, y, width, height, color, dx = 0, dy = 0) {
  for (let row = y + dy; row < y + dy + height; row++) {
    for (let column = x + dx; column < x + dx + width; column++) {
      if (!pixels[row]?.[column] || !palette[color])
        throw new Error("Drawing exceeds the pixel grid");
      pixels[row][column] = color;
    }
  }
}
// Stepped corners are on the same pixel grid as the foreground.
rect(5, 1, 22, 30, "b");
rect(3, 2, 26, 28, "b");
rect(2, 3, 28, 26, "b");
rect(1, 5, 30, 22, "b");

// Shift the entire browser/globe/arrow group one logical pixel right and down.
const offset = { x: 1, y: 1 };
const draw = (x, y, width, height, color) =>
  rect(x, y, width, height, color, offset.x, offset.y);

// Browser frame and header: all strokes and gaps use the same integer cells.
draw(7, 5, 16, 1, "p");
draw(6, 6, 18, 1, "p");
draw(5, 7, 1, 17, "p");
draw(24, 7, 1, 17, "p");
draw(6, 10, 18, 1, "p");
draw(6, 24, 18, 1, "p");
draw(7, 25, 16, 1, "p");
for (const x of [8, 12, 16]) draw(x, 8, 2, 1, "w");

// Globe: simplified pixel outline, equator and meridians, no subpixel curves.
draw(11, 13, 5, 1, "w");
draw(9, 14, 2, 1, "w");
draw(16, 14, 2, 1, "w");
draw(8, 15, 1, 2, "w");
draw(18, 15, 1, 2, "w");
draw(7, 17, 1, 3, "w");
draw(19, 17, 1, 3, "w");
draw(8, 20, 1, 2, "w");
draw(18, 20, 1, 2, "w");
draw(9, 22, 2, 1, "w");
draw(16, 22, 2, 1, "w");
draw(11, 23, 5, 1, "w");
draw(8, 18, 11, 1, "w");
draw(13, 14, 1, 9, "w");
draw(11, 15, 1, 7, "w");
draw(16, 15, 1, 7, "w");

// Clear a one-cell dark separation where the arrow crosses the browser.
draw(23, 14, 2, 13, "b");
draw(17, 18, 7, 1, "b");
draw(17, 22, 7, 1, "b");
// One-cell staircase on both arrow diagonals, on the browser's exact grid.
draw(17, 19, 7, 3, "g");
for (let row = 15; row <= 25; row++) {
  const width = 6 - Math.abs(row - 20);
  draw(24, row, width, 1, "g");
}

const rows = pixels.map((row) => row.join(""));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 32 32" shape-rendering="crispEdges"><title>Site Runner</title>${rows.map((row, y) => [...row].map((key, x) => (key === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${palette[key].slice(0, 3).join(",")})"/>`)).join("")).join("")}</svg>\n`;
writeFileSync(path.join(directory, "icon.svg"), svg);
writeFileSync(
  path.join(directory, "pixel-grid.json"),
  JSON.stringify(
    {
      grid: size,
      artworkOffset: offset,
      palette,
      rows,
    },
    null,
    2,
  ) + "\n",
);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(edge) {
  const data = Buffer.alloc(edge * (edge * 4 + 1));
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const key =
        pixels[Math.min(31, Math.floor(((y + 0.5) * size) / edge))][
          Math.min(31, Math.floor(((x + 0.5) * size) / edge))
        ];
      data.set(palette[key], y * (edge * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(edge, 0);
  header.writeUInt32BE(edge, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(data)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const edge of [16, 32, 64, 128, 256, 512, 1024])
  writeFileSync(
    path.join(directory, edge === 1024 ? "icon.png" : `icon-${edge}.png`),
    png(edge),
  );

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);
const icoEntries = [],
  icoImages = [];
let position = 6 + icoSizes.length * 16;
for (const edge of icoSizes) {
  const data = png(edge),
    entry = Buffer.alloc(16);
  entry[0] = edge % 256;
  entry[1] = edge % 256;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(position, 12);
  icoEntries.push(entry);
  icoImages.push(data);
  position += data.length;
}
writeFileSync(
  path.join(directory, "icon.ico"),
  Buffer.concat([icoHeader, ...icoEntries, ...icoImages]),
);

const icnsEntries = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
].map(([type, edge]) => {
  const data = png(edge),
    header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(8 + data.length, 4);
  return Buffer.concat([header, data]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns");
icnsHeader.writeUInt32BE(
  8 + icnsEntries.reduce((sum, entry) => sum + entry.length, 0),
  4,
);
writeFileSync(
  path.join(directory, "icon.icns"),
  Buffer.concat([icnsHeader, ...icnsEntries]),
);
console.log(
  "Generated Site Runner icons from one 32x32 grid; artwork offset: +1, +1.",
);
