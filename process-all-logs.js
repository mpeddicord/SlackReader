require('dotenv').config();
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

// Create a map to store output for each log file
const logOutputs = new Map();
let activeLogs = new Set();
let running = 0;
let index = 0;
let completed = 0;
let failed = 0;
let lastStatus = new Map(); // Store last status for each file

function printStatus() {
  // Move cursor to top
  process.stdout.write('\x1B[H');
  
  // Print overall progress
  const total = logFiles.length;
  const completed = Array.from(logOutputs.keys()).length;
  const percent = (completed / total * 100).toFixed(1);
  process.stdout.write(`Overall Progress: [${completed}/${total}] (${percent}%)\n`);
  process.stdout.write('----------------------------------------\n');
  
  // Print status of each log file
  for (const logFile of logFiles) {
    const logName = path.basename(logFile);
    const output = logOutputs.get(logFile);
    const isActive = activeLogs.has(logFile);
    
    let status = '';
    if (isActive) {
      // Log is being processed - check for progress bar
      const progressMatch = output?.match(/\[(.*?)\] (\d+\.\d+)% \((\d+)\/(\d+)\)/);
      if (progressMatch) {
        const [_, bar, percent, current, total] = progressMatch;
        status = `⏳ ${logName}: [${bar}] ${percent}% (${current}/${total})`;
      } else {
        status = `⏳ ${logName}: Processing...`;
      }
    } else if (output) {
      // Log is complete - show just the summary line
      const summaryMatch = output.match(/Download Summary:.*/);
      const summary = summaryMatch ? summaryMatch[0] : 'Completed';
      status = `✅ ${logName}: ${summary}`;
    } else {
      // Log is waiting
      status = `⏸️  ${logName}: Waiting...`;
    }
    
    // Only update if status changed
    if (lastStatus.get(logFile) !== status) {
      // Clear the line and write new status
      process.stdout.write('\x1B[K'); // Clear line
      process.stdout.write(status + '\n');
      lastStatus.set(logFile, status);
    } else {
      // Just move to next line
      process.stdout.write('\n');
    }
  }
  
  // Clear any remaining lines
  process.stdout.write('\x1B[J');
}

function next() {
  if (index >= logFiles.length) return;
  if (running >= MAX_PARALLEL) return;
  
  const logFile = logFiles[index++];
  running++;
  activeLogs.add(logFile);
  // Set initial processing state
  logOutputs.set(logFile, 'Processing...');
  printStatus();
  
  const proc = spawn('node', [BATCH_SCRIPT, '--log', logFile], { 
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  
  // Set up polling for output
  const pollInterval = setInterval(() => {
    if (proc.stdout) {
      const output = proc.stdout.read();
      if (output) {
        logOutputs.set(logFile, output.toString());
        printStatus();
      }
    }
  }, 100); // Poll every 100ms
  
  proc.on('exit', code => {
    clearInterval(pollInterval);
    running--;
    activeLogs.delete(logFile);
    
    if (code === 0) {
      // Get the final output and ensure we show the download summary
      const output = logOutputs.get(logFile) || '';
      const summaryMatch = output.match(/Download Summary:.*/);
      if (summaryMatch) {
        logOutputs.set(logFile, summaryMatch[0]);
      } else {
        // If we don't have a summary, try to read one last time
        const finalOutput = proc.stdout.read();
        if (finalOutput) {
          const finalSummary = finalOutput.toString().match(/Download Summary:.*/);
          if (finalSummary) {
            logOutputs.set(logFile, finalSummary[0]);
          }
        }
      }
      completed++;
    } else {
      failed++;
    }
    
    printStatus();
    
    if (completed + failed === logFiles.length) {
      console.log(`\nAll done! ${completed} succeeded, ${failed} failed.`);
      process.exit(failed ? 1 : 0);
    } else {
      next(); // Start next if available
    }
  });
  
  proc.on('error', (err) => {
    clearInterval(pollInterval);
    console.error(`Error processing ${logFile}:`, err);
    running--;
    activeLogs.delete(logFile);
    failed++;
    next();
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
printStatus();

for (let i = 0; i < MAX_PARALLEL; i++) next();

console.log(glob.sync('E:/Projects/SlackReader/logs/*.json')); 