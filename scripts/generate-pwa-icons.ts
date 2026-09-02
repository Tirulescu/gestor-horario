import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { APP_BACKGROUND_COLOR, APPLE_SPLASH_SCREENS } from "../src/lib/pwa";

const root = path.resolve(__dirname, "..");
const masterPath = path.join(root, "assets/pwa/icon-master.png");

async function resizePng(source: Buffer, size: number, dest: string) {
  await sharp(source)
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
}

async function makeMaskable(master: Buffer, size: number) {
  const inner = Math.round(size * 0.72);
  const glyph = await sharp(master).resize(inner, inner).png().toBuffer();
  const { data } = await sharp(master).resize(32, 32).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp({
    create: { width: size, height: size, channels: 3, background: bg },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .png({ compressionLevel: 9 });
}

async function main() {
  const iconsDir = path.join(root, "public/icons");
  const splashDir = path.join(root, "public/splash");
  const appDir = path.join(root, "src/app");
  await mkdir(iconsDir, { recursive: true });
  await mkdir(splashDir, { recursive: true });

  const master = await readFile(masterPath);
  const sizes = [32, 48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024] as const;
  for (const size of sizes) {
    await resizePng(master, size, path.join(iconsDir, `icon-${size}.png`));
  }

  await (await makeMaskable(master, 192)).toFile(path.join(iconsDir, "icon-maskable-192.png"));
  await (await makeMaskable(master, 512)).toFile(path.join(iconsDir, "icon-maskable-512.png"));
  await resizePng(master, 180, path.join(iconsDir, "apple-touch-icon.png"));

  await resizePng(master, 32, path.join(appDir, "icon.png"));
  await resizePng(master, 180, path.join(appDir, "apple-icon.png"));

  const splashIcon = await sharp(master).resize(256, 256).png().toBuffer();
  for (const { width, height } of APPLE_SPLASH_SCREENS) {
    const iconSize = Math.round(Math.min(width, height) * 0.22);
    const icon = await sharp(splashIcon).resize(iconSize, iconSize).png().toBuffer();
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: APP_BACKGROUND_COLOR,
      },
    })
      .composite([{ input: icon, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(splashDir, `apple-splash-${width}-${height}.png`));
  }

  const png32 = await sharp(master)
    .resize(32, 32, { fit: "fill" })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(root, "public/favicon.ico"), buildPngIco(png32));

  console.log("Iconos PWA generados en public/icons, public/splash y src/app.");
}

function buildPngIco(png: Buffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, png]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
