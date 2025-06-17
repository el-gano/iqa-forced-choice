const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, '../public/images');
const manifest = {};

fs.readdirSync(imagesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .forEach(dirent => {
    const scene = dirent.name;
    const sceneDir = path.join(imagesDir, scene);
    const files = fs.readdirSync(sceneDir)
      .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));
    manifest[scene] = files;
  });

const outPath = path.join(__dirname, '../public/image-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest written to ${outPath}`);