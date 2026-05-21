import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER = process.env.REACT_APP_SERVER_URL || 'https://wakkachat.onrender.com';

// ストーリー一覧（上部リスト）
export function StoryBar({ currentUser, friendsList, socket }) { // eslint-disable-line no-unused-vars
  const [stories, setStories] = useState([]);
  const [viewing, setViewing] = useState(null); // { userId, stories[], idx }
  const fileRef = useRef(null);

  const load = useCallback(() => axios.get('/api/stories').then(r => setStories(r.data)).catch(() => {}), []);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, []);

  // ユーザー別にグループ化
  const byUser = {};
  stories.forEach(s => {
    if (!byUser[s.user_id]) byUser[s.user_id] = { name: s.user_name, avatar: s.user_avatar, items: [] };
    byUser[s.user_id].items.push(s);
  });
  const myStories = byUser[currentUser?.id];
  const others = Object.entries(byUser).filter(([id]) => id !== currentUser?.id);

  const openStory = useCallback((userId, items) => setViewing({ userId, items, idx: 0 }), []);

  const [posting, setPosting] = useState(false);
  const postStory = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || posting) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/api/upload', form);
      await axios.post('/api/stories', { type: file.type.startsWith('video') ? 'video' : 'image', url: res.data.url });
      load();
    } catch { /* アップロード失敗は無視 */ }
    finally {
      setPosting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  return (
    <>
      <div style={{ display:'flex', gap:12, padding:'10px 12px', overflowX:'auto', scrollbarWidth:'none', borderBottom:'1px solid var(--border)' }}>
        {/* 自分のストーリー投稿 */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', flexShrink:0 }}
          onClick={() => myStories ? openStory(currentUser.id, myStories.items) : fileRef.current?.click()}>
          <div style={{ width:52, height:52, borderRadius:'50%', border: myStories ? '2px solid var(--primary)' : '2px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'var(--surface2)', position:'relative' }}>
            {currentUser.avatar ? <img src={currentUser.avatar.startsWith('http')?currentUser.avatar:SERVER+currentUser.avatar} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : <span style={{ fontSize:22 }}>{currentUser.username?.[0]}</span>}
            {!myStories && <div style={{ position:'absolute', bottom:0, right:0, background:'var(--primary)', borderRadius:'50%', width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700 }}>+</div>}
          </div>
          <span style={{ fontSize:10, color:'var(--text2)', maxWidth:52, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>自分</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={postStory} />

        {/* 他ユーザーのストーリー */}
        {others.map(([uid, data]) => (
          <div key={uid} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', flexShrink:0 }} onClick={() => openStory(uid, data.items)}>
            <div style={{ width:52, height:52, borderRadius:'50%', border:'2px solid var(--primary)', overflow:'hidden', background:'var(--surface2)', padding:2 }}>
              {data.avatar ? <img src={data.avatar.startsWith('http')?data.avatar:SERVER+data.avatar} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} /> : <div style={{ width:'100%',height:'100%',borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700 }}>{data.name?.[0]}</div>}
            </div>
            <span style={{ fontSize:10, color:'var(--text2)', maxWidth:52, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{data.name}</span>
          </div>
        ))}
      </div>

      {/* ストーリービューワー */}
      {viewing && <StoryViewer data={viewing} onClose={() => setViewing(null)} currentUserId={currentUser?.id} onDeleted={() => { load(); setViewing(null); }} />}
    </>
  );
}

function StoryViewer({ data, onClose, currentUserId, onDeleted }) {
  const [idx, setIdx] = useState(data.idx || 0);
  const [progress, setProgress] = useState(0);
  const story = data.items[idx];
  const DURATION = 5000;

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(100, ((Date.now()-start)/DURATION)*100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(id);
        if (idx + 1 < data.items.length) setIdx(i => i+1);
        else onClose();
      }
    }, 50);
    return () => clearInterval(id);
  }, [idx, data.items.length, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) return null;
  const url = story.url?.startsWith('http') ? story.url : (process.env.REACT_APP_SERVER_URL||'https://wakkachat.onrender.com') + story.url;

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', zIndex:9000, display:'flex', flexDirection:'column' }} onClick={onClose}>
      {/* プログレスバー */}
      <div style={{ display:'flex', gap:3, padding:'10px 10px 0' }}>
        {data.items.map((_, i) => (
          <div key={i} style={{ flex:1, height:3, background:'rgba(255,255,255,0.3)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'white', width: i < idx ? '100%' : i===idx ? `${progress}%` : '0%', transition:'width 0.05s linear' }} />
          </div>
        ))}
      </div>
      {/* コンテンツ */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
        {story.type === 'video'
          ? <video src={url} autoPlay muted playsInline style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
          : <img src={url} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
        }
        {/* 閉じるボタン */}
        <button onClick={onClose} style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.5)', border:'none', color:'white', fontSize:22, cursor:'pointer', borderRadius:'50%', width:36, height:36 }}>×</button>
        {story.user_id === currentUserId && (
          <button onClick={async (e) => { e.stopPropagation(); try { await axios.delete('/api/stories/' + (story._id || story.id)); onDeleted?.(); } catch {} }}
            style={{ position:'absolute', top:10, left:10, background:'rgba(231,76,60,0.8)', border:'none', color:'white', fontSize:12, cursor:'pointer', borderRadius:20, padding:'5px 10px', fontWeight:700 }}>🗑️ 削除</button>
        )}
        {/* 投稿時刻 */}
        <div style={{ position:'absolute', bottom:16, left:16, color:'white', fontSize:12, opacity:0.8 }}>
          {new Date(story.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}
        </div>
      </div>
    </div>
  );
}
