const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const glob = require('glob');

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
const SLACK_TOKEN = process.env.SLACK_TOKEN || '';
if (!SLACK_TOKEN) {
  console.error('ERROR: SLACK_TOKEN environment variable is not set!');
  console.error('Please set your Slack token: export SLACK_TOKEN="your-token-here"');
  process.exit(1);
}
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

async function downloadFile(url, dest, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await mkdirp.mkdirp(path.dirname(dest));
  
  // Use Node.js streams for native fetch compatibility
  const { Readable } = require('stream');
  const { pipeline } = require('stream/promises');
  
  const nodeStream = Readable.fromWeb(res.body);
  const fileStream = fs.createWriteStream(dest);
  
  await pipeline(nodeStream, fileStream);
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
  // Use the path as-is if absolute, or resolve relative to PROJECT_ROOT
  const logPath = path.isAbsolute(logArg) ? logArg : path.resolve(PROJECT_ROOT, logArg);
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
  console.log(`Found ${allFiles.size} unique files to download.`);
  const CONCURRENCY = 10;
  const downloadQueue = Array.from(allFiles.entries());
  let count = 0;
  let index = 0;

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
      console.log(`Skipping non-Slack URL: ${url}`);
      return next();
    }
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const safeName = (name || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
    const localName = `${safeName}__${id}${safeExt}`;
    const dest = path.join(MEDIA_DIR, localName);
    if (fs.existsSync(dest)) {
      console.log(`[${++count}/${allFiles.size}] Already downloaded: ${localName}`);
      return next();
    }
    try {
      console.log(`[${++count}/${allFiles.size}] Downloading: ${localName}`);
      await downloadFile(url, dest, SLACK_TOKEN);
    } catch (e) {
      console.error(`Failed to download ${url}: ${e}`);
    }
    return next();
  }

  const promises = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(next());
  }
  await Promise.all(promises);
  // Write out the mapping for later use
  await mkdirp.mkdirp(MEDIA_DIR);
  fs.writeFileSync(path.join(MEDIA_DIR, 'media-map.json'), JSON.stringify(idToLocal, null, 2));
  console.log('Done!');
}

main(); 