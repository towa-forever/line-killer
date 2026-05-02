import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function Voom({ currentUser, socket }) {
  const [posts, setPosts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [text, setText]               = useState('');
  const [image, setImage]             = useState(null);
  const [preview, setPreview]         = useState(null);
  const [posting, setPosting]         = useState(false);
  const [error, setError]             = useState('');
  const [commentInputs, setCommentInputs] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [repostModal, setRepostModal] = useState(null); // { post }
  const [repostComment, setRepostComment] = useState('');
  const fileRef = useRef(null);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await axios.get('/api/voom');
      setPosts(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    if (!socket) return;
    const onNew      = (p) => setPosts(prev => [p, ...prev]);
    const onLiked    = ({ postId, likes }) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes } : p));
    const onReposted = ({ postId, userId }) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, reposts: [...(p.reposts||[]), userId] } : p));
    const onUnrepost = ({ postId, userId }) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, reposts: (p.reposts||[]).filter(id => id !== userId) } : p));
    const onDeleted  = ({ postId }) => setPosts(prev => prev.filter(p => p.id !== postId));
    socket.on('voom:new', onNew);
    socket.on('voom:liked', onLiked);
    socket.on('voom:reposted', onReposted);
    socket.on('voom:unreposted', onUnrepost);
    socket.on('voom:deleted', onDeleted);
    return () => {
      socket.off('voom:new', onNew);
      socket.off('voom:liked', onLiked);
      socket.off('voom:reposted', onReposted);
      socket.off('voom:unreposted', onUnrepost);
      socket.off('voom:deleted', onDeleted);
    };
  }, [socket]);

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePost = useCallback(async () => {
    if (!text.trim() && !image) return;
    setPosting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('content', text);
      if (image) fd.append('image', image);
      await axios.post('/api/voom', fd);
      setText(''); setImage(null); setPreview(null);
    } catch (e) { setError(e.response?.data?.error || '投稿に失敗しました'); }
    finally { setPosting(false); }
  }, [text, image]);

  const handleLike = useCallback(async (postId) => {
    await axios.post(`/api/voom/${postId}/like`).catch(() => {});
  }, []);

  const handleRepost = useCallback(async () => {
    if (!repostModal) return;
    await axios.post(`/api/voom/${repostModal.id}/repost`, { comment: repostComment }).catch(() => {});
    setRepostModal(null); setRepostComment('');
  }, [repostModal, repostComment]);

  const handleDelete = useCallback(async (postId) => {
    if (!window.confirm('削除しますか？')) return;
    await axios.delete(`/api/voom/${postId}`).catch(() => {});
  }, []);

  const handleComment = useCallback(async (postId) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    await axios.post(`/api/posts/${postId}/comments`, { content }).catch(() => {});
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    fetchPosts();
  }, [commentInputs, fetchPosts]);

  const avatarUrl = (av) => av ? (av.startsWith('http') ? av : `${SERVER_URL}${av}`) : null;

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--text2)' }}>読み込み中...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)' }}>
      {/* ヘッダー */}
      <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', background:'var(--surface)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ fontWeight:700, fontSize:18 }}>VOOM</div>
        <div style={{ fontSize:12, color:'var(--text2)' }}>みんなの投稿</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 0 80px' }}>
        {/* 投稿フォーム */}
        <div style={{ padding:16, borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, overflow:'hidden', flexShrink:0 }}>
              {currentUser?.avatar ? <img src={avatarUrl(currentUser.avatar)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (currentUser?.displayName?.[0] || '?')}
            </div>
            <div style={{ flex:1 }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="今何してる？"
                style={{ width:'100%', minHeight:72, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, resize:'none', boxSizing:'border-box', outline:'none' }}
              />
              {preview && (
                <div style={{ position:'relative', marginTop:8, display:'inline-block' }}>
                  <img src={preview} alt="" style={{ maxWidth:200, maxHeight:150, borderRadius:10, objectFit:'cover' }} />
                  <button onClick={() => { setImage(null); setPreview(null); }} style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', border:'none', color:'white', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:12 }}>✕</button>
                </div>
              )}
              {error && <div style={{ color:'var(--danger)', fontSize:12, marginTop:4 }}>{error}</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                <button onClick={() => fileRef.current?.click()} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--text2)' }}>🖼️</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImage} />
                <button onClick={handlePost} disabled={posting || (!text.trim() && !image)}
                  style={{ padding:'7px 20px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', opacity: posting || (!text.trim() && !image) ? 0.5 : 1 }}>
                  {posting ? '投稿中...' : '投稿'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 投稿一覧 */}
        {posts.length === 0 && (
          <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>まだ投稿がないで。最初に投稿してみよう！</div>
        )}
        {posts.map(post => {
          const isLiked     = post.likes?.includes(currentUser?.id);
          const isReposted  = post.reposts?.includes(currentUser?.id);
          const isMine      = post.user_id === currentUser?.id;
          const showComments = expandedComments[post.id];
          return (
            <div key={post.id} style={{ borderBottom:'1px solid var(--border)', padding:'14px 16px', background:'var(--surface)' }}>
              {/* リポストバナー */}
              {post.repost_of && (
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>🔁 {post.display_name || post.username} がリポスト</div>
              )}
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, overflow:'hidden', flexShrink:0 }}>
                  {(post.repost_of ? post.repost_user?.avatar : post.avatar)
                    ? <img src={avatarUrl(post.repost_of ? post.repost_user?.avatar : post.avatar)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : ((post.repost_of ? post.repost_user?.display_name : post.display_name)?.[0] || '?')}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:15 }}>{post.repost_of ? post.repost_user?.display_name || post.repost_user?.username : post.display_name || post.username}</span>
                      <span style={{ fontSize:12, color:'var(--text2)' }}>{new Date(post.created_at).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                    </div>
                    {isMine && <button onClick={() => handleDelete(post.id)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:18 }}>⋯</button>}
                  </div>
                  {post.content && <div style={{ fontSize:15, lineHeight:1.6, marginBottom:8, wordBreak:'break-word' }}>{post.content}</div>}
                  {post.image && <img src={post.image.startsWith('http') ? post.image : `${SERVER_URL}${post.image}`} alt="" style={{ maxWidth:'100%', borderRadius:12, marginBottom:8, maxHeight:300, objectFit:'cover' }} />}

                  {/* リポスト元の内容 */}
                  {post.repost_of && post.repost_user && (
                    <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:10, marginBottom:8, background:'var(--surface2)' }}>
                      <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{post.repost_user.display_name || post.repost_user.username}</div>
                      <div style={{ fontSize:14, color:'var(--text2)' }}>リポスト元の投稿</div>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div style={{ display:'flex', gap:20, marginTop:4 }}>
                    <button onClick={() => handleLike(post.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:14, color: isLiked ? '#e0245e' : 'var(--text2)', fontWeight: isLiked ? 700 : 400 }}>
                      {isLiked ? '❤️' : '🤍'} {post.likes?.length || 0}
                    </button>
                    <button onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                      style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:14, color:'var(--text2)' }}>
                      💬 {post.comments?.length || 0}
                    </button>
                    <button onClick={() => setRepostModal(post)}
                      style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:14, color: isReposted ? 'var(--primary)' : 'var(--text2)', fontWeight: isReposted ? 700 : 400 }}>
                      🔁 {post.reposts?.length || 0}
                    </button>
                  </div>

                  {/* コメント欄 */}
                  {showComments && (
                    <div style={{ marginTop:10 }}>
                      {post.comments?.map(c => (
                        <div key={c.id} style={{ display:'flex', gap:8, marginBottom:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, overflow:'hidden', flexShrink:0 }}>
                            {c.avatar ? <img src={avatarUrl(c.avatar)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : c.display_name?.[0] || c.username?.[0]}
                          </div>
                          <div style={{ background:'var(--surface2)', borderRadius:10, padding:'6px 10px', flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:12, marginBottom:2 }}>{c.display_name || c.username}</div>
                            <div style={{ fontSize:14 }}>{c.content}</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ display:'flex', gap:8, marginTop:8 }}>
                        <input value={commentInputs[post.id] || ''} onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                          placeholder="コメントを書く..." style={{ flex:1, padding:'6px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, outline:'none' }} />
                        <button onClick={() => handleComment(post.id)} style={{ padding:'6px 12px', borderRadius:10, background:'var(--primary)', color:'white', border:'none', fontSize:13, cursor:'pointer' }}>送信</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* リポストモーダル */}
      {repostModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--surface)', width:'100%', borderRadius:'20px 20px 0 0', padding:20 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:12 }}>🔁 リポスト</div>
            <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:12, marginBottom:12, background:'var(--surface2)', fontSize:14, color:'var(--text2)' }}>
              <b>{repostModal.display_name || repostModal.username}</b>: {repostModal.content?.slice(0, 80)}{repostModal.content?.length > 80 ? '...' : ''}
            </div>
            <textarea value={repostComment} onChange={e => setRepostComment(e.target.value)}
              placeholder="コメントを追加（任意）" style={{ width:'100%', minHeight:60, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, resize:'none', boxSizing:'border-box', outline:'none', marginBottom:12 }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setRepostModal(null); setRepostComment(''); }}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'none', color:'var(--text)', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={handleRepost}
                style={{ flex:1, padding:'10px 0', borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>リポスト</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
