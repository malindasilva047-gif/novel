'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, apiUpload, readToken } from '@/lib/api';

const GENRES = ['Fantasy','Romance','Mystery','Sci-Fi','Horror','Adventure','Drama','Teen Fiction','Fan Fiction','Poetry','Non-Fiction'];
const STATUS_OPTS = ['Draft','Published'];

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stories, setStories] = useState([]);
  const [storyId, setStoryId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [activeChIdx, setActiveChIdx] = useState(0);
  const [content, setContent] = useState('');
  const [chapterTitle, setChapterTitle] = useState('Chapter 1');
  const [story, setStory] = useState({
    title: '',
    description: '',
    genre: 'Fantasy',
    status: 'Draft',
    tags: '',
    cover_image: '',
    is_premium: false,
    premium_price: '',
  });
  const [tab, setTab] = useState('write');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const editorRef = useRef(null);

  const activeChapter = chapters[activeChIdx];

  const plainTextFromHtml = (html) =>
    String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const showToast = (msg) => {
    const t = document.createElement('div');
    t.className = 'bx-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2500);
  };

  async function loadStories() {
    const mine = await apiRequest('/stories/mine').catch(() => []);
    const items = Array.isArray(mine) ? mine : [];
    setStories(items);
    const queryStoryId = (searchParams.get('storyId') || '').trim();
    if (queryStoryId) {
      const target = items.find((item) => String(item.id || item._id) === queryStoryId);
      if (target) {
        const targetId = target.id || target._id || '';
        setStoryId(targetId);
        setStory({
          title: target.title || '',
          description: target.description || '',
          genre: (target.categories || [])[0] || 'Fantasy',
          status: target.status === 'draft' ? 'Draft' : 'Published',
          tags: Array.isArray(target.tags) ? target.tags.join(', ') : '',
          cover_image: target.cover_image || '',
          is_premium: !!target.is_premium,
          premium_price: target.premium_price ?? '',
        });
        return;
      }
    }
    if (!storyId && items.length) {
      const first = items[0];
      setStoryId(first.id || first._id || '');
      setStory({
        title: first.title || '',
        description: first.description || '',
        genre: (first.categories || [])[0] || 'Fantasy',
        status: first.status === 'draft' ? 'Draft' : 'Published',
        tags: Array.isArray(first.tags) ? first.tags.join(', ') : '',
        cover_image: first.cover_image || '',
        is_premium: !!first.is_premium,
        premium_price: first.premium_price ?? '',
      });
    }
  }

  async function loadChapters(selectedStoryId) {
    if (!selectedStoryId) {
      setChapters([]);
      setChapterTitle('Chapter 1');
      setContent('');
      setActiveChIdx(0);
      return;
    }
    const chapterData = await apiRequest(`/stories/${selectedStoryId}/chapters`).catch(() => ({ chapters: [] }));
    const list = chapterData?.chapters || [];
    const normalized = list.map((ch) => ({
      id: ch.id || ch._id,
      num: ch.chapter_number,
      title: ch.title,
      content: ch.content || '',
      status: 'draft',
      words: (ch.content || '').trim() ? (ch.content || '').trim().split(/\s+/).length : 0,
    }));
    setChapters(normalized);
    if (normalized.length) {
      setActiveChIdx(0);
      setChapterTitle(normalized[0].title);
      setContent(normalized[0].content || '');
    } else {
      setActiveChIdx(0);
      setChapterTitle('Chapter 1');
      setContent('');
    }
  }

  useEffect(() => {
    if (!readToken()) {
      router.replace('/auth/signin?next=%2Fwrite');
      return;
    }
    loadStories().catch(() => {});
  }, [router, searchParams]);

  useEffect(() => {
    loadChapters(storyId).catch(() => {});
  }, [storyId]);

  useEffect(() => {
    const plainText = plainTextFromHtml(content);
    const words = plainText ? plainText.split(/\s+/).length : 0;
    setWordCount(words);
    setSaved(false);
  }, [content]);

  useEffect(() => {
    if (tab !== 'write') return;
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== content) {
      editor.innerHTML = content || '';
    }
  }, [content, tab]);

  useEffect(() => {
    if (!chapters.length) return;
    const ch = chapters[activeChIdx];
    if (!ch) return;
    setChapterTitle(ch.title || `Chapter ${ch.num || activeChIdx + 1}`);
    setContent(ch.content || '');
  }, [activeChIdx, chapters]);

  const addChapter = () => {
    const n = chapters.length + 1;
    const ch = { id: null, num: n, title: `Chapter ${n}`, content: '', status: 'draft', words: 0 };
    setChapters((cs) => [...cs, ch]);
    setActiveChIdx(chapters.length);
    setChapterTitle(ch.title);
    setContent('');
  };

  const toolbar = [
    { label: 'B', command: 'bold', tip: 'Bold' },
    { label: 'I', command: 'italic', tip: 'Italic', style: { fontStyle: 'italic' } },
    { label: 'U', command: 'underline', tip: 'Underline' },
    { label: 'H', command: 'hiliteColor', value: '#ffe58f', tip: 'Highlight' },
    { label: '•', command: 'insertUnorderedList', tip: 'Bullet list' },
  ];

  const applyEditorCommand = (tool) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    if (tool.command === 'hiliteColor') {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, tool.value || '#ffe58f');
    } else {
      document.execCommand(tool.command, false, tool.value || null);
    }

    setContent(editor.innerHTML);
  };

  const persistDetails = async () => {
    if (!story.title.trim() || story.description.trim().length < 10) {
      showToast('Title and description (10+ chars) are required.');
      return null;
    }

    const payload = {
      title: story.title.trim(),
      description: story.description.trim(),
      cover_image: story.cover_image || '',
      tags: story.tags.split(',').map((t) => t.trim()).filter(Boolean),
      categories: [story.genre],
      is_draft: story.status === 'Draft',
      is_premium: !!story.is_premium,
      premium_price: story.is_premium && story.premium_price !== '' ? Number(story.premium_price) : null,
    };

    if (storyId) {
      await apiRequest(`/stories/${storyId}`, { method: 'PATCH', body: payload });
      await loadStories();
      return storyId;
    }

    const created = await apiRequest('/stories', { method: 'POST', body: payload });
    const newId = created.story_id;
    setStoryId(newId);
    await loadStories();
    return newId;
  };

  const handleSave = async (auto = false) => {
    try {
      setSaving(true);
      const sid = await persistDetails();
      if (!sid) return;

      if (!chapterTitle.trim()) {
        showToast('Chapter title is required.');
        return;
      }
      if (plainTextFromHtml(content).length < 50) {
        showToast('Chapter content must be at least 50 characters.');
        return;
      }

      const existing = chapters[activeChIdx];
      if (existing?.id) {
        await apiRequest(`/stories/${sid}/chapters/${existing.id}`, {
          method: 'PATCH',
          body: { title: chapterTitle.trim(), content },
        });
      } else {
        await apiRequest(`/stories/${sid}/chapters`, {
          method: 'POST',
          body: { story_id: sid, title: chapterTitle.trim(), content },
        });
      }

      await loadChapters(sid);
      setSaved(true);
      if (!auto) showToast('Saved');
    } catch (err) {
      showToast(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publishStory = async () => {
    if (!storyId) {
      await persistDetails();
    }
    const sid = storyId;
    if (!sid) return;
    await apiRequest(`/stories/${sid}`, { method: 'PATCH', body: { is_draft: false } }).catch(() => {});
    setStory((s) => ({ ...s, status: 'Published' }));
    showToast('Story published');
    await loadStories();
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const up = await apiUpload('/stories/upload-cover', { file });
      setStory((s) => ({ ...s, cover_image: up.url }));
      showToast('Cover uploaded');
    } catch (err) {
      showToast(err.message || 'Upload failed');
    }
  };

  return (
    <div className="bx-writer-layout">
      <aside className="bx-writer-sidebar">
        <div className="bx-ws-top">
          <div className="bx-ws-story">
            <div className="bx-ws-cover" style={{background:'linear-gradient(135deg,#1a0a2e,#3d1a5e)',overflow:'hidden'}}>
              {story.cover_image ? <img src={story.cover_image} alt="cover" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : '?'}
            </div>
            <div className="bx-ws-info">
              <div className="bx-ws-title">{story.title || 'Untitled Story'}</div>
              <div className="bx-ws-status">{story.status} | {story.genre}</div>
            </div>
          </div>

          <select value={storyId} onChange={(e) => setStoryId(e.target.value)} className="bx-auth-input" style={{fontSize:'12px',padding:'7px 10px',marginBottom:'8px'}}>
            <option value="">New Story</option>
            {stories.map((s) => <option key={s.id || s._id} value={s.id || s._id}>{s.title}</option>)}
          </select>

          <button onClick={addChapter} style={{width:'100%',padding:'7px',border:'1px dashed var(--border2)',borderRadius:'8px',background:'none',color:'var(--muted)',fontSize:'13px',cursor:'pointer',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}>
            <span style={{fontSize:'16px'}}>+</span> New Chapter
          </button>
        </div>

        <div className="bx-ws-scroll">
          {chapters.map((ch, i) => (
            <div key={ch.id || `draft-${i}`} className={`bx-ch-item${activeChIdx === i ? ' active' : ''}`} onClick={() => setActiveChIdx(i)}>
              <span className="bx-ch-num">{ch.num}</span>
              <span className="bx-ch-text">{ch.title}</span>
              <span className={`bx-ch-badge${story.status === 'Published' ? ' pub' : ''}`}>{story.status === 'Published' ? 'pub' : 'draft'}</span>
            </div>
          ))}
          {!chapters.length && <p className="token-state">No chapters yet.</p>}
        </div>
      </aside>

      <div className="bx-writer-main">
        <div className="bx-writer-topbar">
          <div style={{display:'flex',gap:'4px',marginRight:'8px'}}>
            {[{id:'write',label:'Write'},{id:'details',label:'Details'},{id:'profile',label:'Profile'}].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{background:tab===t.id?'var(--surface2)':'none',border:'none',color:tab===t.id?'var(--text)':'var(--muted)',padding:'5px 12px',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontFamily:'DM Sans,sans-serif'}}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'write' && (
            <input className="bx-ch-title-input" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} placeholder="Chapter title..." />
          )}

          <div style={{display:'flex',gap:'8px',alignItems:'center',marginLeft:'auto',flexShrink:0}}>
            <span style={{fontSize:'12px',color:'var(--muted)',opacity:saving?1:saved?0.6:1}}>{saving ? 'Saving...' : saved ? 'Saved' : 'Unsaved'}</span>
            <button className="bx-btn-ghost" style={{padding:'6px 14px',fontSize:'13px',borderColor:'var(--teal)',color:'var(--teal)'}} onClick={publishStory}>Publish</button>
            <button className="bx-btn-primary" style={{padding:'7px 16px',fontSize:'13px'}} onClick={() => handleSave(false)}>Save</button>
          </div>
        </div>

        {tab === 'write' && (
          <>
            <div style={{padding:'6px 24px',borderBottom:'1px solid var(--border)',display:'flex',gap:'4px',background:'var(--deep)',flexShrink:0}}>
              {toolbar.map((tool) => (
                <button
                  key={tool.label}
                  onClick={() => applyEditorCommand(tool)}
                  title={tool.tip}
                  style={{width:'32px',height:'30px',background:'none',border:'1px solid transparent',borderRadius:'5px',cursor:'pointer',color:'var(--muted)',fontSize:'14px',fontWeight:700,...(tool.style||{}),fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',justifyContent:'center'}}
                >
                  {tool.label}
                </button>
              ))}
              <div style={{width:'1px',background:'var(--border)',margin:'4px 6px'}} />
              <span style={{fontSize:'11px',color:'var(--muted)',alignSelf:'center',paddingLeft:'4px'}}>Rich text editor</span>
            </div>

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => setContent(event.currentTarget.innerHTML)}
              data-placeholder="Begin your story here..."
              style={{flex:1,background:'var(--ink)',border:'none',outline:'none',padding:'40px 48px',fontSize:'17px',lineHeight:1.8,fontFamily:'Lora,Georgia,serif',color:'var(--text)',overflow:'auto',caretColor:'var(--gold)',whiteSpace:'pre-wrap'}}
            />
          </>
        )}

        {tab === 'details' && (
          <div style={{flex:1,overflowY:'auto',padding:'32px 40px'}}>
            <h3 style={{fontFamily:'Cormorant Garamond,serif',fontSize:'22px',fontWeight:400,color:'var(--text)',marginBottom:'24px'}}>Story Details</h3>
            <div style={{display:'flex',flexDirection:'column',gap:'16px',maxWidth:'700px'}}>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Story Title</label>
                <input className="bx-auth-input" value={story.title} onChange={e => setStory(s=>({...s,title:e.target.value}))} placeholder="Enter your story title" />
              </div>

              <div className="bx-auth-field">
                <label className="bx-auth-label">Description</label>
                <textarea className="bx-auth-input" rows={4} style={{resize:'none',fontFamily:'DM Sans,sans-serif'}} value={story.description} onChange={e => setStory(s=>({...s,description:e.target.value}))} placeholder="Write a compelling description..." />
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Category</label>
                  <select className="bx-auth-input" value={story.genre} onChange={e=>setStory(s=>({...s,genre:e.target.value}))}>
                    {GENRES.map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Status</label>
                  <select className="bx-auth-input" value={story.status} onChange={e=>setStory(s=>({...s,status:e.target.value}))}>
                    {STATUS_OPTS.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="bx-auth-field">
                <label className="bx-auth-label">Tags (comma separated)</label>
                <input className="bx-auth-input" value={story.tags} onChange={e=>setStory(s=>({...s,tags:e.target.value}))} placeholder="magic, adventure, coming-of-age" />
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Access</label>
                  <select className="bx-auth-input" value={story.is_premium ? 'premium' : 'free'} onChange={e=>setStory(s=>({...s,is_premium:e.target.value==='premium'}))}>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Premium Price</label>
                  <input
                    className="bx-auth-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={story.premium_price}
                    disabled={!story.is_premium}
                    onChange={e=>setStory(s=>({...s,premium_price:e.target.value}))}
                    placeholder="2.99"
                  />
                </div>
              </div>

              <div className="bx-auth-field">
                <label className="bx-auth-label">Cover Image</label>
                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                  <label className="bx-btn-ghost" style={{fontSize:'12px',padding:'8px 12px',cursor:'pointer'}}>
                    Upload Cover
                    <input type="file" accept="image/*" hidden onChange={handleCoverUpload} />
                  </label>
                  {story.cover_image && <span style={{fontSize:'12px',color:'var(--teal)'}}>Uploaded</span>}
                </div>
              </div>

              <button className="bx-auth-submit" style={{marginTop:'8px'}} onClick={persistDetails}>Save Details</button>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div style={{flex:1,overflowY:'auto',padding:'32px 40px'}}>
            <h3 style={{fontFamily:'Cormorant Garamond,serif',fontSize:'22px',fontWeight:400,color:'var(--text)',marginBottom:'12px'}}>Writer Studio</h3>
            <p style={{color:'var(--muted)',fontSize:'14px',lineHeight:1.7,maxWidth:'640px'}}>
              Manage your stories, chapters, cover images, tags, and publication state from one place. This panel is connected to FastAPI + MongoDB endpoints.
            </p>
            <div style={{marginTop:'18px',display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <button className="bx-btn-primary" style={{fontSize:'12px',padding:'9px 14px'}} onClick={() => router.push('/profile')}>Open Public Profile</button>
              <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'9px 14px'}} onClick={() => router.push('/discover')}>Browse Discover</button>
            </div>
          </div>
        )}

        <div className="bx-writer-bottom">
          <span className="bx-w-stat"><strong>{wordCount.toLocaleString()}</strong> words</span>
          <span className="bx-w-stat"><strong>{Math.ceil(wordCount/200)}</strong> min read</span>
          <span className="bx-w-stat" style={{marginLeft:'auto'}}>Ch. {activeChapter?.num || 1} | {(story.status || 'Draft').toLowerCase()}</span>
        </div>
      </div>
    </div>
  );
}
