const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const glob = require('glob');

const PROJECT_ROOT = __dirname;
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const BATCH_SCRIPT = path.join(PROJECT_ROOT, 'src', 'batch-media-process.js');
const MAX_PARALLEL = 4;

console.log('Looking for logs in:', LOGS_DIR);
console.log('LOGS_DIR:', LOGS_DIR);
console.log('Glob pattern:', path.join(LOGS_DIR, '*.json'));
console.log('Directory contents:', fs.readdirSync(LOGS_DIR));

const logsDir = path.resolve(__dirname, 'logs');
const pattern = path.join(logsDir, '*.json').replace(/\\/g, '/');
console.log('CWD:', process.cwd());
console.log('Pattern:', pattern);

const logFiles = glob.sync(pattern);
console.log('Found files:', logFiles);
if (logFiles.length === 0) {
  console.log('No log files found in logs/.');
  process.exit(0);
}

console.log(`Found ${logFiles.length} log files. Starting processing with concurrency ${MAX_PARALLEL}...`);

let completed = 0;
let failed = 0;
let running = 0;
let index = 0;
const children = [];

function printProgress() {
  const percent = ((completed + failed) / logFiles.length * 100).toFixed(1);
  process.stdout.write(`\rProgress: [${completed + failed}/${logFiles.length}] (${percent}%)`);
}

function next() {
  if (index >= logFiles.length) return;
  if (running >= MAX_PARALLEL) return;
  const logFile = logFiles[index++];
  running++;
  const proc = spawn('node', [BATCH_SCRIPT, '--log', logFile], { stdio: 'inherit' });
  children.push(proc);
  proc.on('exit', code => {
    running--;
    if (code === 0) {
      completed++;
    } else {
      failed++;
      console.error(`Failed to process ${logFile}`);
    }
    printProgress();
    if (completed + failed === logFiles.length) {
      console.log(`\nAll done! ${completed} succeeded, ${failed} failed.`);
      process.exit(failed ? 1 : 0);
    } else {
      next(); // Start next if available
    }
  });
  next(); // Start more if possible
}

function shutdown() {
  console.log('\nShutting down, killing child processes...');
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(1);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Print initial progress
printProgress();

for (let i = 0; i < MAX_PARALLEL; i++) next(); 