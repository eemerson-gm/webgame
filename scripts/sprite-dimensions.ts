import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const spritePath = process.argv[2];

if (!spritePath) {
  console.error("Usage: tsx scripts/sprite-dimensions.ts <sprite-path>");
  process.exit(1);
}

const buffer = readFileSync(resolve(spritePath));
const dimensions = readDimensions(buffer);

if (!dimensions) {
  console.error(`Could not read dimensions from ${spritePath}`);
  process.exit(1);
}

console.log(`${dimensions.width}x${dimensions.height}`);

function readDimensions(buffer: Buffer) {
  if (isPng(buffer)) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (isGif(buffer)) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (isJpeg(buffer)) {
    return readJpegDimensions(buffer);
  }

  return null;
}

function isPng(buffer: Buffer) {
  return buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a;
}

function isGif(buffer: Buffer) {
  return buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "GIF";
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function readJpegDimensions(buffer: Buffer) {
  const scan = (offset: number): { width: number; height: number } | null => {
    if (offset + 9 >= buffer.length) {
      return null;
    }

    if (buffer[offset] !== 0xff) {
      return scan(offset + 1);
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (isJpegSizeMarker(marker)) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    return scan(offset + 2 + segmentLength);
  };

  return scan(2);
}

function isJpegSizeMarker(marker: number) {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}
