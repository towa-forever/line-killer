import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
const ADMIN_USERNAME = 'とわ';
const CATEGORIES = ['一般', 'テクノロジー', 'エンタメ', 'スポーツ', 'ゲーム', '生活', 'その他'];

export default function NewsTab({ currentUser, socket }) {
  const [news, setNews]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [title, setTitle]         = useState('');
  const [content, setContent]     = useState('');
  const [url, setUrl]             = useState('');
  const [category, setCategory]   = useState('一般');
  const [image, setImage]         = useState(null);
  const [posting, setPosting]     = useState(false);
  const [filter, setFilter]       = useState('すべて');
  const fileRef = useRef(null);

  const isAdmin = (currentUser?.username || '').trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase();

  const fetchNews = useCallback(async () => {
    try {
      const res = await axios.get('/api/news');
      setNews(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  useEffect(() => {
    if (!socket) return;
    const onNew     = (item) => setNews(prev => [item, ...prev]);
    const onDeleted = ({ id }) => setNews(prev => prev.filter(n => n.id !== id));
    socket.on('news:new', onNew);
    socket.on('news:deleted', onDeleted);
    return () => { socket.off('news:new', onNew); socket.off('news:deleted', onDeleted); };
  }, [socket]);

  const handlePost = useCallback(async () => {
    if (!title.trim()) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('content', content);
      fd.append('url', url);
      fd.append('category', category);
      if (image) fd.append('image', image);
      await axios.post('/api/news', fd);
      setTitle(''); setContent(''); setUrl(''); setImage(null); setShowForm(false);
    } catch (e) { alert(e.response?.data?.error || '投稿に失敗しました'); }
    finally { setPosting(false); }
  }, [title, content, url, category, image]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await axios.delete(`/api/news/${id}`).catch(() => {});
  }, []);

  const filtered = filter === 'すべて' ? news : news.filter(n => n.category === filter);

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--text2)' }}>読み込み中...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)' }}>
      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', background:'var(--surface)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:18 }}>📰 ニュース</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>最新情報をチェック</div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowForm(v => !v)}
              style={{ padding:'7px 16px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {showForm ? '✕ 閉じる' : '＋ 投稿'}
            </button>
          )}
        </div>
        {/* カテゴリフィルター */}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {['すべて', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setFilter(c)}
              style={{ padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', whiteSpace:'nowrap', fontSize:12, fontWeight: filter===c ? 700 : 400, background: filter===c ? 'var(--primary)' : 'var(--surface2)', color: filter===c ? 'white' : 'var(--text2)' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 0 80px' }}>
        {/* 管理者投稿フォーム */}
        {isAdmin && showForm && (
          <div style={{ padding:16, borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>📝 ニュース投稿</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル（必須）*"
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, marginBottom:8, boxSizing:'border-box', outline:'none' }} />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="本文（任意）"
              style={{ width:'100%', minHeight:80, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, resize:'none', marginBottom:8, boxSizing:'border-box', outline:'none' }} />
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="外部リンク（任意）"
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, marginBottom:8, boxSizing:'border-box', outline:'none' }} />
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, marginBottom:8, outline:'none' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button onClick={() => fileRef.current?.click()} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--text2)' }}>🖼️ 画像</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => setImage(e.target.files[0])} />
              <button onClick={handlePost} disabled={posting || !title.trim()}
                style={{ padding:'8px 24px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', opacity: posting || !title.trim() ? 0.5 : 1 }}>
                {posting ? '投稿中...' : '投稿する'}
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>ニュースがまだないで</div>
        )}

        {filtered.map(item => (
          <div key={item.id} style={{ borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
            <div style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', gap:12 }}>
                {item.image && (
                  <img src={item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`}
                    alt="" style={{ width:80, height:80, borderRadius:10, objectFit:'cover', flexShrink:0 }} />
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'var(--primary)', color:'white', fontWeight:700 }}>{item.category}</span>
                    <span style={{ fontSize:11, color:'var(--text2)' }}>{new Date(item.published_at).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                    {isAdmin && (
                      <button onClick={() => handleDelete(item.id)} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:14 }}>🗑️</button>
                    )}
                  </div>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:4, lineHeight:1.4 }}>{item.title}</div>
                  {item.content && <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{item.content}</div>}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'inline-block', marginTop:6, fontSize:12, color:'var(--primary)', textDecoration:'none', padding:'4px 10px', borderRadius:8, border:'1px solid var(--primary)' }}>
                      🔗 続きを読む
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
