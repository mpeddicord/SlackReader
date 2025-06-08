# SlackReader

A robust, cross-platform tool and web app for archiving and viewing exported Slack logs with local media support, channel switching, and a beautiful interface.

---

## Features

- **Web App**: Pretty, modern UI for browsing Slack logs.
  - Channel sidebar, rich message formatting, emoji, code blocks, clickable links.
  - Local media (images, files) displayed inline, with fullscreen image viewer.
  - Dark theme, responsive layout.
- **Automated Processing**: Scripts to:
  - Download all referenced media from Slack logs.
  - Rewrite logs to point to local media.
  - Batch process all logs with progress and error handling.
- **Robust Workflow**: Drop in new logs, run one command, and view everything locally.

---

## Directory Structure

```
SlackReader/
  logs/                # Original Slack export logs (JSON)
  converted-logs/      # Logs with all media links replaced for local viewing
  src/                 # All processing scripts
  web/                 # Vite + React web app
    public/
      media/           # Served media files
        <logname>/         # Downloaded media for each log, with media-map.json
    src/
      assets/
  process-all-logs.js  # Top-level launcher for batch processing
```

---

## Workflow

1. **Install Fount Studio Export**
   - Install this exporter to your Slack 
      - https://export.fountstudio.com

   - Use /export to create json exports of individual channels, group channels, or DMs

2. **Place Slack Export Logs**
   - Put your exported Slack log folders (JSON files) in the `logs/` directory.

3. **Slack OAuth Token**
    - Place the user oauth token with file:read access in download-media.js

4. **Process Logs and Media**
   - Run:
     ```sh
     node process-all-logs.js
     ```
   - This will:
     - For each log, create a dedicated media subfolder in web/public.
     - Download all referenced media (using your Slack token).
     - Rewrite logs to point to local media.
     - Output processed logs to `converted-logs/`.

5. **View in Web App**
   - Start the web app (from `web/`):
     ```sh
     cd web
     npm install
     npm run dev
     ```
   - Open the app in your browser. Load a processed log to browse channels and messages with all media displayed locally.

---

## Scripts

- **process-all-logs.js**: Main launcher. Finds all logs, processes them in parallel, handles errors and shutdowns gracefully, and prints progress.
- **src/download-media.js**: Downloads all referenced media from a log, saving files with unique names and writing a `media-map.json`.
- **src/replace-media-links.js**: Rewrites log files to replace all Slack media URLs with local paths, using the mapping.
- **src/batch-media-process.js**: Batch processes all logs or a single log, orchestrating the above scripts.

---

## Media Handling

- All media is downloaded to `web/public/media/<logname>/`.
- Each file is saved as `<original_filename>_<slack_file_id>`.
- A `media-map.json` maps Slack file IDs to local filenames.
- All log references (`url_private`, `permalink`, `thumb_*`, etc.) are rewritten to local paths for seamless viewing.

---

## Advanced Usage

- **Custom Output Folders**: Use `--out` or `--media` arguments with scripts to specify custom locations.
- **Parallelism**: The launcher processes up to 4 logs at a time (configurable).
- **Error Handling**: Skips already-downloaded files, handles non-Slack URLs, and provides debug output for troubleshooting.

---

## Requirements

- Node.js (v16+ recommended)
- npm (for the web app)
- A valid Slack token (for downloading private media)

---

## Tips

- For best results, use a Slack token with the files:read permission.
- If you add new logs, just drop them in `logs/` and re-run the launcher.
- The web app serves media from the correct local directory for smooth, offline viewing.

---

## License

MIT

---

**Enjoy your beautiful, automated Slack archive!** 