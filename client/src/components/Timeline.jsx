import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
const ADMIN_USERNAME = 'とわ';

export default function Timeline({ currentUser }) {
  const [posts, setPosts]                   = useState([]);
  const [newPostText, setNewPostText]       = useState('');
  const [newPostImage, setNewPostImage]     = useState(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState(null);
  const [posting, setPosting]               = useState(false);
  const [commentInputs, setCommentInputs]   = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [loading, setLoading]               = useState(true);
  const [confirmDialog, setConfirmDialog]   = useState(null);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false); // eslint-disable-line no-unused-vars
  const fileInputRef = useRef(null);

  // 管理者判定 - 複数の方法でチェック
  const checkIsAdmin = () => {
    const u = currentUser;
    if (!u) return false;
    const name = (u.username || u.displayName || '').toLowerCase().trim();
    return name === ADMIN_USERNAME.toLowerCase();
  };
  const isAdmin = checkIsAdmin();

  const fetchPosts = useCallback(async () => {
    try {
      const res = await axios.get('/api/posts');
      setPosts(res.data);
    } catch (err) {
      console.error('投稿取得エラー:', err);
    } finally {
      setLoading(false);
    }
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

  // パスワード確認なしで直接投稿（サーバーが管理者チェック）
  const openPasswordModal = () => {
    if (!newPostText.trim() && !newPostImage) return;
    handlePost();
  };

  const handlePost = async () => {
    if (!newPostText.trim() && !newPostImage) return;
    setPosting(true);
    setError('');
    setShowPasswordModal(false);
    try {
      const formData = new FormData();
      formData.append('content', newPostText);
      if (newPostImage) formData.append('image', newPostImage);

      const res = await axios.post('/api/posts', formData);
      setPosts((prev) => [res.data, ...prev]);
      setNewPostText('');
      setNewPostImage(null);
      setNewPostImagePreview(null);
      setSuccess('投稿しました！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('投稿エラー:', err.response?.status, err.response?.data);
      const msg = err.response?.data?.error || err.message || '投稿に失敗しました';
      setError(msg);
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (postId) => {
    try {
      const res = await axios.post(`/api/posts/${postId}/like`);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likes: res.data.likes } : p));
    } catch {}
  };

  const handleComment = async (postId) => {
    const text = commentInputs[postId];
    if (!text?.trim()) return;
    try {
      const res = await axios.post(`/api/posts/${postId}/comments`, { content: text });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: res.data.comments } : p));
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch {}
  };

  const handleDeletePost = (postId) => {
    setConfirmDialog({ text: 'このお知らせを削除しますか？', onOk: async () => {
      try {
        await axios.delete('/api/posts/' + postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } catch (err) { console.error(err); }
    }});
  };

  const isLiked = (post) => post.likes?.some((l) => l === currentUser?._id || l === currentUser?.id);

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const min  = Math.floor(diff / 60000);
    const hr   = Math.floor(min / 60);
    const day  = Math.floor(hr / 24);
    if (day > 0) return `${day}日前`;
    if (hr  > 0) return `${hr}時間前`;
    if (min > 0) return `${min}分前`;
    return 'たった今';
  };

  if (loading) return (
    <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'var(--text2)' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>📢</div>
        <div>読み込み中...</div>
      </div>
    </div>
  );

  return (
    <div className="page" style={{ overflowY:'auto', paddingBottom:80, background:'var(--bg)' }}>

      {/* 確認ダイアログ */}
      {confirmDialog && ReactDOM.createPortal((
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
      ), document.body)}

      {/* パスワード確認モーダルは廃止 - サーバー側で管理者チェック */}

      {/* ヘッダー */}
      <div style={{ background:'#06c755', color:'white', padding:'16px 16px 18px', paddingTop:'calc(16px + env(safe-area-inset-top))' }}>
        <div className="timeline-header">📢 お知らせ</div>
        <div style={{ fontSize:12, opacity:0.85 }}>LINE Killerからの最新情報</div>
      </div>

      {/* エラー・成功通知 */}
      {error && (
        <div style={{ background:'#fff0f0', color:'#c0392b', padding:'10px 16px', fontSize:13, display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #ffcdd2' }}>
          <span>⚠️</span><span style={{ flex:1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', opacity:0.6, fontSize:16 }}>✕</button>
        </div>
      )}
      {success && (
        <div style={{ background:'#e8f5e9', color:'#2e7d32', padding:'10px 16px', fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
          <span>✅</span><span>{success}</span>
        </div>
      )}

      {/* 管理者のみ投稿フォーム */}
      {isAdmin && (
        <div style={{ margin:'12px 12px 0', background:'var(--surface)', borderRadius:16, padding:16, border:'2px solid #06c755', boxShadow:'0 2px 8px rgba(6,199,85,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
            <span style={{ fontSize:14, fontWeight:700, color:'#06c755' }}>📝 お知らせを投稿</span>
            <span style={{ fontSize:11, background:'#06c755', color:'white', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>ADMIN</span>
          </div>
          <textarea
            style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg)', color:'var(--text)', fontSize:14, resize:'none', outline:'none', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.5 }}
            placeholder="お知らせ内容を入力..."
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            rows={3}
          />
          {newPostImagePreview && (
            <div style={{ position:'relative', display:'inline-block', marginTop:8 }}>
              <img src={newPostImagePreview} alt="preview" style={{ maxWidth:200, maxHeight:200, borderRadius:8 }} />
              <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(null); }}
                style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', color:'white', borderRadius:'50%', width:24, height:24, fontSize:12, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
            <label style={{ fontSize:13, color:'var(--text2)', cursor:'pointer', padding:'6px 12px', borderRadius:8, background:'var(--surface2)' }}>
              📷 画像添付
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
            </label>
            <button
              onClick={openPasswordModal}
              disabled={posting || (!newPostText.trim() && !newPostImage)}
              style={{
                padding:'10px 24px', borderRadius:24,
                background: (posting || (!newPostText.trim() && !newPostImage)) ? '#ccc' : '#06c755',
                color:'white', border:'none', fontSize:14, fontWeight:700,
                cursor: (posting || (!newPostText.trim() && !newPostImage)) ? 'not-allowed' : 'pointer',
                boxShadow: posting ? 'none' : '0 3px 10px rgba(6,199,85,0.35)',
              }}>
              {posting ? '投稿中...' : '📢 投稿する'}
            </button>
          </div>
        </div>
      )}

      {/* 投稿一覧 */}
      <div style={{ marginTop:12 }}>
        {posts.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 24px', color:'var(--text2)' }}>
            <div style={{ fontSize:56, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:600, fontSize:16, color:'var(--text)', marginBottom:4 }}>お知らせはまだありません</div>
            <div style={{ fontSize:13 }}>新しいお知らせが届いたらここに表示されます</div>
          </div>
        ) : (
          posts.map((post) => {
            const liked        = isLiked(post);
            const showComments = expandedComments[post.id];
            return (
              <div key={post.id} style={{ background:'var(--surface)', borderBottom:'0.5px solid var(--border)', padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#06c755,#03a040)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                    📢
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:15 }}>LINE Killer</span>
                      <span style={{ fontSize:11, background:'#06c755', color:'white', borderRadius:10, padding:'1px 7px', fontWeight:600 }}>公式</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text2)' }}>{timeAgo(post.created_at)}</div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleDeletePost(post.id)}
                      style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:6, borderRadius:8 }}>🗑️</button>
                  )}
                </div>
                {post.content && (
                  <p style={{ fontSize:14, lineHeight:1.7, marginBottom:10, whiteSpace:'pre-wrap', color:'var(--text)' }}>{post.content}</p>
                )}
                {post.image && (
                  <img
                    src={post.image.startsWith('http') ? post.image : `${SERVER_URL}${post.image}`}
                    alt="post"
                    style={{ width:'100%', maxHeight:360, objectFit:'cover', borderRadius:12, marginBottom:10, display:'block' }}
                  />
                )}
                <div style={{ display:'flex', gap:10, paddingTop:8, borderTop:'0.5px solid var(--border)' }}>
                  <button onClick={() => handleLike(post.id)}
                    style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, color: liked ? '#e74c3c' : 'var(--text2)', padding:'5px 12px', borderRadius:20,
                      background: liked ? '#fde8e8' : 'var(--surface2)', border:'none', cursor:'pointer', fontWeight: liked ? 700 : 400 }}>
                    {liked ? '❤️' : '🤍'} {post.likes?.length || 0}
                  </button>
                  <button onClick={() => setExpandedComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
                    style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, color:'var(--text2)', padding:'5px 12px', borderRadius:20, background:'var(--surface2)', border:'none', cursor:'pointer' }}>
                    💬 {post.comments?.length || 0}件
                  </button>
                </div>
                {showComments && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid var(--border)' }}>
                    {post.comments?.map((c, i) => (
                      <div key={i} style={{ fontSize:13, padding:'5px 0', display:'flex', gap:8, alignItems:'flex-start' }}>
                        <span style={{ fontWeight:700, flexShrink:0, color:'var(--text)' }}>{c.username || '?'}</span>
                        <span style={{ color:'var(--text2)', lineHeight:1.5, flex:1 }}>{c.content}</span>
                        {c.user_id === currentUser?.id && (
                          <button onClick={async () => {
                            try {
                              await axios.delete(`/api/posts/${post.id}/comments/${c.id}`);
                              setPosts(prev => prev.map(p => p.id === post.id
                                ? { ...p, comments: p.comments.filter(cm => cm.id !== c.id) }
                                : p
                              ));
                            } catch {}
                          }} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:11, padding:'0 2px', flexShrink:0 }}>✕</button>
                        )}
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <input
                        style={{ flex:1, padding:'8px 14px', border:'1px solid var(--border)', borderRadius:22, background:'var(--bg)', color:'var(--text)', fontSize:13, outline:'none', fontFamily:'inherit' }}
                        placeholder="コメントを入力..."
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)}
                      />
                      <button
                        style={{ padding:'8px 16px', borderRadius:22, background:'#06c755', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}
                        onClick={() => handleComment(post.id)}>
                        送信
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
