const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function extract() {
  const icoPath = path.join(__dirname, '..', 'public', 'assets', 'icon.ico');
  const publicDir = path.join(__dirname, '..', 'public');
  const buf = fs.readFileSync(icoPath);

  // Copy icon.ico directly to public/favicon.ico for standard browser root discovery
  fs.copyFileSync(icoPath, path.join(publicDir, 'favicon.ico'));

  // If favicon.svg exists, delete it so browsers don't prioritize SVG over the authentic ICO/PNG
  const svgPath = path.join(publicDir, 'favicon.svg');
  if (fs.existsSync(svgPath)) {
    fs.unlinkSync(svgPath);
  }

  const offset = 6;
  const size = buf.readUInt32LE(offset + 8);
  const imgOffset = buf.readUInt32LE(offset + 12);
  const dib = buf.slice(imgOffset, imgOffset + size);

  const headerSize = dib.readUInt32LE(0);
  const dibWidth = dib.readInt32LE(4);
  const dibHeight = Math.floor(dib.readInt32LE(8) / 2);
  const bpp = dib.readUInt16LE(14);

  const rawPixels = Buffer.alloc(dibWidth * dibHeight * 4);
  const pixelOffset = headerSize;

  if (bpp === 32) {
    for (let y = 0; y < dibHeight; y++) {
      const srcRow = (dibHeight - 1 - y) * dibWidth * 4;
      const dstRow = y * dibWidth * 4;
      for (let x = 0; x < dibWidth; x++) {
        const srcIdx = pixelOffset + srcRow + x * 4;
        const dstIdx = dstRow + x * 4;
        const b = dib[srcIdx];
        const g = dib[srcIdx + 1];
        const r = dib[srcIdx + 2];
        const a = dib[srcIdx + 3];
        rawPixels[dstIdx] = r;
        rawPixels[dstIdx + 1] = g;
        rawPixels[dstIdx + 2] = b;
        rawPixels[dstIdx + 3] = a;
      }
    }
  }

  const baseImage = sharp(rawPixels, {
    raw: {
      width: dibWidth,
      height: dibHeight,
      channels: 4
    }
  });

  // Standard Favicon PNG sizes
  await baseImage
    .clone()
    .resize(32, 32, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  await baseImage
    .clone()
    .resize(16, 16, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  // PWA & Apple Touch Icons
  await baseImage
    .clone()
    .resize(192, 192, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await baseImage
    .clone()
    .resize(512, 512, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  await baseImage
    .clone()
    .resize(410, 410, { kernel: 'lanczos3' })
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  await baseImage
    .clone()
    .resize(180, 180, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('Successfully updated favicon.ico, favicon-32x32.png, favicon-16x16.png and all PWA icons!');
}

extract().catch(console.error);
