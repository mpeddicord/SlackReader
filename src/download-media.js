const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const glob = require('glob');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PROJECT_ROOT = path.resolve(__dirname, '..');
// Simple CLI arg parsing
const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const outDir = getArg('--out', path.join(PROJECT_ROOT, 'media'));
const MEDIA_DIR = path.isAbsolute(outDir) ? outDir : path.join(PROJECT_ROOT, outDir);
console.log('Media output directory:', MEDIA_DIR);

// ---- CONFIG ----
const SLACK_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

async function downloadFile(url, dest, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await mkdirp.mkdirp(path.dirname(dest));
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

function getAllLogFiles() {
  console.log('Looking for logs in:', LOGS_DIR);
  console.log('Directory contents:', fs.readdirSync(LOGS_DIR));
  const files = glob.sync(LOGS_DIR.replace(/\\/g, '/') + '/*.json');
  console.log('Found log files:', files);
  return files;
}

function extractFileUrlsFromLog(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  let messages;
  try {
    messages = JSON.parse(content);
  } catch (e) {
    console.error(`Failed to parse ${logPath}: ${e}`);
    return [];
  }
  const urls = [];
  for (const msg of messages) {
    if (msg.files && Array.isArray(msg.files)) {
      for (const file of msg.files) {
        // Prefer url_private, fallback to permalink_public, then permalink
        const url = file.url_private || file.permalink_public || file.permalink;
        if (url && file.id) {
          const ext = path.extname(file.name || '') || '.bin';
          urls.push({ url, name: file.name, id: file.id, ext });
        }
      }
    }
  }
  return urls;
}

const logArg = getArg('--log');
let logFiles;
if (logArg) {
  // Support both absolute and relative paths
  const logPath = path.isAbsolute(logArg) ? logArg : path.join(LOGS_DIR, logArg);
  logFiles = [logPath];
  console.log('Processing single log file:', logPath);
} else {
  logFiles = getAllLogFiles();
}

async function main() {
  const allFiles = new Map();
  // Map of id to local path (with log name prefix)
  const idToLocal = {};
  for (const logFile of logFiles) {
    const logName = path.basename(logFile, '.json');
    const files = extractFileUrlsFromLog(logFile);
    for (const f of files) {
      if (!allFiles.has(f.url)) {
        allFiles.set(f.url, f);
      }
      // Always set the mapping for this id to include the log name
      if (f.id) {
        const safeExt = f.ext.replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
        const safeName = (f.name || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
        const localName = `${safeName}__${f.id}${safeExt}`;
        idToLocal[f.id] = path.posix.join(logName, localName);
      }
    }
  }
  
  const CONCURRENCY = 10;
  const downloadQueue = Array.from(allFiles.entries());
  let count = 0;
  let index = 0;
  let alreadyDownloaded = 0;
  let skipped = 0;
  let failed = 0;
  let downloaded = 0;

  // Progress bar function
  function updateProgress() {
    const total = allFiles.size;
    const progress = count / total * 100;
    const barLength = 20;  // Shorter bar for inline display
    const filled = Math.floor(progress / 100 * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    process.stdout.write(`\r[${bar}] ${progress.toFixed(1)}% (${count}/${total})`);
  }

  async function next() {
    if (index >= downloadQueue.length) return;
    const [url, fileObj] = downloadQueue[index++];
    const { name, id, ext } = fileObj;
    if (!id) return next();
    
    // Skip non-Slack URLs
    if (
      !url.startsWith('https://files.slack.com/') &&
      !url.startsWith('https://slack-files.com/')
    ) {
      skipped++;
      count++;
      updateProgress();
      return next();
    }

    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const safeName = (name || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
    const localName = `${safeName}__${id}${safeExt}`;
    const dest = path.join(MEDIA_DIR, localName);
    
    if (fs.existsSync(dest)) {
      alreadyDownloaded++;
      count++;
      updateProgress();
      return next();
    }

    try {
      await downloadFile(url, dest, SLACK_TOKEN);
      downloaded++;
    } catch (e) {
      console.error(`\nFailed to download ${url}: ${e}`);
      failed++;
    }
    count++;
    updateProgress();
    return next();
  }

  if (allFiles.size > 0) {
    console.log(`Processing ${allFiles.size} files...`);
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(next());
    }
    await Promise.all(promises);
    console.log('\n');
  }
  
  // Write out the mapping for later use
  await mkdirp.mkdirp(MEDIA_DIR);
  fs.writeFileSync(path.join(MEDIA_DIR, 'media-map.json'), JSON.stringify(idToLocal, null, 2));
  
  // Print final summary in a single line
  const summary = `Download Summary: ${allFiles.size} total, ${alreadyDownloaded} existing, ${downloaded} new, ${skipped} skipped, ${failed} failed`;
  console.log(summary);
  console.log('Done!');
}

main(); 