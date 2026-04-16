'use client';
import { useEffect, useRef, useState } from 'react';

export default function ShareModal({ open, onClose, url, title, chapterLabel }) {
  const [copied, setCopied] = useState(false);
  const [startAt, setStartAt] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const socials = [
    {
      id: 'embed',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      label: 'Embed',
      bg: '#e5e5e5',
      color: '#111',
      href: null,
      action: () => {
        const embed = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0"></iframe>`;
        navigator.clipboard?.writeText(embed).catch(() => {});
        alert('Embed code copied!');
      },
    },
    {
      id: 'whatsapp',
      icon: (
        <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 2C8.3 2 2 8.3 2 16c0 2.5.7 4.9 1.9 7L2 30l7.2-1.9c2 1.1 4.3 1.7 6.8 1.7 7.7 0 14-6.3 14-14S23.7 2 16 2zm7.4 19.6c-.3.9-1.8 1.7-2.5 1.7-.6.1-1.4.1-2.2-.1-.5-.1-1.2-.3-2-.7-3.5-1.5-5.7-5-5.9-5.3-.2-.2-1.4-1.9-1.4-3.6s.9-2.5 1.2-2.9c.3-.4.7-.4.9-.4h.7c.2 0 .5 0 .7.6.3.7 1 2.5 1.1 2.6.1.1.1.3 0 .5-.1.2-.2.3-.3.5-.1.2-.3.4-.4.5-.1.1-.3.3-.1.6.2.3.9 1.4 1.9 2.3 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.6-.1l.8-1c.2-.3.4-.2.7-.1.3.1 1.8.9 2.1 1.1.3.2.5.3.6.4 0 .4-.2 1.5-.5 2.1z"/>
        </svg>
      ),
      label: 'WhatsApp',
      bg: '#25D366',
      color: '#fff',
      href: () => `https://wa.me/?text=${encodeURIComponent((title || 'Check this out') + ' ' + shareUrl)}`,
    },
    {
      id: 'facebook',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
        </svg>
      ),
      label: 'Facebook',
      bg: '#1877F2',
      color: '#fff',
      href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      id: 'x',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      label: 'X',
      bg: '#000',
      color: '#fff',
      href: () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title || '')}`,
    },
    {
      id: 'email',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      ),
      label: 'Email',
      bg: '#888',
      color: '#fff',
      href: () => `mailto:?subject=${encodeURIComponent(title || 'Check this out')}&body=${encodeURIComponent(shareUrl)}`,
    },
    {
      id: 'reddit',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9.67" cy="13" r="1.001"/><circle cx="14.43" cy="13" r="1.001"/>
          <path d="M22 11.816c0-1.256-1.021-2.277-2.277-2.277-.593 0-1.122.24-1.526.613C16.56 9.149 14.84 8.7 12.91 8.631l.983-3.075 2.738.575C16.67 6.88 17.301 7.5 18.08 7.5c.825 0 1.5-.675 1.5-1.5S18.905 4.5 18.08 4.5c-.604 0-1.117.35-1.365.854L13.797 4.7a.277.277 0 00-.327.192l-1.117 3.498c-1.961.047-3.703.497-5.359 1.524a2.26 2.26 0 00-1.519-.597C4.221 9.317 3 10.338 3 11.594c0 .854.471 1.596 1.166 2.013A4.545 4.545 0 004.123 14c0 2.878 3.527 5.229 7.877 5.229 4.351 0 7.877-2.351 7.877-5.229a4.6 4.6 0 00-.047-.393A2.26 2.26 0 0022 11.816zm-9.964 5.787c-1.001.022-2.021-.214-2.869-.72l-.387.644c.984.591 2.141.883 3.256.857 1.122.026 2.279-.266 3.257-.857l-.387-.644c-.854.506-1.875.742-2.87.72zm4.088-3.312c-.576 0-1.041-.465-1.041-1.04 0-.576.465-1.041 1.041-1.041.576 0 1.04.465 1.04 1.041 0 .575-.464 1.04-1.04 1.04zm-8.176 0c-.576 0-1.041-.465-1.041-1.04 0-.576.465-1.041 1.041-1.041.576 0 1.041.465 1.041 1.041 0 .575-.465 1.04-1.041 1.04z"/>
        </svg>
      ),
      label: 'Reddit',
      bg: '#FF4500',
      color: '#fff',
      href: () => `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title || '')}`,
    },
    {
      id: 'telegram',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
      label: 'Telegram',
      bg: '#229ED9',
      color: '#fff',
      href: () => `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title || '')}`,
    },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .sm-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;animation:smFadeIn 0.18s ease}
        @keyframes smFadeIn{from{opacity:0}to{opacity:1}}
        .sm-box{background:var(--surface,#1a1a27);border:1px solid var(--border,rgba(255,255,255,0.09));border-radius:18px;padding:22px 20px 18px;width:100%;max-width:400px;box-shadow:0 24px 60px rgba(0,0,0,0.6);animation:smUp 0.22s ease;position:relative}
        @keyframes smUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .sm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .sm-title{font-size:17px;font-weight:500;color:var(--text,rgba(255,255,255,0.88));font-family:'DM Sans',sans-serif}
        .sm-close{width:30px;height:30px;border-radius:50%;background:var(--surface2,#20202e);border:none;color:var(--muted,rgba(255,255,255,0.38));cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 0.2s;line-height:1}
        .sm-close:hover{color:var(--text,rgba(255,255,255,0.88));background:rgba(128,128,128,0.2)}
        .sm-socials{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;margin:0 -4px;padding-left:4px}
        .sm-socials::-webkit-scrollbar{display:none}
        .sm-soc{display:flex;flex-direction:column;align-items:center;gap:7px;flex-shrink:0;cursor:pointer;text-decoration:none;background:none;border:none;padding:0;font-family:'DM Sans',sans-serif}
        .sm-soc-ico{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:transform 0.18s,opacity 0.18s}
        .sm-soc:hover .sm-soc-ico{transform:translateY(-2px);opacity:0.88}
        .sm-soc-lbl{font-size:11px;color:var(--muted,rgba(255,255,255,0.38));white-space:nowrap}
        .sm-divider{height:1px;background:var(--border,rgba(255,255,255,0.07));margin:18px 0}
        .sm-link-row{display:flex;gap:8px;align-items:center}
        .sm-link-input{flex:1;background:rgba(128,128,128,0.1);border:1px solid var(--border,rgba(255,255,255,0.07));color:var(--text,rgba(255,255,255,0.88));padding:9px 13px;border-radius:9px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;min-width:0}
        .sm-copy-btn{background:#c9a96e;color:#0d0d12;border:none;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0;transition:all 0.2s;white-space:nowrap}
        .sm-copy-btn:hover{background:#dfc082}
        .sm-copy-btn.done{background:#2dd4c0;color:#0d0d12}
        .sm-start{display:flex;align-items:center;gap:9px;margin-top:13px}
        .sm-start input[type=checkbox]{width:16px;height:16px;accent-color:#c9a96e;cursor:pointer}
        .sm-start label{font-size:13px;color:var(--muted,rgba(255,255,255,0.38));cursor:pointer;user-select:none;font-family:'DM Sans',sans-serif}
        .sm-start .sm-chval{color:var(--text,rgba(255,255,255,0.88));font-weight:500}
      ` }} />
      <div className="sm-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
        <div className="sm-box">
          <div className="sm-head">
            <div className="sm-title">Share</div>
            <button className="sm-close" onClick={onClose}>&#x2715;</button>
          </div>

          <div className="sm-socials">
            {socials.map((s) => {
              const href = s.href ? s.href() : null;
              const inner = (
                <>
                  <div className="sm-soc-ico" style={{ background: s.bg, color: s.color }}>
                    {s.icon}
                  </div>
                  <span className="sm-soc-lbl">{s.label}</span>
                </>
              );
              if (s.action) {
                return (
                  <button key={s.id} className="sm-soc" onClick={s.action}>
                    {inner}
                  </button>
                );
              }
              return (
                <a key={s.id} className="sm-soc" href={href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              );
            })}
          </div>

          <div className="sm-divider" />

          <div className="sm-link-row">
            <input className="sm-link-input" readOnly value={shareUrl} onClick={(e) => e.target.select()} />
            <button className={`sm-copy-btn${copied ? ' done' : ''}`} onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {chapterLabel && (
            <div className="sm-start">
              <input
                type="checkbox"
                id="sm-startat"
                checked={startAt}
                onChange={(e) => setStartAt(e.target.checked)}
              />
              <label htmlFor="sm-startat">
                Start at <span className="sm-chval">{chapterLabel}</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
