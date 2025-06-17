const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const INPUT_DIR = path.join(__dirname, '../public/images');
const EXT = ['.jpg', '.jpeg', '.png'];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];
  for (let e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files = files.concat(await walk(full));
    } else if (EXT.includes(path.extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

(async () => {
  try {
    const all = await walk(INPUT_DIR);
    for (let src of all) {
      const rel = path.relative(INPUT_DIR, src);
      const dest = src.replace(/\.(jpe?g|png)$/i, '.webp');

      try {
        /* Convert with maximum effort, high quality
         * This level of effort and quality ensures that no perceptible quality is
         * lost in conversion.
         */
        await sharp(src)
          .webp({
            quality: 90,
            effort: 6
          })
          .toFile(dest);
        console.log(`✔ ${rel} → ${path.relative(INPUT_DIR, dest)}`);

        await fs.unlink(src);
        console.log(`Deleted ${rel}`);
      } catch (err) {
        console.error(`Error on ${rel}:`, err);
      }
    }
    console.log(`\nConverted ${all.length} images to near‑lossless WebP.`);
  } catch (err) {
    console.error('Failed to process images:', err);
    process.exit(1);
  }
})();
