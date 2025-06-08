const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const glob = require('glob');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const MEDIA_ROOT = path.join(PROJECT_ROOT, 'web', 'public', 'media');

const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const SLACK_TOKEN = process.env.SLACK_TOKEN || '';
if (!SLACK_TOKEN) {
  console.warn('Warning: SLACK_TOKEN not set in environment. The downloader will use the token in its config.');
}

const downloadScript = path.join(PROJECT_ROOT, 'src', 'download-media.js');
const replaceScript = path.join(PROJECT_ROOT, 'src', 'replace-media-links.js');

const processLog = (logPath) => {
  const logName = path.basename(logPath, '.json');
  const mediaDir = path.join(MEDIA_ROOT, logName);
  console.log(`\n=== Processing log: ${logPath}`);
  // Download media
  const downloadRes = spawnSync('node', [
    downloadScript,
    '--log', logPath,
    '--out', mediaDir
  ], { stdio: 'inherit', env: { ...process.env, SLACK_TOKEN } });
  if (downloadRes.status !== 0) {
    console.error(`Media download failed for ${logPath}`);
    return;
  }
  // Replace links
  const replaceRes = spawnSync('node', [
    replaceScript,
    '--log', logPath,
    '--media', mediaDir
  ], { stdio: 'inherit' });
  if (replaceRes.status !== 0) {
    console.error(`Media replacer failed for ${logPath}`);
    return;
  }
  console.log(`Done processing ${logPath}`);
};

const main = () => {
  if (args.includes('--all')) {
    const logFiles = glob.sync(path.join(LOGS_DIR, '*.json'));
    for (const logFile of logFiles) {
      processLog(logFile);
    }
  } else if (args.includes('--log')) {
    const logPath = getArg('--log');
    if (!logPath) {
      console.error('Usage: node batch-media-process.js --log <logfile> OR --all');
      process.exit(1);
    }
    processLog(path.isAbsolute(logPath) ? logPath : path.join(LOGS_DIR, logPath));
  } else {
    console.error('Usage: node batch-media-process.js --log <logfile> OR --all');
    process.exit(1);
  }
};

main(); 