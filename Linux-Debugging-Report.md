# SlackReader Linux Debugging Report

## Issues Found and Fixed

### 1. **Missing Dependencies**
**Issue**: The project was missing required Node.js packages.
**Error**: `Error: Cannot find module 'glob'`
**Fix**: 
- Created `package.json` with `npm init -y`
- Installed dependencies: `npm install glob node-fetch mkdirp`

### 2. **Hardcoded Windows Path**
**Issue**: The main script contained a hardcoded Windows path that would fail on Linux.
**Location**: `process-all-logs.js:81`
**Error**: `console.log(glob.sync('E:/Projects/SlackReader/logs/*.json'));`
**Fix**: Removed the hardcoded debug line

### 3. **Invalid SLACK_TOKEN Configuration**
**Issue**: The SLACK_TOKEN was hardcoded with placeholder 'x' characters.
**Location**: `src/download-media.js:19`
**Error**: `const SLACK_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';`
**Fix**: 
- Updated to use environment variable: `process.env.SLACK_TOKEN`
- Added proper error handling when token is not set
- Added clear user instructions

### 4. **Node.js Fetch Compatibility Issue**
**Issue**: The code was importing `node-fetch` but Node.js v22.16.0 has built-in fetch, causing conflicts.
**Error**: `TypeError: fetch is not a function`
**Fix**: Removed `const fetch = require('node-fetch');` to use native fetch

### 5. **Stream API Compatibility Issue**
**Issue**: Node.js native fetch returns Web Streams API, not Node.js streams that support `.pipe()`.
**Error**: `TypeError: res.body.pipe is not a function`
**Fix**: Updated `downloadFile()` function to use `Readable.fromWeb()` and `pipeline()`:
```javascript
// Use Node.js streams for native fetch compatibility
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const nodeStream = Readable.fromWeb(res.body);
const fileStream = fs.createWriteStream(dest);

await pipeline(nodeStream, fileStream);
```

### 6. **File Path Handling Issue**
**Issue**: Incorrect path resolution causing double-directory paths.
**Error**: `ENOENT: no such file or directory, open '/workspace/logs/logs/michael.json'`
**Fix**: Updated path handling logic to use `path.resolve(PROJECT_ROOT, logArg)` instead of `path.join(LOGS_DIR, logArg)`

## Summary

The main issues were:
1. **Environment Setup**: Missing Node.js dependencies
2. **Cross-Platform Compatibility**: Hardcoded Windows paths
3. **Node.js Version Compatibility**: Using outdated fetch import methods
4. **Stream API Changes**: Node.js v22's native fetch uses Web Streams instead of Node.js streams

## Status: ✅ RESOLVED

All download errors have been fixed. The program now:
- ✅ Successfully detects and processes log files
- ✅ Downloads files without streaming errors  
- ✅ Properly handles both Slack URLs and skips non-Slack URLs
- ✅ Works correctly on Linux with Node.js v22.16.0

## Usage Instructions

1. **Set Environment Variable**:
   ```bash
   export SLACK_TOKEN="your-actual-slack-token-here"
   ```

2. **Run the Process**:
   ```bash
   node process-all-logs.js
   ```

The system will now process all logs in the `logs/` directory and download media files successfully on Linux.