/**
 * Draws Travyy's icon set (a white map pin on terracotta) into assets/. Run: node scripts/make-icons.js
 * Pure maths, 4x4 supersampled, so there's no design tool or SVG renderer to install.
 */
const path = require('node:path');
const Jimp = require('jimp-compact');

const BRAND = [0xd1, 0x43, 0x18];
const WHITE = [255, 255, 255];
const SS = 4;

/** Pin in unit space (0..1): head circle + a cone down to the tip, with a hole in the head. */
function pinCoverage(x, y, { cx = 0.5, cy = 0.42, r = 0.225, tipY = 0.84, hole = 0.09 } = {}) {
  const dx = x - cx;
  const dy = y - cy;
  const inHole = dx * dx + dy * dy <= hole * hole;
  if (inHole) return 0;
  if (dx * dx + dy * dy <= r * r) return 1;
  // Cone from the tip, tangent to the head.
  const d = tipY - cy;
  const alpha = Math.asin(r / d);
  const tx = x - cx;
  const ty = tipY - y; // distance up from the tip
  if (ty < 0) return 0;
  const angle = Math.atan2(Math.abs(tx), ty);
  const along = Math.hypot(tx, ty) * Math.cos(angle);
  return angle <= alpha && along <= Math.sqrt(d * d - r * r) * Math.cos(alpha) + 0.001 ? 1 : 0;
}

async function draw(file, size, { bg, fg, scale = 1 }) {
  const img = new Jimp(size, size, 0x00000000);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Scale about the centre so the pin can sit inside Android's safe zone.
          const ux = ((px + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5;
          const uy = ((py + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5;
          hit += pinCoverage(ux, uy);
        }
      }
      const a = hit / (SS * SS);
      let rgba;
      if (bg) {
        const c = bg.map((b, i) => Math.round(b * (1 - a) + fg[i] * a));
        rgba = [...c, 255];
      } else {
        rgba = [...fg, Math.round(a * 255)];
      }
      img.setPixelColor(Jimp.rgbaToInt(...rgba), px, py);
    }
  }
  await img.writeAsync(path.join(__dirname, '..', 'assets', file));
  console.log('wrote', file);
}

(async () => {
  await draw('icon.png', 1024, { bg: BRAND, fg: WHITE, scale: 0.92 });
  await draw('splash-icon.png', 1024, { fg: BRAND, scale: 1 });
  await draw('android-icon-foreground.png', 512, { fg: WHITE, scale: 0.62 });
  await draw('android-icon-monochrome.png', 432, { fg: WHITE, scale: 0.62 });
  const bg = new Jimp(512, 512, Jimp.rgbaToInt(...BRAND, 255));
  await bg.writeAsync(path.join(__dirname, '..', 'assets', 'android-icon-background.png'));
  await draw('favicon.png', 48, { bg: BRAND, fg: WHITE, scale: 0.95 });
})();
