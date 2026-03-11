import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

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

  const handleDeletePost = async (postId) => {
    setConfirmDialog({ text: '投稿を削除しますか？', onOk: async () => {
      try { await axios.delete('/api/posts/' + postId); } catch (err) {}
    }});
    return;
    try { await axios.delete(`/api/posts/${postId}`); setPosts((prev) => prev.filter((p) => p.id !== postId)); }
    catch (err) {}
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
    <div className="page">
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
      <div className="page-header">タイムライン</div>
      <div className="card" style={{ margin: '10px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div className="tl-avatar">{currentUser.displayName?.[0] || '?'}</div>
          <div style={{ flex: 1 }}>
            <textarea className="tl-input" placeholder="今何してる？"
              value={newPostText} onChange={(e) => setNewPostText(e.target.value)} rows={3} />
            {newPostImagePreview && (
              <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                <img src={newPostImagePreview} alt="preview" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }} />
                <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(null); }}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', borderRadius: '50%', width: 24, height: 24, fontSize: 12 }}>✕</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <label className="tl-img-btn">
            📷 画像
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
          </label>
          <button className="btn btn-primary" onClick={handlePost}
            disabled={posting || (!newPostText.trim() && !newPostImage)}>
            {posting ? '投稿中...' : '投稿'}
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">まだ投稿がありません。最初の投稿をしよう！</div>
      ) : (
        posts.map((post) => {
          const authorName = post.username || '不明';
          const isOwn = post.user_id === currentUser.id;
          const liked = isLiked(post);
          const showComments = expandedComments[post.id];
          return (
            <div key={post.id} className="tl-post">
              <div className="tl-post-header">
                <div className="tl-avatar">{authorName[0]}</div>
                <div className="tl-post-meta">
                  <span className="tl-author">{authorName}</span>
                  <span className="tl-time">{timeAgo(post.created_at)}</span>
                </div>
                {isOwn && <button onClick={() => handleDeletePost(post.id)} style={{ fontSize: 16, background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:4, borderRadius:8 }}>🗑️</button>}
              </div>
              {post.content && <p className="tl-content">{post.content}</p>}
              {post.image && <img src={`${SERVER_URL}${post.image}`} alt="post" className="tl-image" />}
              <div className="tl-actions">
                <button className={`tl-action-btn ${liked ? 'liked' : ''}`} onClick={() => handleLike(post.id)}>
                  {liked ? '❤️' : '🤍'} {post.likes?.length || 0}
                </button>
                <button className="tl-action-btn"
                  onClick={() => setExpandedComments((p) => ({ ...p, [post.id]: !p[post.id] }))}>
                  💬 {post.comments?.length || 0}
                </button>
              </div>
              {showComments && (
                <div className="tl-comments">
                  {post.comments?.map((c, i) => (
                    <div key={i} className="tl-comment">
                      <span className="tl-comment-author">{c.username || '?'}</span>
                      <span className="tl-comment-text">{c.content}</span>
                    </div>
                  ))}
                  <div className="tl-comment-input-row">
                    <input className="form-input" style={{ marginBottom: 0, fontSize: 13 }}
                      placeholder="コメントを入力..."
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)} />
                    <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}
                      onClick={() => handleComment(post.id)}>送信</button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <style>{`
        .tl-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex-shrink: 0; }
        .tl-input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 14px; resize: none; outline: none; font-family: inherit; }
        .tl-input:focus { border-color: var(--primary); }
        .tl-img-btn { font-size: 13px; color: var(--text2); cursor: pointer; padding: 6px 12px; border-radius: 8px; background: var(--surface2); }
        .tl-post { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 16px; }
        .tl-post-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .tl-post-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .tl-author { font-weight: 700; font-size: 14px; }
        .tl-time { font-size: 11px; color: var(--text2); }
        .tl-content { font-size: 14px; line-height: 1.6; margin-bottom: 10px; white-space: pre-wrap; }
        .tl-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 10px; margin-bottom: 10px; display: block; }
        .tl-actions { display: flex; gap: 16px; padding-top: 8px; border-top: 1px solid var(--border); }
        .tl-action-btn { font-size: 13px; color: var(--text2); padding: 4px 8px; border-radius: 6px; transition: background 0.15s; }
        .tl-action-btn:hover { background: var(--surface2); }
        .tl-action-btn.liked { color: #e74c3c; }
        .tl-comments { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .tl-comment { font-size: 13px; padding: 4px 0; display: flex; gap: 8px; }
        .tl-comment-author { font-weight: 600; flex-shrink: 0; }
        .tl-comment-input-row { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
        .tl-comment-input-row .form-input { flex: 1; }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text2); font-size: 14px; }
      `}</style>
    </div>
  );
}
