import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
const ADMIN_USERNAME = 'towa';

export default function Timeline({ currentUser }) {
  const [posts, setPosts] = useState([]);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const fileInputRef = useRef(null);

  const isAdmin = currentUser?.username === ADMIN_USERNAME;
  // デバッグ用（確認後に削除可能）
  console.log('[お知らせ] currentUser:', currentUser?.username, 'isAdmin:', isAdmin);

  const fetchPosts = useCallback(async () => {
    try { const res = await axios.get('/api/posts'); setPosts(res.data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewPostImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setNewPostImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePost = async () => {
    if (!newPostText.trim() && !newPostImage) return;
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('content', newPostText);
      if (newPostImage) formData.append('image', newPostImage);
      const res = await axios.post('/api/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPosts((prev) => [res.data, ...prev]);
      setNewPostText(''); setNewPostImage(null); setNewPostImagePreview(null);
    } catch (err) { console.error(err); }
    finally { setPosting(false); }
  };

  const handleLike = async (postId) => {
    try {
      const res = await axios.post(`/api/posts/${postId}/like`);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likes: res.data.likes } : p));
    } catch (err) {}
  };

  const handleComment = async (postId) => {
    const text = commentInputs[postId];
    if (!text?.trim()) return;
    try {
      const res = await axios.post(`/api/posts/${postId}/comments`, { content: text });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: res.data.comments } : p));
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {}
  };

  const handleDeletePost = (postId) => {
    setConfirmDialog({ text: 'お知らせを削除しますか？', onOk: async () => {
      try {
        await axios.delete('/api/posts/' + postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } catch (err) { console.error(err); }
    }});
  };

  const isLiked = (post) => post.likes?.some((l) => l === currentUser._id || l === currentUser.id);

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `${day}日前`;
    if (hr > 0) return `${hr}時間前`;
    if (min > 0) return `${min}分前`;
    return 'たった今';
  };

  if (loading) return <div className="page"><div className="empty-state">読み込み中...</div></div>;

  return (
    <div className="page" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, textAlign:'center' }}>{confirmDialog.text}</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>削除</button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ background:'linear-gradient(135deg, var(--primary), #6c3483)', padding:'16px 16px 20px', color:'white' }}>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:2 }}>📢 お知らせ</div>
        <div style={{ fontSize:12, opacity:0.85 }}>LINE Killerからの最新情報をお届けします</div>
      </div>

      {/* 管理者のみ投稿フォームを表示 */}
      {isAdmin && (
        <div className="card" style={{ margin:'12px 12px 0', border:'2px solid var(--primary)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <span style={{ fontSize:14, fontWeight:700, color:'var(--primary)' }}>📝 管理者投稿</span>
            <span style={{ fontSize:11, background:'var(--primary)', color:'white', borderRadius:10, padding:'1px 8px' }}>ADMIN</span>
          </div>
          <textarea className="tl-input" placeholder="お知らせ内容を入力..."
            value={newPostText} onChange={(e) => setNewPostText(e.target.value)} rows={3} />
          {newPostImagePreview && (
            <div style={{ position:'relative', display:'inline-block', marginTop:8 }}>
              <img src={newPostImagePreview} alt="preview" style={{ maxWidth:200, maxHeight:200, borderRadius:8 }} />
              <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(null); }}
                style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.5)', color:'white', borderRadius:'50%', width:24, height:24, fontSize:12, border:'none', cursor:'pointer' }}>✕</button>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
            <label className="tl-img-btn" style={{ cursor:'pointer' }}>
              📷 画像を添付
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
            </label>
            <button className="btn btn-primary" onClick={handlePost}
              disabled={posting || (!newPostText.trim() && !newPostImage)}>
              {posting ? '投稿中...' : '📢 投稿する'}
            </button>
          </div>
        </div>
      )}

      {/* お知らせ一覧 */}
      {posts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop:60 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>お知らせはまだありません</div>
          <div style={{ fontSize:12 }}>新しいお知らせが届いたらここに表示されます</div>
        </div>
      ) : (
        posts.map((post) => {
          const liked = isLiked(post);
          const showComments = expandedComments[post.id];
          return (
            <div key={post.id} style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px' }}>
              {/* 投稿ヘッダー */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,var(--primary),#6c3483)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                  📢
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>LINE Killer</span>
                    <span style={{ fontSize:11, background:'var(--primary)', color:'white', borderRadius:10, padding:'1px 6px' }}>公式</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>{timeAgo(post.created_at)}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDeletePost(post.id)}
                    style={{ fontSize:16, background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:4, borderRadius:8 }}>🗑️</button>
                )}
              </div>

              {/* 本文 */}
              {post.content && <p style={{ fontSize:14, lineHeight:1.7, marginBottom:10, whiteSpace:'pre-wrap' }}>{post.content}</p>}
              {post.image && (
                <img src={post.image.startsWith('http') ? post.image : `${SERVER_URL}${post.image}`}
                  alt="post" style={{ width:'100%', maxHeight:400, objectFit:'cover', borderRadius:12, marginBottom:10, display:'block' }} />
              )}

              {/* リアクション */}
              <div style={{ display:'flex', gap:16, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                <button onClick={() => handleLike(post.id)}
                  style={{ fontSize:13, color: liked ? '#e74c3c' : 'var(--text2)', padding:'4px 10px', borderRadius:20,
                    background: liked ? '#fde8e8' : 'var(--surface2)', border:'none', cursor:'pointer', fontWeight: liked ? 700 : 400 }}>
                  {liked ? '❤️' : '🤍'} {post.likes?.length || 0}
                </button>
                <button onClick={() => setExpandedComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
                  style={{ fontSize:13, color:'var(--text2)', padding:'4px 10px', borderRadius:20, background:'var(--surface2)', border:'none', cursor:'pointer' }}>
                  💬 {post.comments?.length || 0}件のコメント
                </button>
              </div>

              {/* コメント欄 */}
              {showComments && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                  {post.comments?.map((c, i) => (
                    <div key={i} style={{ fontSize:13, padding:'4px 0', display:'flex', gap:8 }}>
                      <span style={{ fontWeight:600, flexShrink:0 }}>{c.username || '?'}</span>
                      <span style={{ color:'var(--text2)' }}>{c.content}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <input className="form-input" style={{ marginBottom:0, fontSize:13, flex:1 }}
                      placeholder="コメントを入力..."
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)} />
                    <button className="btn btn-primary" style={{ padding:'8px 14px', fontSize:13 }}
                      onClick={() => handleComment(post.id)}>送信</button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <style>{`
        .tl-input { width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--bg); color:var(--text); font-size:14px; resize:none; outline:none; font-family:inherit; box-sizing:border-box; }
        .tl-input:focus { border-color:var(--primary); }
        .tl-img-btn { font-size:13px; color:var(--text2); padding:6px 12px; border-radius:8px; background:var(--surface2); }
        .empty-state { text-align:center; padding:40px 20px; color:var(--text2); font-size:14px; }
      `}</style>
    </div>
  );
}
