// Reuse the original mesh, UVs, morph targets and animations; recolor only the coat.
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/car.glb'));
const jsonLength = source.readUInt32LE(12);
const original = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
const bin = source.subarray(28 + jsonLength);
const imageView = original.bufferViews[original.images[0].bufferView];
const png = bin.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength);
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
if (png[24] !== 8 || png[25] !== 2 || png[28] !== 0) throw new Error('Expected non-interlaced RGB8 texture');
const chunks = [];
for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
}
const packed = zlib.inflateSync(Buffer.concat(chunks));
const stride = width * 3;
const pixels = Buffer.alloc(stride * height);
function paeth(a, b, c) {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
        const i = y * stride + x;
        const a = x >= 3 ? pixels[i - 3] : 0;
        const b = y ? pixels[i - stride] : 0;
        const c = y && x >= 3 ? pixels[i - stride - 3] : 0;
        const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
        if (prediction === undefined) throw new Error('Invalid PNG filter');
        pixels[i] = (packed[y * (stride + 1) + x + 1] + prediction) & 255;
    }
}
function chunk(type, data) {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    let crc = 0xffffffff;
    for (const byte of out.subarray(4, -4)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
    return out;
}
const palettes = {
    orange: { shadow: [106, 48, 20], light: [255, 227, 174], gamma: 0.7 },
    white: { shadow: [164, 171, 182], light: [255, 253, 244], gamma: 0.55 },
    blue: { shadow: [33, 61, 103], light: [181, 215, 240], gamma: 0.7 }
};
fs.mkdirSync(path.join(root, 'public/models'), { recursive: true });
for (const [name, palette] of Object.entries(palettes)) {
    const scanlines = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        scanlines[y * (stride + 1)] = 1; // Sub filter keeps fur texture compact.
        const row = Buffer.alloc(stride);
        for (let x = 0; x < stride; x += 3) {
            const i = y * stride + x;
            const [r, g, b] = pixels.subarray(i, i + 3);
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const t = Math.pow(luminance / 255, palette.gamma);
            // Preserve dark pupils, nose, mouth and the original cool eye colors.
            const coat = Math.min(1, Math.max(0, (luminance - 27) / 24));
            const eye = b > r * 1.12 && g > r * 1.05;
            for (let channel = 0; channel < 3; channel++) {
                const color = palette.shadow[channel] + (palette.light[channel] - palette.shadow[channel]) * t;
                row[x + channel] = Math.round(pixels[i + channel] * (eye ? 1 : 1 - coat) + color * (eye ? 0 : coat));
            }
        }
        for (let x = 0; x < stride; x++) scanlines[y * (stride + 1) + x + 1] = (row[x] - (x >= 3 ? row[x - 3] : 0)) & 255;
    }
    const texture = Buffer.concat([png.subarray(0, 8), chunk('IHDR', png.subarray(16, 29)), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
    const doc = structuredClone(original);
    const oldEnd = Math.ceil((imageView.byteOffset + imageView.byteLength) / 4) * 4;
    const paddedTexture = Buffer.alloc(Math.ceil(texture.length / 4) * 4);
    texture.copy(paddedTexture);
    const newBin = Buffer.concat([bin.subarray(0, imageView.byteOffset), paddedTexture, bin.subarray(oldEnd)]);
    const shift = imageView.byteOffset + paddedTexture.length - oldEnd;
    doc.bufferViews.forEach((view, index) => {
        if (index === doc.images[0].bufferView) { view.byteLength = texture.length; view.name = `cat-${name}-coat`; }
        else if (view.byteOffset >= oldEnd) view.byteOffset += shift;
    });
    doc.buffers[0].byteLength = newBin.length;
    doc.materials[0].name = `Cat ${name} coat`;
    doc.asset.extras = { ...doc.asset.extras, coatVariant: name };
    const json = Buffer.from(JSON.stringify(doc));
    const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(paddedJson);
    const header = Buffer.alloc(20);
    header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + newBin.length, 8);
    header.writeUInt32LE(paddedJson.length, 12); header.write('JSON', 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(newBin.length); binHeader.write('BIN\0', 4);
    fs.writeFileSync(path.join(root, `public/models/cat-${name}.glb`), Buffer.concat([header, paddedJson, binHeader, newBin]));
    console.log(`Created cat-${name}.glb`);
}
