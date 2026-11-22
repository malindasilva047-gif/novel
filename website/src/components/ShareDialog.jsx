import { useEffect, useState } from "react";

export default function ShareDialog({ title, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title || "Wingsaga");

  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ws-share-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ws-share-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-share-title">
        <header><div><span>SHARE WINGSAGA</span><h2 id="ws-share-title">Share {title || "this story"}</h2></div><button type="button" onClick={onClose} aria-label="Close share options">×</button></header>
        <p>Send this link to a friend or share it with your community.</p>
        <div className="ws-share-options">
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer">Facebook</a>
          <a href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} target="_blank" rel="noreferrer">X</a>
          <a href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`} target="_blank" rel="noreferrer">Telegram</a>
          <a href={`https://www.threads.net/intent/post?text=${encodedTitle}%20${encodedUrl}`} target="_blank" rel="noreferrer">Threads</a>
        </div>
        <div className="ws-share-link"><span>{url}</span><button type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button></div>
      </section>
    </div>
  );
}
