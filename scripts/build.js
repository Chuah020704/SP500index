const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const srcDir = path.join(root, 'src');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of fs.readdirSync(publicDir)) {
  const from = path.join(publicDir, file);
  const to = path.join(dist, file);
  fs.cpSync(from, to, { recursive: true });
}

fs.copyFileSync(path.join(root, 'server.js'), path.join(dist, 'server.js'));
fs.cpSync(srcDir, path.join(dist, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'package.json'), path.join(dist, 'package.json'));
console.log('Built workstation assets into dist/.');
