'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';

const BADGE_ICONS = {
  early_writer: '✍️', first_story: '📖', five_stories: '📚',
  top_writer: '🏆', verified_writer: '✅', active_reader: '👁️',
};
const LEVEL_META = {
  spark:     { label: '✦ Spark',     color: '#38bdf8', bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.28)' },
  craftsman: { label: '✦ Craftsman', color: '#e8d48a', bg: 'rgba(232,212,138,0.10)', border: 'rgba(192,160,96,0.28)' },
  vanguard:  { label: '✦ Vanguard',  color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.28)' },
  master:    { label: '★ Master',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.40)' },
};

function getBadgeLevel(key) {
  if (['first_story', 'early_writer'].includes(key)) return 'spark';
  if (['five_stories', 'top_writer', 'verified_writer'].includes(key)) return 'craftsman';
  if (['active_reader'].includes(key)) return 'vanguard';
  return 'master';
}

function ProgressRing({ pct }) {
  const r = 28, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg viewBox="0 0 68 68" width="68" height="68" style={{ transform: 'rotate(-90deg)' }}>
      <defs>
        <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#c8522a" />
        </linearGradient>
      </defs>
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="url(#rg)" strokeWidth="5"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }} />
    </svg>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&display=swap');
:root{--brand:#c8522a;--brand-light:#e8714a;--font-d:'Cinzel',serif;--font-b:'Crimson Pro',serif;--font-m:'DM Mono',monospace}
[data-theme="dark"]{--bg:#07060a;--bg2:#0d0b10;--bg3:#131118;--bg4:#1a1720;--text:#eee8f2;--text2:#b8b0c0;--muted:#7a7080;--dim:#3a3342;--card:rgba(18,16,22,0.82);--border:rgba(255,255,255,0.07)}
[data-theme="light"]{--bg:#ffffff;--bg2:#f5f5f5;--bg3:#efefef;--bg4:#e8e8e8;--text:#111111;--text2:#444444;--muted:#666666;--dim:#999999;--card:rgba(245,245,245,0.95);--border:rgba(0,0,0,0.09)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font-b);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}
.page{max-width:1100px;margin:0 auto;padding:clamp(20px,4vw,48px) clamp(16px,3vw,32px) 80px}
.back-btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-m);font-size:.72rem;letter-spacing:.08em;color:var(--muted);background:none;border:1px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer;margin-bottom:24px;transition:all .2s}
.back-btn:hover{color:var(--text);border-color:var(--muted)}
.hero{display:grid;grid-template-columns:auto 1fr auto;gap:clamp(14px,3vw,28px);align-items:center;padding:clamp(18px,3.5vw,36px);background:var(--card);border:1px solid var(--border);border-radius:20px;backdrop-filter:blur(16px);margin-bottom:28px;animation:fadeUp .5s ease both}
@media(max-width:560px){.hero{grid-template-columns:auto 1fr;grid-template-rows:auto auto}.pill{grid-column:1/-1;flex-direction:row!important;justify-content:center;gap:14px}}
.avatar{width:clamp(64px,10vw,84px);height:clamp(64px,10vw,84px);border-radius:50%;background:linear-gradient(135deg,var(--bg3),var(--bg2));display:flex;align-items:center;justify-content:center;font-size:clamp(1.4rem,4vw,2rem);border:2px solid var(--border)}
.pname{font-family:var(--font-d);font-size:clamp(1rem,3vw,1.45rem);font-weight:700;letter-spacing:.06em;margin-bottom:4px}
.phandle{font-family:var(--font-m);font-size:.72rem;color:var(--muted);margin-bottom:12px}
.pstats{display:flex;flex-wrap:wrap;gap:clamp(10px,2.5vw,22px)}
.pstat{display:flex;flex-direction:column;gap:2px}
.pstat-val{font-family:var(--font-d);font-size:clamp(.82rem,2.5vw,1rem);font-weight:600}
.pstat-lbl{font-family:var(--font-m);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.pill{display:flex;flex-direction:column;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(251,191,36,.07),rgba(200,82,42,.07));border:1px solid rgba(251,191,36,.18);border-radius:14px;padding:clamp(10px,2vw,16px) clamp(12px,2.5vw,22px);text-align:center;flex-shrink:0}
.pill-num{font-family:var(--font-d);font-size:clamp(1.4rem,4vw,1.9rem);font-weight:900;background:linear-gradient(135deg,#fbbf24,#c8522a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.pill-lbl{font-family:var(--font-m);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.ring-widget{display:flex;align-items:center;gap:18px;padding:clamp(12px,2.5vw,20px) clamp(14px,3vw,26px);background:var(--card);border:1px solid var(--border);border-radius:14px;margin-bottom:20px;animation:fadeUp .5s ease both .1s}
.ring-wrap{position:relative;width:68px;height:68px;flex-shrink:0}
.ring-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring-pct{font-family:var(--font-d);font-size:.88rem;font-weight:700;color:var(--text);line-height:1}
.ring-sub{font-family:var(--font-m);font-size:.5rem;color:var(--muted)}
.ring-text{min-width:0}
.ring-title{font-family:var(--font-d);font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.ring-desc{font-family:var(--font-b);font-size:.9rem;color:var(--text2);line-height:1.5}
.next-card{display:grid;grid-template-columns:1fr auto;gap:clamp(10px,2.5vw,18px);align-items:center;padding:clamp(16px,3vw,26px);background:var(--card);border:1px solid var(--border);border-radius:14px;margin-bottom:20px;animation:fadeUp .5s ease both .15s;position:relative;overflow:hidden}
.next-card::before{content:'';position:absolute;inset:0;background:linear-gradient(100deg,rgba(167,139,250,.07),transparent 55%);pointer-events:none}
.next-eyebrow{font-family:var(--font-m);font-size:.66rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.next-name{font-family:var(--font-d);font-size:clamp(.95rem,2.5vw,1.15rem);font-weight:700;letter-spacing:.06em;margin-bottom:12px;background:linear-gradient(90deg,#a78bfa,#e879f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.prog-track{height:5px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;margin-bottom:6px}
.prog-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#a78bfa,#e879f9);transition:width 1.4s cubic-bezier(.22,1,.36,1)}
.prog-lbl{font-family:var(--font-m);font-size:.68rem;color:var(--muted)}
.prog-pct{font-family:var(--font-d);font-size:clamp(1.5rem,4.5vw,2rem);font-weight:900;background:linear-gradient(135deg,#a78bfa,#e879f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;white-space:nowrap}
@media(max-width:420px){.next-card{grid-template-columns:1fr}.prog-pct{display:none}}
.filter-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:24px;animation:fadeUp .5s ease both .2s}
.fbtn{font-family:var(--font-m);font-size:.7rem;letter-spacing:.08em;color:var(--muted);padding:6px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg3);cursor:pointer;transition:all .22s}
.fbtn:hover{color:var(--text);border-color:var(--muted)}
.fbtn.active{color:var(--text);background:var(--bg4);border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
.section{margin-bottom:clamp(24px,4vw,44px);animation:fadeUp .5s ease both .25s}
.sec-header{display:flex;align-items:center;gap:12px;margin-bottom:clamp(10px,2vw,18px)}
.sec-title{font-family:var(--font-d);font-size:.74rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;white-space:nowrap}
.sec-line{flex:1;height:1px;background:var(--border)}
.sec-count{font-family:var(--font-m);font-size:.66rem;color:var(--muted);white-space:nowrap}
.badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(128px,20vw,158px),1fr));gap:clamp(8px,1.8vw,13px)}
.bcard{position:relative;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:clamp(14px,2.5vw,20px) clamp(10px,2vw,14px) clamp(12px,2vw,16px);text-align:center;cursor:pointer;transition:transform .25s,box-shadow .25s,border-color .25s,opacity .2s;overflow:hidden;backdrop-filter:blur(8px);animation:cardIn .4s ease both}
.bcard:hover{transform:translateY(-4px) scale(1.02)}
.bcard.locked{opacity:.32;pointer-events:none}
.bcard.unlocked-spark{border-color:rgba(56,189,248,.28);box-shadow:0 0 0 1px rgba(56,189,248,.10),0 8px 22px rgba(0,0,0,.3)}
.bcard.unlocked-craftsman{border-color:rgba(192,160,96,.32);box-shadow:0 0 0 1px rgba(192,160,96,.12),0 8px 22px rgba(0,0,0,.3)}
.bcard.unlocked-vanguard{border-color:rgba(167,139,250,.32);box-shadow:0 0 0 1px rgba(167,139,250,.12),0 10px 26px rgba(0,0,0,.35)}
.bcard.unlocked-master{border-color:rgba(251,191,36,.42);box-shadow:0 0 0 2px rgba(251,191,36,.15),0 12px 36px rgba(251,191,36,.14)}
.bcard-rarity{position:absolute;top:8px;right:9px;width:6px;height:6px;border-radius:50%;opacity:0;transition:opacity .3s}
.bcard.unlocked-spark .bcard-rarity{opacity:1;background:#38bdf8;box-shadow:0 0 5px #38bdf8}
.bcard.unlocked-craftsman .bcard-rarity{opacity:1;background:#e8d48a;box-shadow:0 0 5px #e8d48a}
.bcard.unlocked-vanguard .bcard-rarity{opacity:1;background:#a78bfa;box-shadow:0 0 5px #a78bfa}
.bcard.unlocked-master .bcard-rarity{opacity:1;background:#fbbf24;box-shadow:0 0 6px #fbbf24}
.bico{font-size:clamp(1.4rem,3.5vw,1.9rem);display:block;margin-bottom:8px;filter:grayscale(1) opacity(.28);transition:filter .3s}
.bcard:not(.locked) .bico{filter:none}
.bname{font-family:var(--font-d);font-size:.67rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);transition:color .3s;margin-bottom:3px;line-height:1.3}
.bcard:not(.locked) .bname{color:var(--text)}
.bdesc{font-family:var(--font-b);font-size:.75rem;font-style:italic;color:rgba(255,255,255,.15);line-height:1.4;transition:color .3s}
.bcard:not(.locked) .bdesc{color:var(--muted)}
.bdate{font-family:var(--font-m);font-size:.58rem;color:var(--dim);margin-top:6px;display:none}
.bcard:not(.locked) .bdate{display:block}
.btier{display:inline-block;font-family:var(--font-m);font-size:.58rem;letter-spacing:.08em;padding:2px 7px;border-radius:999px;margin-top:5px;border:1px solid currentColor;opacity:.8}
.btier.bronze{color:#cd7f32}.btier.silver{color:#a8a8a8}.btier.gold{color:#ffd700}.btier.platinum{color:#2dd4c0}
.bprog{margin-top:7px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.bpfill{height:100%;border-radius:2px;background:var(--brand);transition:width 1.2s ease}
.empty{grid-column:1/-1;text-align:center;padding:28px;color:var(--muted);font-style:italic;font-size:.95rem}
.loader{min-height:40vh;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;gap:10px}
.sign-in{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.sign-in p{color:var(--muted);font-size:16px}
.btn-primary{background:var(--brand);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-family:var(--font-m);transition:opacity .2s}
.btn-primary:hover{opacity:.85}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--dim);border-radius:4px}
`;

const LEVEL_ORDER = ['spark', 'craftsman', 'vanguard', 'master'];

export default function BadgesPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('dark');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const t = typeof window !== 'undefined' ? (localStorage.getItem('theme') || localStorage.getItem('bixbi-theme') || 'dark') : 'dark';
    setTheme(t);
    const token = readToken();
    if (!token) { setLoading(false); return; }
    apiRequest('/users/me/badges', { token })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div data-theme={theme}><style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="loader">Loading badges…</div>
    </div>
  );

  if (!data) return (
    <div data-theme={theme}><style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sign-in">
        <p>Sign in to view your badges</p>
        <button className="btn-primary" onClick={() => router.push('/auth/signin')}>Sign In</button>
      </div>
    </div>
  );

  const { badges = [], earned_count = 0, total_count = 0, stats = {}, next_badge } = data;
  const pct = total_count > 0 ? Math.round((earned_count / total_count) * 100) : 0;

  // Group badges by level
  const grouped = {};
  LEVEL_ORDER.forEach(lv => { grouped[lv] = []; });
  badges.forEach(b => {
    const lv = getBadgeLevel(b.badge_key);
    if (!grouped[lv]) grouped[lv] = [];
    grouped[lv].push(b);
  });

  // Filter
  const filtered = {};
  LEVEL_ORDER.forEach(lv => {
    filtered[lv] = grouped[lv].filter(b => {
      if (filter === 'unlocked') return b.unlocked;
      if (filter === 'locked') return !b.unlocked;
      return true;
    });
  });

  // Next badge progress
  const nextPct = next_badge && next_badge.next_target
    ? Math.min(100, Math.round((next_badge.progress_value / next_badge.next_target) * 100))
    : 0;

  return (
    <div data-theme={theme} style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page">
        <button className="back-btn" onClick={() => router.push('/profile')}>← Back to Profile</button>

        {/* HERO */}
        <div className="hero">
          <div className="avatar">🦁</div>
          <div>
            <div className="pname">{stats.username || 'Your Badges'}</div>
            <div className="phandle">Badge Showcase</div>
            <div className="pstats">
              {[
                [stats.total_words?.toLocaleString() || '0', 'Words'],
                [stats.total_reads?.toLocaleString() || '0', 'Reads'],
                [stats.followers?.toLocaleString() || '0', 'Followers'],
                [stats.daily_streak ? `${stats.daily_streak}d` : '0d', 'Streak'],
              ].map(([v, l]) => (
                <div className="pstat" key={l}>
                  <span className="pstat-val">{v}</span>
                  <span className="pstat-lbl">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pill">
            <span className="pill-num">{earned_count}</span>
            <span className="pill-lbl">Badges<br />Earned</span>
          </div>
        </div>

        {/* PROGRESS RING */}
        <div className="ring-widget">
          <div className="ring-wrap">
            <ProgressRing pct={pct} />
            <div className="ring-label">
              <span className="ring-pct">{pct}%</span>
              <span className="ring-sub">TOTAL</span>
            </div>
          </div>
          <div className="ring-text">
            <div className="ring-title">✦ Overall Progress</div>
            <div className="ring-desc">{earned_count} of {total_count} badges earned. Keep writing to unlock them all!</div>
          </div>
        </div>

        {/* NEXT BADGE */}
        {next_badge && !next_badge.unlocked && (
          <div className="next-card">
            <div>
              <div className="next-eyebrow">▸ Next Badge to Unlock</div>
              <div className="next-name">{BADGE_ICONS[next_badge.badge_key] || '🏅'} {next_badge.title}</div>
              <div className="prog-track">
                <div className="prog-fill" style={{ width: `${nextPct}%` }} />
              </div>
              <div className="prog-lbl">{next_badge.progress_value} / {next_badge.next_target} — {next_badge.description}</div>
            </div>
            <div className="prog-pct">{nextPct}%</div>
          </div>
        )}

        {/* FILTER */}
        <div className="filter-bar">
          {[['all','All'],['unlocked','Unlocked'],['locked','Locked']].map(([k, l]) => (
            <button key={k} className={`fbtn${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>

        {/* BADGE SECTIONS */}
        {LEVEL_ORDER.map(lv => {
          const lm = LEVEL_META[lv];
          const lvBadges = filtered[lv];
          if (!lvBadges || lvBadges.length === 0) return null;
          const earnedInLevel = lvBadges.filter(b => b.unlocked).length;
          return (
            <div className="section" key={lv}>
              <div className="sec-header">
                <div className="sec-title" style={{ color: lm.color }}>{lm.label}</div>
                <div className="sec-line" />
                <div className="sec-count">{earnedInLevel}/{lvBadges.length}</div>
              </div>
              <div className="badge-grid">
                {lvBadges.map((b, i) => {
                  const icon = BADGE_ICONS[b.badge_key] || '🏅';
                  const tierCls = (b.tier || '').toLowerCase();
                  const unlockedCls = b.unlocked ? `unlocked-${lv}` : 'locked';
                  const dateStr = b.earned_at
                    ? new Date(b.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';
                  const progPct = b.next_target
                    ? Math.min(100, Math.round((b.progress_value / b.next_target) * 100))
                    : b.unlocked ? 100 : 0;
                  return (
                    <div key={b.badge_key || i} className={`bcard ${unlockedCls}`}
                      style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className="bcard-rarity" />
                      <span className="bico">{icon}</span>
                      <div className="bname">{b.title}</div>
                      <div className="bdesc">{b.description}</div>
                      {b.tier && <span className={`btier ${tierCls}`}>{b.tier}</span>}
                      {dateStr && <div className="bdate">Earned {dateStr}</div>}
                      <div className="bprog"><div className="bpfill" style={{ width: `${progPct}%` }} /></div>
                    </div>
                  );
                })}
                {lvBadges.length === 0 && <div className="empty">No badges match your filter.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
