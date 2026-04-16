'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';
import ShareModal from '@/components/ShareModal';

const COVER_GRADIENTS = [
  'linear-gradient(135deg,#0a1628 0%,#1a0a2e 40%,#0d1f2a 70%,#1a1a0a 100%)',
  'linear-gradient(135deg,#0a0a1a 0%,#1a0510 40%,#0d1a2a 70%,#1a0a0a 100%)',
  'linear-gradient(135deg,#0f1a0f 0%,#1a2e1a 40%,#0d2a1a 70%,#1a1a0a 100%)',
  'linear-gradient(135deg,#1a0a0a 0%,#2e1010 40%,#1a0d14 70%,#0a0a1a 100%)',
];
const STORY_GRADS = [
  'linear-gradient(160deg,#1a1a0a,#2e2a08)',
  'linear-gradient(160deg,#0a1a2a,#163050)',
  'linear-gradient(160deg,#1a0a0a,#3d1515)',
  'linear-gradient(160deg,#0a1a0a,#1a3a1a)',
  'linear-gradient(160deg,#1a0a1a,#2e1030)',
  'linear-gradient(160deg,#0d0a1a,#1f0f3a)',
];

function formatCount(n) {
  if (!n && n !== 0) return '0';
  n = Number(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const PROFILE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
:root{--gold:#c9a96e;--gold-soft:rgba(201,169,110,0.15);--teal:#2dd4c0;--teal-soft:rgba(45,212,192,0.12);--rose:#e8748a;--tr:0.22s ease}
[data-theme="light"]{--ink:#f4f4ef;--deep:#eaeae4;--surface:#ffffff;--surface2:#f0f0ea;--border:rgba(0,0,0,0.09);--muted:rgba(0,0,0,0.42);--text:rgba(0,0,0,0.86);--hbg:rgba(244,244,239,0.95);--shadow:rgba(0,0,0,0.12)}
[data-theme="dark"]{--ink:#0d0d12;--deep:#13131c;--surface:#1a1a27;--surface2:#20202e;--border:rgba(255,255,255,0.07);--muted:rgba(255,255,255,0.38);--text:rgba(255,255,255,0.88);--hbg:rgba(13,13,18,0.92);--shadow:rgba(0,0,0,0.5)}
*{box-sizing:border-box}
.bp-body{background:var(--ink);min-height:100vh;color:var(--text);font-family:'DM Sans',sans-serif;font-size:15px;overflow-x:hidden;transition:background var(--tr),color var(--tr)}
.cover-banner{width:100%;height:140px;position:relative;overflow:hidden;transition:background var(--tr)}
@media(min-width:480px){.cover-banner{height:180px}}
@media(min-width:768px){.cover-banner{height:240px}}
.cover-banner::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(201,169,110,0.12),transparent 60%),radial-gradient(ellipse at 80% 30%,rgba(45,212,192,0.08),transparent 50%)}
.cover-pattern{position:absolute;inset:0;opacity:0.04;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.5) 0px,rgba(255,255,255,0.5) 1px,transparent 1px,transparent 40px)}
.cover-edit{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:5px;transition:all 0.2s}
.cover-edit:hover{background:rgba(0,0,0,0.65)}.cover-edit svg{width:12px;height:12px}
.psec{padding:0 14px}
@media(min-width:480px){.psec{padding:0 20px}}
@media(min-width:768px){.psec{padding:0 32px}}
@media(min-width:1024px){.psec{padding:0 48px;max-width:1100px;margin:0 auto}}
.ptop{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:14px;margin-top:-34px;position:relative}
@media(min-width:480px){.ptop{margin-top:-40px}}
@media(min-width:768px){.ptop{margin-top:-55px}}
.pav-wrap{position:relative;flex-shrink:0}
.pav{width:76px;height:76px;border-radius:50%;border:3px solid var(--ink);background:linear-gradient(135deg,#1a1a0a,#2e2a08);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;color:#fff;box-shadow:0 4px 20px var(--shadow);transition:border-color var(--tr)}
@media(min-width:480px){.pav{width:88px;height:88px;font-size:32px}}
@media(min-width:768px){.pav{width:110px;height:110px;font-size:40px}}
.vbadge{position:absolute;bottom:3px;right:3px;width:20px;height:20px;background:var(--teal);border:2px solid var(--ink);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px}
@media(min-width:480px){.vbadge{width:22px;height:22px;font-size:11px}}
.pcta{display:flex;gap:6px;padding-top:36px;flex-wrap:wrap}
@media(min-width:480px){.pcta{padding-top:44px;gap:8px}}
.btn-geek{background:var(--gold);color:#0d0d12;border:none;padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;white-space:nowrap}
@media(min-width:480px){.btn-geek{padding:9px 22px;font-size:13.5px}}
.btn-geek:hover{background:#dfc082;transform:translateY(-1px)}
.btn-geek.geeking{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-geek.geeking:hover{border-color:var(--rose);color:var(--rose)}
.btn-ia{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
.btn-ia:hover{border-color:rgba(128,128,128,0.3)}.btn-ia svg{width:15px;height:15px}
.pinfo{margin-bottom:14px}
.pname{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--text);margin-bottom:2px;line-height:1.2}
@media(min-width:480px){.pname{font-size:28px}}
@media(min-width:768px){.pname{font-size:34px}}
.pusername{font-size:13px;color:var(--muted);margin-bottom:10px}
.pbio{font-size:13.5px;color:var(--text);line-height:1.65;max-width:580px;margin-bottom:12px}
.pmeta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:12px}
.pmi{display:flex;align-items:center;gap:4px}.pmi svg{width:13px;height:13px;opacity:0.6}
.soc-icons{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.soc-btn{width:28px;height:28px;border-radius:8px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted);text-decoration:none;transition:all 0.2s;cursor:pointer;font-size:13px}
.soc-btn:hover{border-color:rgba(128,128,128,0.25);color:var(--text)}
.pgenres{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.gtag{background:var(--gold-soft);border:1px solid rgba(201,169,110,0.2);color:var(--gold);font-size:10.5px;font-weight:500;padding:3px 10px;border-radius:20px;letter-spacing:0.3px}
.pbadges{display:flex;gap:7px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--border)}
.b-chip{display:flex;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border);padding:4px 9px;border-radius:20px;font-size:11.5px;color:var(--text);cursor:pointer;transition:all 0.2s}
.b-chip:hover{border-color:var(--gold)}.b-chip .bico{font-size:14px}.b-chip .blvl{font-size:10px;color:var(--muted)}
.b-see-all{background:none;border:1px dashed var(--border);color:var(--muted);padding:4px 10px;border-radius:20px;font-size:11.5px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s}
.b-see-all:hover{border-color:var(--gold);color:var(--gold)}
.stats-row{display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:0 -14px;overflow-x:auto;scrollbar-width:none}
.stats-row::-webkit-scrollbar{display:none}
@media(min-width:480px){.stats-row{margin:0 -20px}}
@media(min-width:768px){.stats-row{margin:0 -32px}}
@media(min-width:1024px){.stats-row{margin:0 -48px}}
.sti{flex:1;min-width:70px;text-align:center;padding:14px 8px;border-right:1px solid var(--border);cursor:default;transition:background 0.2s}
@media(min-width:480px){.sti{min-width:80px;padding:16px 10px}}
.sti:last-child{border-right:none}.sti:hover{background:rgba(128,128,128,0.04)}
.stn{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:var(--text);display:block;line-height:1;margin-bottom:4px}
@media(min-width:480px){.stn{font-size:24px}}
.stl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px}
@media(min-width:480px){.stl{font-size:10px}}
.chnav{position:sticky;top:0;z-index:200;background:var(--hbg);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:0 14px;transition:background var(--tr)}
@media(min-width:480px){.chnav{padding:0 20px}}
@media(min-width:768px){.chnav{padding:0 32px}}
@media(min-width:1024px){.chnav{padding:0 48px}}
.chtabs{display:flex;overflow-x:auto;scrollbar-width:none}.chtabs::-webkit-scrollbar{display:none}
.chtab{background:none;border:none;color:var(--muted);font-size:13px;font-family:'DM Sans',sans-serif;padding:13px 14px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 0.2s}
@media(min-width:480px){.chtab{font-size:13.5px;padding:14px 18px}}
.chtab:hover{color:var(--text)}.chtab.active{color:var(--gold);border-bottom-color:var(--gold)}
.tc{padding:22px 14px;max-width:1100px;margin:0 auto}
@media(min-width:480px){.tc{padding:28px 20px}}
@media(min-width:768px){.tc{padding:32px 32px}}
@media(min-width:1024px){.tc{padding:36px 48px}}
.stoolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.scnt{font-size:13px;color:var(--muted)}
.sortbtns{display:flex;gap:5px;flex-wrap:wrap}
.sbtn{background:none;border:1px solid var(--border);color:var(--muted);font-size:11.5px;padding:5px 11px;border-radius:20px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;white-space:nowrap}
.sbtn:hover{color:var(--text)}.sbtn.active{background:var(--gold-soft);border-color:rgba(201,169,110,0.3);color:var(--gold)}
.slist{display:flex;flex-direction:column;gap:12px}
@media(min-width:480px){.slist{gap:14px}}
.scard{display:flex;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;transition:border-color 0.2s,transform 0.2s,background var(--tr)}
@media(min-width:480px){.scard{gap:16px;border-radius:14px;padding:16px}}
.scard:hover{border-color:rgba(128,128,128,0.2);transform:translateY(-1px)}
.scov{width:60px;min-width:60px;aspect-ratio:2/3;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:9px;font-weight:600;color:#fff;text-align:center;padding:5px;line-height:1.3;box-shadow:0 4px 14px var(--shadow);flex-shrink:0;overflow:hidden}
@media(min-width:480px){.scov{width:72px;min-width:72px;border-radius:8px}}
.scov img{width:100%;height:100%;object-fit:cover}
.sinf{flex:1;min-width:0}
.stitle{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:400;color:var(--text);margin-bottom:4px;line-height:1.2}
@media(min-width:480px){.stitle{font-size:18px}}
.sdesc{font-size:12.5px;color:var(--muted);line-height:1.55;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.stags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.stag{font-size:10.5px;color:var(--muted);background:rgba(128,128,128,0.08);border:1px solid var(--border);padding:2px 8px;border-radius:4px}
.sfooter{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sstat{font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:3px}
.sstat svg{width:12px;height:12px}
.sstatus{font-size:10px;font-weight:500;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.4px;margin-left:auto}
.sstatus.complete{background:var(--gold-soft);color:var(--gold)}.sstatus.ongoing{background:var(--teal-soft);color:var(--teal)}
.lgrid{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:500px){.lgrid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:900px){.lgrid{grid-template-columns:repeat(3,1fr);gap:14px}}
.lcard{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color 0.2s,transform 0.2s,background var(--tr)}
.lcard:hover{border-color:rgba(128,128,128,0.2);transform:translateY(-2px)}
.lcovers{display:grid;grid-template-columns:repeat(3,1fr);height:80px;gap:2px}
.lbody{padding:12px 14px}
.ltitle{font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px}
.lmeta{font-size:11.5px;color:var(--muted);display:flex;gap:12px}
.agrid{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:768px){.agrid{grid-template-columns:2fr 1fr;gap:20px}}
.acard{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;transition:background var(--tr);margin-bottom:14px}
@media(min-width:480px){.acard{border-radius:14px;padding:20px 22px}}
.acard:last-child{margin-bottom:0}
.acard h3{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:400;color:var(--text);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.abio{font-size:13.5px;color:var(--muted);line-height:1.7}
.bfgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(min-width:400px){.bfgrid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:640px){.bfgrid{grid-template-columns:repeat(4,1fr)}}
.bcard{background:rgba(128,128,128,0.05);border:1px solid var(--border);border-radius:10px;padding:12px 8px;text-align:center;cursor:pointer;transition:all 0.2s}
.bcard:hover{border-color:var(--gold);transform:translateY(-2px)}.bcard.locked{opacity:0.3;filter:grayscale(1)}
.bico{font-size:24px;margin-bottom:5px}.bname{font-size:10.5px;font-weight:500;color:var(--text);margin-bottom:3px}
.blvl{font-size:10px;color:var(--muted)}.blvl.bronze{color:#cd7f32}.blvl.silver{color:#a8a8a8}.blvl.gold{color:#ffd700}.blvl.platinum{color:#2dd4c0}
.bprog{margin-top:7px;height:3px;background:rgba(128,128,128,0.15);border-radius:2px;overflow:hidden}
.bpfill{height:100%;border-radius:2px;background:var(--gold)}
.rtgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px}
.rti{text-align:center}.rtn{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--text);line-height:1;margin-bottom:4px}
.rtn em{color:var(--gold);font-style:normal;font-size:15px}
.rtl{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px}
.rtnote{font-size:11.5px;color:var(--muted);line-height:1.6;padding-top:11px;border-top:1px solid var(--border)}.rtnote strong{color:var(--text)}
.alist{display:flex;flex-direction:column;gap:3px}
.aitem{display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:9px;transition:background 0.15s}
@media(min-width:480px){.aitem{gap:14px;padding:14px}}
.aitem:hover{background:rgba(128,128,128,0.04)}
.aico{width:34px;height:34px;min-width:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ap{background:var(--gold-soft)}.ac{background:var(--teal-soft)}.al{background:rgba(232,116,138,0.12)}.am{background:rgba(255,215,0,0.1)}
.abod{flex:1}.atxt{font-size:13px;color:var(--text);line-height:1.5;margin-bottom:3px}
.atxt strong{color:var(--gold)}.atm{font-size:11px;color:var(--muted)}
.adiv{height:1px;background:var(--border);margin:2px 0}
.iwrap{display:flex;flex-wrap:wrap;gap:6px}
.moverlay{display:none;position:fixed;inset:0;z-index:600;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:16px}
.moverlay.open{display:flex;animation:mfIn 0.2s ease}@keyframes mfIn{from{opacity:0}to{opacity:1}}
.mbox{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px 18px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:mUp 0.25s ease;transition:background var(--tr)}
@keyframes mUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.mhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.mtitle{font-family:'Cormorant Garamond',serif;font-size:19px;color:var(--text)}
.mclose{background:var(--surface2);border:none;color:var(--muted);width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;transition:all 0.2s}
.mclose:hover{color:var(--text)}
.minp-wrap{margin-bottom:12px}.minp-lbl{font-size:12px;color:var(--muted);margin-bottom:6px;display:block}
.minp{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:9px 13px;border-radius:9px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color 0.2s,background var(--tr)}
.minp:focus{border-color:rgba(201,169,110,0.4)}.minp::placeholder{color:var(--muted)}textarea.minp{resize:vertical;min-height:80px}
.macts{display:flex;gap:10px;margin-top:16px}
.mbp{flex:1;background:var(--gold);color:#0d0d12;border:none;padding:11px;border-radius:9px;font-size:13.5px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s}
.mbp:hover{background:#dfc082}.mbp:disabled{opacity:0.6;cursor:default}
.mbs{background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:11px 16px;border-radius:9px;font-size:13.5px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s}
.mbs:hover{border-color:rgba(128,128,128,0.3)}
.bp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(70px);background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 20px;border-radius:10px;box-shadow:0 8px 24px var(--shadow);z-index:999;transition:transform 0.3s ease;white-space:nowrap;pointer-events:none}
.bp-toast.show{transform:translateX(-50%) translateY(0)}
.bp-sign-in{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.bp-sign-in p{color:var(--muted);font-size:16px}
.bp-btn-primary{background:var(--gold);color:#0d0d12;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s}
.bp-btn-primary:hover{background:#dfc082}
.bp-loader{min-height:40vh;display:flex;align-items:center;justify-content:center;gap:12px;color:var(--muted);font-size:14px}
`;

export default function ProfilePage() {
  const router = useRouter();
  const [theme, setTheme] = useState('dark');
  const [tab, setTab] = useState('stories');
  const [sortBy, setSortBy] = useState('latest');
  const [user, setUser] = useState(null);
  const [stories, setStories] = useState([]);
  const [badges, setBadges] = useState([]);
  const [history, setHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [stats, setStats] = useState({ reads: 0, stories: 0, geeks: 0, geeking: 0, likes: 0 });
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const [editForm, setEditForm] = useState({
    full_name: '', bio: '', location: '', country: '',
    phone: '', date_of_birth: '', gender: '', website: '',
    preferred_language: '', reading_goal: '',
  });

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('bixbi-theme') || 'dark' : 'dark';
    setTheme(savedTheme);

    const token = readToken();
    if (!token) { setLoading(false); return; }

    Promise.all([
      apiRequest('/users/me', { token }).catch(() => null),
      apiRequest('/stories/mine', { token }).catch(() => []),
      apiRequest('/reader/badges', { token }).catch(() => []),
      apiRequest('/reader/history', { token }).catch(() => []),
      apiRequest('/reader/bookmarks', { token }).catch(() => []),
      apiRequest('/users/me/stats', { token }).catch(() => null),
    ]).then(([me, mine, badgeData, historyData, bookmarkData, statsData]) => {
      if (me) { setUser(me); localStorage.setItem('user', JSON.stringify(me)); }
      setStories(Array.isArray(mine) ? mine : []);
      setBadges(Array.isArray(badgeData) ? badgeData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setBookmarks(Array.isArray(bookmarkData) ? bookmarkData : []);
      if (statsData) {
        setStats({
          reads: Number(statsData.reads || 0),
          stories: Number(statsData.stories || 0),
          geeks: Number(statsData.geeks ?? statsData.followers ?? 0),
          geeking: Number(statsData.geeking ?? statsData.following ?? 0),
          likes: Number(statsData.likes || 0),
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    setEditForm({
      full_name: user.full_name || '',
      bio: user.bio || '',
      location: user.location || '',
      country: user.country || '',
      phone: user.phone || '',
      date_of_birth: user.date_of_birth || '',
      gender: user.gender || '',
      website: user.website || '',
      preferred_language: user.preferred_language || '',
      reading_goal: user.reading_goal || '',
    });
  }, [user]);

  async function saveProfile() {
    const token = readToken();
    if (!token) { setProfileMsg('Please sign in again.'); return; }
    try {
      setSavingProfile(true);
      setProfileMsg('');
      await apiRequest('/users/me', {
        method: 'PATCH', token,
        body: {
          bio: editForm.bio,
          location: editForm.location,
          country: editForm.country,
          phone: editForm.phone,
          website: editForm.website,
          preferred_language: editForm.preferred_language,
          reading_goal: editForm.reading_goal,
        },
      });
      const refreshed = await apiRequest('/users/me', { token });
      setUser(refreshed);
      localStorage.setItem('user', JSON.stringify(refreshed));
      setProfileMsg('Profile updated successfully.');
      showToast('Profile saved!');
    } catch (err) {
      setProfileMsg(err.message || 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof window !== 'undefined') localStorage.setItem('bixbi-theme', next);
  }

  const username = user?.full_name || user?.username || 'Reader';
  const handle = user?.username || user?.email?.split('@')[0] || username.toLowerCase().replace(/\s/g, '_');
  const initials = getInitials(username);
  const joinDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  const genres = user?.favorite_genres || [];
  const coverGrad = COVER_GRADIENTS[handle.charCodeAt(0) % COVER_GRADIENTS.length] || COVER_GRADIENTS[0];

  const sortedStories = [...stories].sort((a, b) => {
    if (sortBy === 'popular') return (b.views || 0) - (a.views || 0);
    if (sortBy === 'completed') return (a.status === 'complete' ? -1 : 1);
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  if (!user && !loading) {
    return (
      <div data-theme={theme}>
        <style dangerouslySetInnerHTML={{ __html: PROFILE_CSS }} />
        <div className="bp-sign-in">
          <p>Sign in to view your profile</p>
          <button className="bp-btn-primary" onClick={() => router.push('/auth/signin')}>Sign In</button>
        </div>
      </div>
    );
  }

  if (loading && !user) {
    return (
      <div data-theme={theme}>
        <style dangerouslySetInnerHTML={{ __html: PROFILE_CSS }} />
        <div className="bp-loader">Loading profile…</div>
      </div>
    );
  }

  return (
    <div data-theme={theme} className="bp-body">
      <style dangerouslySetInnerHTML={{ __html: PROFILE_CSS }} />

      {/* COVER BANNER */}
      <div className="cover-banner" style={{ background: coverGrad }}>
        <div className="cover-pattern" />
        <button className="cover-edit" onClick={() => showToast('Cover editing coming soon!')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit Cover
        </button>
      </div>

      {/* PROFILE SECTION */}
      <div className="psec">
        <div className="ptop">
          <div className="pav-wrap">
            <div className="pav">{initials}</div>
            <div className="vbadge">✓</div>
          </div>
          <div className="pcta">
            <button className="bp-btn-primary" onClick={() => router.push('/write')}>+ New Story</button>
            <button className="btn-ia" title="Edit Profile" onClick={() => setEditModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className="btn-ia" title="Share Profile" onClick={() => setShareModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button className="btn-ia" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme} style={{ fontSize: '16px' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className="pinfo">
          <div className="pname">{username}</div>
          <div className="pusername">@{handle}{joinDate ? ` · Joined ${joinDate}` : ''}</div>
          <div className="pbio">{user?.bio || 'Welcome to my Bixbi profile. I love great stories.'}</div>
          <div className="pmeta">
            {user?.location && (
              <div className="pmi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {user.location}
              </div>
            )}
            {user?.website && (
              <a className="pmi" href={user.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                </svg>
                {user.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <div className="soc-icons">
              {user?.instagram && <a className="soc-btn" href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" title="Instagram">📸</a>}
              {user?.twitter && <a className="soc-btn" href={`https://x.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" title="X">𝕏</a>}
            </div>
          </div>
        </div>

        {genres.length > 0 && (
          <div className="pgenres">
            {genres.map((g) => <span key={g} className="gtag">{g}</span>)}
          </div>
        )}

        {badges.length > 0 && (
          <div className="pbadges">
            {badges.slice(0, 4).filter(b => b.unlocked !== false).map((b, i) => (
              <div key={b.badge_key || b.title || i} className="b-chip">
                <span className="bico">{b.icon || '🏅'}</span>
                <span>{b.title}</span>
                {b.tier && <span className="blvl">{b.tier}</span>}
              </div>
            ))}
            {badges.length > 4 && (
              <button className="b-see-all" onClick={() => setTab('badges')}>View all {badges.length} →</button>
            )}
          </div>
        )}

        <div className="stats-row">
          {[
            [formatCount(stats.reads), 'Reads'],
            [formatCount(stats.geeks), 'Geeks'],
            [formatCount(stats.geeking), 'Geeking'],
            [formatCount(stories.length || stats.stories), 'Stories'],
            [formatCount(stats.likes), 'Likes'],
          ].map(([n, l]) => (
            <div className="sti" key={l}>
              <span className="stn">{n}</span>
              <div className="stl">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CHANNEL NAV */}
      <nav className="chnav">
        <div className="chtabs">
          {[['stories','Stories'],['lists','Reading Lists'],['about','About'],['activity','Activity'],['badges','Badges']].map(([id, label]) => (
            <button key={id} className={`chtab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </nav>

      {/* TAB: STORIES */}
      {tab === 'stories' && (
        <div className="tc">
          <div className="stoolbar">
            <div className="scnt">{stories.length} {stories.length === 1 ? 'story' : 'stories'}</div>
            <div className="sortbtns">
              {[['latest','Latest'],['popular','Popular'],['completed','Completed']].map(([k, l]) => (
                <button key={k} className={`sbtn${sortBy === k ? ' active' : ''}`} onClick={() => setSortBy(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="slist">
            {sortedStories.map((s, i) => (
              <div key={s._id || s.id || i} className="scard" onClick={() => router.push(`/story/${s._id || s.id}`)}>
                <div className="scov" style={{ background: STORY_GRADS[i % STORY_GRADS.length] }}>
                  {s.cover_image ? <img src={s.cover_image} alt={s.title} /> : s.title?.slice(0, 24)}
                </div>
                <div className="sinf">
                  <div className="stitle">{s.title}</div>
                  <div className="sdesc">{s.description || s.summary || ''}</div>
                  <div className="stags">
                    {(s.categories || s.tags || []).slice(0, 3).map((t) => <span key={t} className="stag">{t}</span>)}
                  </div>
                  <div className="sfooter">
                    <div className="sstat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      {formatCount(s.views)}
                    </div>
                    <div className="sstat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                      {formatCount(s.likes)}
                    </div>
                    {s.chapter_count && <div className="sstat">{s.chapter_count} ch</div>}
                    {s.updated_at && <div className="sstat">{timeAgo(s.updated_at)}</div>}
                    <span className={`sstatus ${s.status === 'complete' ? 'complete' : 'ongoing'}`}>
                      {s.status === 'complete' ? 'Complete' : 'Ongoing'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {stories.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: '14px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>✍️</div>
                No stories yet.
                <button className="bp-btn-primary" style={{ display: 'block', margin: '16px auto 0' }} onClick={() => router.push('/write')}>Start Writing</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: READING LISTS */}
      {tab === 'lists' && (
        <div className="tc">
          {bookmarks.length > 0 ? (
            <div className="lgrid">
              <div className="lcard" onClick={() => router.push('/library')}>
                <div className="lcovers">
                  {[0,1,2].map((i) => (
                    <div key={i} style={{ background: bookmarks[i] ? STORY_GRADS[i] : 'var(--surface2)', height: '100%' }} />
                  ))}
                </div>
                <div className="lbody">
                  <div className="ltitle">My Library</div>
                  <div className="lmeta"><span>{bookmarks.length} stories saved</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: '14px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📚</div>
              No reading lists yet. Save stories to your library!
            </div>
          )}
        </div>
      )}

      {/* TAB: ABOUT */}
      {tab === 'about' && (
        <div className="tc">
          <div className="agrid">
            <div>
              <div className="acard">
                <h3>About {username}</h3>
                <div className="abio">{user?.bio || 'No bio set yet. Edit your profile to add one.'}</div>
              </div>
              {badges.length > 0 && (
                <div className="acard">
                  <h3>🏅 Badges</h3>
                  <div className="bfgrid">
                    {badges.slice(0, 8).map((b, i) => (
                      <div key={b.badge_key || b.title || i} className={`bcard${b.unlocked === false ? ' locked' : ''}`}>
                        <div className="bico">{b.icon || '🏅'}</div>
                        <div className="bname">{b.title}</div>
                        {b.tier && <div className={`blvl ${(b.tier || '').toLowerCase()}`}>{b.tier}</div>}
                        <div className="bprog"><div className="bpfill" style={{ width: `${b.progress_pct || 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="acard">
                <h3>📖 Stats</h3>
                <div className="rtgrid">
                  <div className="rti"><div className="rtn">{formatCount(stats.reads)}</div><div className="rtl">Reads</div></div>
                  <div className="rti"><div className="rtn">{formatCount(stories.length)}</div><div className="rtl">Stories</div></div>
                  <div className="rti"><div className="rtn">{formatCount(stats.likes)}</div><div className="rtl">Likes</div></div>
                  <div className="rti"><div className="rtn">{formatCount(stats.geeks)}</div><div className="rtl">Geeks</div></div>
                </div>
                {joinDate && <div className="rtnote">Member since <strong>{joinDate}</strong>.</div>}
              </div>
            </div>
            <div>
              <div className="acard">
                <h3>Contact</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {user?.email && <div style={{ fontSize: '13px', color: 'var(--muted)' }}>📧 {user.email}</div>}
                  {user?.location && <div style={{ fontSize: '13px', color: 'var(--muted)' }}>📍 {user.location}{user.country ? `, ${user.country}` : ''}</div>}
                  {user?.website && <a href={user.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--gold)', textDecoration: 'none' }}>🔗 {user.website}</a>}
                  {!user?.location && !user?.website && <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No contact info set.</div>}
                </div>
                <button className="bp-btn-primary" style={{ marginTop: '16px', width: '100%', padding: '9px' }} onClick={() => setEditModalOpen(true)}>
                  Edit Profile
                </button>
              </div>
              {genres.length > 0 && (
                <div className="acard">
                  <h3>Writing Interests</h3>
                  <div className="iwrap">{genres.map((g) => <span key={g} className="gtag">{g}</span>)}</div>
                </div>
              )}
              {(user?.preferred_language || user?.reading_goal) && (
                <div className="acard">
                  <h3>Preferences</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--muted)' }}>
                    {user?.preferred_language && <div>🌐 Language: {user.preferred_language}</div>}
                    {user?.reading_goal && <div>🎯 Goal: {user.reading_goal}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACTIVITY */}
      {tab === 'activity' && (
        <div className="tc">
          {stories.length === 0 && history.length === 0 && bookmarks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: '14px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
              No recent activity.
            </div>
          ) : (
            <div className="alist">
              {stories.slice(0, 3).map((s, i) => (
                <div key={`st-${s._id || i}`}>
                  {i > 0 && <div className="adiv" />}
                  <div className="aitem" onClick={() => router.push(`/story/${s._id || s.id}`)} style={{ cursor: 'pointer' }}>
                    <div className="aico ap">✍️</div>
                    <div className="abod">
                      <div className="atxt">Published <strong>{s.title}</strong></div>
                      <div className="atm">{timeAgo(s.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {history.slice(0, 5).map((h, i) => (
                <div key={`h-${h.story_id || i}`}>
                  <div className="adiv" />
                  <div className="aitem" onClick={() => router.push(`/story/${h.story_id}`)} style={{ cursor: 'pointer' }}>
                    <div className="aico ac">📖</div>
                    <div className="abod">
                      <div className="atxt">Read <strong>{h.title || 'a story'}</strong> — {Math.round(h.progress_pct || 0)}% done</div>
                      <div className="atm">{timeAgo(h.updated_at || h.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {bookmarks.slice(0, 3).map((b, i) => (
                <div key={`bm-${b.story_id || i}`}>
                  <div className="adiv" />
                  <div className="aitem" onClick={() => router.push(`/story/${b.story_id}`)} style={{ cursor: 'pointer' }}>
                    <div className="aico al">🔖</div>
                    <div className="abod">
                      <div className="atxt">Saved <strong>{b.title || 'a story'}</strong> to library</div>
                      <div className="atm">{timeAgo(b.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: BADGES */}
      {tab === 'badges' && (
        <div className="tc">
          {badges.length > 0 ? (
            <div className="bfgrid">
              {badges.map((b, i) => (
                <div key={b.badge_key || b.title || i} className={`bcard${b.unlocked === false ? ' locked' : ''}`}>
                  <div className="bico">{b.icon || '🏅'}</div>
                  <div className="bname">{b.title}</div>
                  {b.tier && <div className={`blvl ${(b.tier || '').toLowerCase()}`}>{b.tier}</div>}
                  <div className="bprog"><div className="bpfill" style={{ width: `${b.progress_pct || 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: '14px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏅</div>
              No badges yet. Keep reading and writing to earn them!
            </div>
          )}
        </div>
      )}

      {/* EDIT PROFILE MODAL */}
      {editModalOpen && (
        <div className="moverlay open" onClick={(e) => { if (e.target === e.currentTarget) setEditModalOpen(false); }}>
          <div className="mbox">
            <div className="mhead">
              <div className="mtitle">Edit Profile</div>
              <button className="mclose" onClick={() => setEditModalOpen(false)}>✕</button>
            </div>
            <div className="minp-wrap"><label className="minp-lbl">Username (locked)</label><input className="minp" value={user?.username || ''} readOnly disabled /></div>
            <div className="minp-wrap"><label className="minp-lbl">Email (locked)</label><input className="minp" value={user?.email || ''} readOnly disabled /></div>
            <div className="minp-wrap"><label className="minp-lbl">Full Name (locked)</label><input className="minp" value={editForm.full_name} readOnly disabled /></div>
            <div className="minp-wrap">
              <label className="minp-lbl">Bio</label>
              <textarea className="minp" rows={3} value={editForm.bio} onChange={(e) => setEditForm(p => ({ ...p, bio: e.target.value }))} placeholder="Tell your story..." />
            </div>
            <div className="minp-wrap">
              <label className="minp-lbl">Location</label>
              <input className="minp" value={editForm.location} onChange={(e) => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="City, Country" />
            </div>
            <div className="minp-wrap">
              <label className="minp-lbl">Website</label>
              <input className="minp" type="url" value={editForm.website} onChange={(e) => setEditForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="minp-wrap">
              <label className="minp-lbl">Preferred Language</label>
              <input className="minp" value={editForm.preferred_language} onChange={(e) => setEditForm(p => ({ ...p, preferred_language: e.target.value }))} />
            </div>
            <div className="minp-wrap">
              <label className="minp-lbl">Reading Goal</label>
              <input className="minp" value={editForm.reading_goal} onChange={(e) => setEditForm(p => ({ ...p, reading_goal: e.target.value }))} placeholder="e.g. 10 stories this month" />
            </div>
            {profileMsg && (
              <div style={{ fontSize: '12px', color: profileMsg.includes('success') ? 'var(--teal)' : 'var(--rose)', marginBottom: '8px' }}>{profileMsg}</div>
            )}
            <div className="macts">
              <button className="mbs" onClick={() => { setEditModalOpen(false); setProfileMsg(''); }}>Cancel</button>
              <button className="mbp" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={typeof window !== 'undefined' ? window.location.href : ''}
        title={`${username} on Bixbi`}
      />

      <div className={`bp-toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}
