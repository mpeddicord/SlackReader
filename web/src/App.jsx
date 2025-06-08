import { useState } from 'react'
import './App.css'
import emojiDictionary from 'emoji-dictionary'

function parseChannelName(file) {
  // Use filename minus extension as channel name
  return file.name.replace(/\.[^/.]+$/, '');
}

// Helper to decode HTML entities
function decodeEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

// Helper to auto-link URLs in text
function linkify(text) {
  if (!text) return '';
  text = decodeEntities(text);
  const urlRegex = /(https?:\/\/[^\s<>]+)/g;
  // Remove stray angle brackets around URLs before splitting
  let cleaned = text.replace(/<((https?:\/\/)[^\s<>]+)>/g, '$1');
  return cleaned.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      let cleanUrl = part.replace(/^</, '').replace(/>$/, '');
      return <a key={i} href={cleanUrl} target="_blank" rel="noopener noreferrer" className="msg-link">{cleanUrl}</a>;
    }
    // Remove any stray '<' or '>' left in the text
    return part.replace(/</g, '').replace(/>/g, '');
  });
}

// Helper to render message text with code blocks, bold, italics, strikethrough, emoji, and Slack links
function renderMessageText(text) {
  if (!text) return '';
  // Split on code blocks (```...```), keeping delimiters
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      // Remove the backticks and decode entities
      const code = decodeEntities(part.slice(3, -3).trim());
      return (
        <pre className="msg-code" key={i}>
          <code>{code}</code>
        </pre>
      );
    } else {
      // Normal text: Slack links, emoji, bold, italics, strikethrough, and linkify
      let decoded = decodeEntities(part);
      // Slack <url|text> links
      decoded = decoded.replace(/<([^|>]+)\|([^>]+)>/g, (match, url, label) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link">${label}</a>`;
      });
      // Replace :emoji_name: with emoji
      decoded = decoded.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name) => {
        const emoji = emojiDictionary.getUnicode(name);
        return emoji || match;
      });
      // Bold: *text*
      decoded = decoded.replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, (match, p1, p2) => `${p1}<b>${p2}</b>`);
      // Italics: _text_
      decoded = decoded.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, (match, p1, p2) => `${p1}<i>${p2}</i>`);
      // Strikethrough: ~text~
      decoded = decoded.replace(/(^|\s)~([^~]+)~(?=\s|$)/g, (match, p1, p2) => `${p1}<s>${p2}</s>`);
      // Linkify URLs that are not already inside an <a> tag
      decoded = decoded.replace(/(https?:\/\/[^\s"'<]+)/g, url => {
        // If the URL is already inside an <a> tag, skip
        if (decoded.includes(`href=\"${url}\"`)) return url;
        let cleanUrl = url.replace(/^</, '').replace(/>$/, '');
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="msg-link">${cleanUrl}</a>`;
      });
      // Remove stray < and > not part of tags
      decoded = decoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return <span key={i} dangerouslySetInnerHTML={{ __html: decoded }} />;
    }
  });
}

function isImageFile(file) {
  return (
    file.mimetype && file.mimetype.startsWith('image/') ||
    (file.filetype && ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(file.filetype))
  );
}

function App() {
  const [channels, setChannels] = useState([]); // [{name, messages, file}]
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);

  const handleFiles = async (event) => {
    setError(null);
    const files = Array.from(event.target.files);
    const loadedChannels = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const messages = JSON.parse(text);
        loadedChannels.push({
          name: parseChannelName(file),
          messages,
          file,
        });
      } catch (e) {
        setError(`Failed to parse ${file.name}: ${e.message}`);
      }
    }
    setChannels(loadedChannels);
    setSelected(loadedChannels[0]?.name || null);
  };

  const selectedChannel = channels.find((c) => c.name === selected);

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>Channels</h2>
        <input
          type="file"
          multiple
          accept="application/json"
          onChange={handleFiles}
          style={{ marginBottom: 16 }}
        />
        <ul>
          {channels.map((c) => (
            <li
              key={c.name}
              className={c.name === selected ? 'selected' : ''}
              onClick={() => setSelected(c.name)}
            >
              {c.name}
            </li>
          ))}
        </ul>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="main">
        {selectedChannel ? (
          <div className="messages">
            <h2>{selectedChannel.name}</h2>
            <div className="message-list">
              {selectedChannel.messages.map((msg, i) => (
                <div key={i} className="message">
                  <div className="meta">
                    <span className="user">{msg.real_name || msg.name}</span>
                    <span className="time">{msg.datetime || msg.ts}</span>
                  </div>
                  <div className="text">{renderMessageText(msg.text)}</div>
                  {msg.attachments && msg.attachments.map((att, j) => {
                    const link = att.title_link || att.from_url || att.original_url;
                    const previewContent = (
                      <>
                        {att.image_url && (
                          <img
                            src={att.image_url}
                            alt={att.title || 'attachment'}
                            style={{ maxWidth: 200, cursor: 'pointer' }}
                            onClick={() => setViewerUrl(att.image_url)}
                          />
                        )}
                        {att.title && <div className="att-title">{att.title}</div>}
                        {att.text && <div className="att-text">{att.text}</div>}
                      </>
                    );
                    return link ? (
                      <a
                        key={j}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-link"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div className="attachment">{previewContent}</div>
                      </a>
                    ) : (
                      <div key={j} className="attachment">{previewContent}</div>
                    );
                  })}
                  {msg.files && msg.files.length > 0 && (
                    <div className="file-list">
                      {msg.files.map((file, k) =>
                        isImageFile(file) ? (
                          <a
                            key={k}
                            href={file.local_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="file-image-link"
                            onClick={e => { e.preventDefault(); setViewerUrl(file.local_path); }}
                          >
                            <img
                              src={file.thumb_480 || file.thumb_360 || file.thumb_160 || file.local_path}
                              alt={file.title || file.name}
                              className="file-image"
                              style={{ maxWidth: 320, maxHeight: 240, margin: '8px 0', borderRadius: 8, cursor: 'pointer' }}
                            />
                            {file.title && <div className="att-title">{file.title}</div>}
                          </a>
                        ) : (
                          <a
                            key={k}
                            href={file.url_private || file.permalink_public || file.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="file-link"
                          >
                            📎 {file.title || file.name}
                          </a>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="placeholder">Select or drop Slack log JSON files to begin.</div>
        )}
      </div>
      {viewerUrl && (
        <div className="image-viewer-overlay" onClick={() => setViewerUrl(null)}>
          <span className="image-viewer-close" onClick={e => { e.stopPropagation(); setViewerUrl(null); }}>&times;</span>
          <img src={viewerUrl} alt="Full view" className="image-viewer-img" />
        </div>
      )}
    </div>
  )
}

export default App
