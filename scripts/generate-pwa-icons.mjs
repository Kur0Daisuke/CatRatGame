import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icons/icon-source.svg'));

for (const size of [180, 192, 512]) {
    const out = join(root, `public/icons/icon-${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log('wrote', out);
}
