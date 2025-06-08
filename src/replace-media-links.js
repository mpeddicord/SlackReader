const fs = require('fs');
const path = require('path');

// Simple CLI arg parsing
const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const logPath = getArg('--log');
const mediaDir = getArg('--media', path.join(__dirname, '../media'));
if (!logPath) {
  console.error('Usage: node replace-media-links.js --log <logfile> [--media <media_dir>]\n  (media_dir should match the downloader --out folder)');
  process.exit(1);
}

const mapPath = path.join(mediaDir, 'media-map.json');
if (!fs.existsSync(mapPath)) {
  console.error('media-map.json not found in', mediaDir);
  process.exit(1);
}

const mediaMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const logData = JSON.parse(fs.readFileSync(logPath, 'utf8'));

let changed = false;
for (const msg of logData) {
  if (msg.files && Array.isArray(msg.files)) {
    for (const file of msg.files) {
      if (file.id && mediaMap[file.id]) {
        const localPath = path.join('media', mediaMap[file.id]);
        file.local_path = localPath;
        file.url_private = localPath;
        file.permalink = localPath;
        file.permalink_public = localPath;
        // Replace all thumb_* fields
        Object.keys(file).forEach(key => {
          if (key.startsWith('thumb_')) {
            file[key] = localPath;
          }
        });
        changed = true;
      }
    }
  }
}

const CONVERTED_LOGS_DIR = path.join(__dirname, '../converted-logs');
if (!fs.existsSync(CONVERTED_LOGS_DIR)) {
  fs.mkdirSync(CONVERTED_LOGS_DIR, { recursive: true });
}
const outPath = path.join(CONVERTED_LOGS_DIR, path.basename(logPath).replace(/\.json$/, '.local.json'));
fs.writeFileSync(outPath, JSON.stringify(logData, null, 2));
console.log(`Updated log written to ${outPath}`);
if (!changed) {
  console.log('No files were updated with local paths.');
} 