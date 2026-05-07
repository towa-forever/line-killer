import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

export default function Voom({ currentUser, socket }) {
  const [posts, setPosts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [text, setText]               = useState('');
  const [mediaFile, setMediaFile]     = useState(null);
  const [mediaType, setMediaType]     = useState(null);
  const [preview, setPreview]         = useState(null);
  const [posting, setPosting]         = useState(false);
  const [postError, setPostError]     = useState('');
  const [commentInputs, setCommentInputs] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [repostModal, setRepostModal] = useState(null);
  const [repostComment, setRepostComment] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/voom');
      setPosts(Array.isArray(res.data) ? res.data : []);
    } catch(e) {
      setError('投稿の読み込みに失敗したで。再読み込みしてみてな。');
    } finally {
      setLoading(false);
    }
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

  const handleMedia = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { setPostError('画像か動画を選んでな'); return; }
    if (isVideo && file.size > 100 * 1024 * 1024) { setPostError('動画は100MB以内にしてな'); return; }
    if (isImage && file.size > 20 * 1024 * 1024) { setPostError('画像は20MB以内にしてな'); return; }
    setMediaFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    setPostError('');
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setMediaFile(null); setMediaType(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePost = useCallback(async () => {
    if (!text.trim() && !mediaFile) return;
    setPosting(true); setPostError(''); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('content', text.trim());
      if (mediaFile) {
        // video/imageフィールド名でサーバーに送る
        fd.append(mediaType === 'video' ? 'video' : 'image', mediaFile);
      }
      await axios.post('/api/voom', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round(e.loaded / e.total * 100));
        },
        timeout: 120000, // 動画は2分まで待つ
      });
      setText(''); clearMedia(); setUploadProgress(0);
    } catch(e) {
      setPostError(e.response?.data?.error || 'アップロードに失敗したで。動画は100MB以内・ネットを確認してな');
      setUploadProgress(0);
    } finally {
      setPosting(false);
    }
  }, [text, mediaFile, mediaType]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      await axios.post(`/api/voom/${postId}/comment`, { content });
      setCommentInputs(p => ({ ...p, [postId]: '' }));
    } catch(e) {}
  }, [commentInputs]);

  const avatar = (u, size = 40) => (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.45, overflow:'hidden', flexShrink:0 }}>
      {u?.avatar ? <img src={u.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (u?.display_name||u?.username||'?')[0]?.toUpperCase()}
    </div>
  );

  // ローディング中
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, flexDirection:'column', gap:12, color:'var(--text2)' }}>
      <div style={{ fontSize:32, animation:'spin 1s linear infinite', display:'inline-block' }}>⏳</div>
      <div>読み込み中...</div>
    </div>
  );

  // エラーで真っ白にならないように
  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, flexDirection:'column', gap:12, padding:24 }}>
      <div style={{ fontSize:40 }}>😵</div>
      <div style={{ color:'var(--text)', fontSize:15, fontWeight:600 }}>読み込みに失敗したで</div>
      <div style={{ color:'var(--text2)', fontSize:13, textAlign:'center' }}>{error}</div>
      <button onClick={fetchPosts} style={{ padding:'10px 24px', borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontSize:14, cursor:'pointer', fontWeight:600 }}>
        🔄 再読み込み
      </button>
    </div>
  );

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
            {avatar(currentUser)}
            <div style={{ flex:1 }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="いまどんな気分？"
                style={{ width:'100%', minHeight:64, border:'none', outline:'none', background:'transparent', color:'var(--text)', fontSize:15, resize:'none', fontFamily:'inherit' }}
              />
              {/* プレビュー */}
              {preview && (
                <div style={{ position:'relative', marginTop:8, display:'inline-block', maxWidth:'100%' }}>
                  {mediaType === 'video'
                    ? <video src={preview} controls style={{ maxWidth:'100%', maxHeight:240, borderRadius:10 }} />
                    : <img src={preview} alt="" style={{ maxWidth:'100%', maxHeight:240, borderRadius:10, objectFit:'cover' }} />
                  }
                  <button onClick={clearMedia} style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.65)', border:'none', color:'white', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                </div>
              )}
              {/* アップロード進捗バー */}
              {posting && uploadProgress > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ height:4, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', background:'var(--primary)', width:`${uploadProgress}%`, transition:'width 0.3s', borderRadius:4 }} />
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>{uploadProgress}% アップロード中...</div>
                </div>
              )}
              {postError && <div style={{ color:'#e53e3e', fontSize:12, marginTop:4 }}>{postError}</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                <div style={{ display:'flex', gap:8 }}>
                  <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={handleMedia} />
                  <button onClick={() => fileRef.current?.click()} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:20, padding:'4px 6px' }} title="画像・動画">📷</button>
                  <button onClick={() => { fileRef.current.accept='video/*'; fileRef.current?.click(); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:20, padding:'4px 6px' }} title="動画のみ">🎬</button>
                </div>
                <button
                  onClick={handlePost}
                  disabled={posting || (!text.trim() && !mediaFile)}
                  style={{ padding:'7px 20px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', opacity: posting || (!text.trim() && !mediaFile) ? 0.5 : 1 }}
                >
                  {posting ? (uploadProgress > 0 ? `${uploadProgress}%` : '投稿中...') : '投稿'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 投稿一覧 */}
        {posts.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>
            <div style={{ fontSize:40, marginBottom:8 }}>📭</div>
            <div>まだ投稿がないで！最初の投稿者になろう</div>
          </div>
        ) : posts.map(post => (
          <div key={post.id} style={{ borderBottom:'1px solid var(--border)', padding:'14px 16px', background:'var(--surface)' }}>
            {post.repost_of && (
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>🔁 {post.display_name || post.username} がリポスト</div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              {avatar({ avatar: post.avatar, display_name: post.display_name, username: post.username })}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>{post.display_name || post.username}</span>
                    <span style={{ fontSize:12, color:'var(--text2)' }}>@{post.username}</span>
                    <span style={{ fontSize:11, color:'var(--text2)' }}>{new Date(post.created_at).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                  </div>
                  {(post.user_id === currentUser?.id) && (
                    <button onClick={() => handleDelete(post.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:16, padding:4 }}>🗑️</button>
                  )}
                </div>
                {post.content && <div style={{ fontSize:15, lineHeight:1.6, marginBottom:8, wordBreak:'break-word' }}>{post.content}</div>}
                {/* 画像 */}
                {post.image && (
                  <img src={post.image} alt="" style={{ maxWidth:'100%', maxHeight:320, borderRadius:10, marginBottom:8, objectFit:'cover', display:'block' }}
                    onError={e => { e.target.style.display='none'; }} />
                )}
                {/* 動画 */}
                {post.video && (
                  <video src={post.video} controls style={{ maxWidth:'100%', maxHeight:320, borderRadius:10, marginBottom:8, display:'block' }}
                    onError={e => { e.target.parentElement.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:8px">動画の読み込みに失敗したで</div>'; }} />
                )}
                {/* リポスト元 */}
                {post.repost_user && (
                  <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:10, marginBottom:8, background:'var(--surface2)' }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{post.repost_user.display_name || post.repost_user.username}</div>
                    {post.repost_content && <div style={{ fontSize:14, color:'var(--text2)' }}>{post.repost_content}</div>}
                  </div>
                )}
                {/* アクションバー */}
                <div style={{ display:'flex', gap:20, marginTop:4 }}>
                  <button onClick={() => handleLike(post.id)} style={{ background:'none', border:'none', cursor:'pointer', color: (post.likes||[]).includes(currentUser?.id) ? '#e0245e' : 'var(--text2)', fontSize:13, padding:0, display:'flex', alignItems:'center', gap:4 }}>
                    {(post.likes||[]).includes(currentUser?.id) ? '❤️' : '🤍'} {(post.likes||[]).length}
                  </button>
                  <button onClick={() => setRepostModal(post)} style={{ background:'none', border:'none', cursor:'pointer', color: (post.reposts||[]).includes(currentUser?.id) ? 'var(--primary)' : 'var(--text2)', fontSize:13, padding:0, display:'flex', alignItems:'center', gap:4 }}>
                    🔁 {(post.reposts||[]).length}
                  </button>
                  <button onClick={() => setExpandedComments(p => ({ ...p, [post.id]: !p[post.id] }))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:13, padding:0, display:'flex', alignItems:'center', gap:4 }}>
                    💬 {(post.comments||[]).length}
                  </button>
                </div>
                {/* コメント */}
                {expandedComments[post.id] && (
                  <div style={{ marginTop:10 }}>
                    {(post.comments||[]).map(c => (
                      <div key={c.id} style={{ display:'flex', gap:8, marginBottom:8 }}>
                        {avatar({ avatar: c.avatar, display_name: c.display_name, username: c.username }, 28)}
                        <div style={{ background:'var(--surface2)', borderRadius:10, padding:'6px 10px', flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:12, marginBottom:2 }}>{c.display_name || c.username}</div>
                          <div style={{ fontSize:14 }}>{c.content}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <input value={commentInputs[post.id]||''} onChange={e => setCommentInputs(p => ({ ...p, [post.id]: e.target.value }))}
                        onKeyDown={e => e.key==='Enter' && handleComment(post.id)}
                        placeholder="コメントを入力..." className="form-input" style={{ flex:1, fontSize:13, padding:'8px 12px' }} />
                      <button onClick={() => handleComment(post.id)} style={{ padding:'8px 12px', borderRadius:10, background:'var(--primary)', color:'white', border:'none', fontSize:13, cursor:'pointer' }}>送信</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* リポストモーダル */}
      {repostModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--surface)', width:'100%', borderRadius:'20px 20px 0 0', padding:20, paddingBottom:'calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:12 }}>🔁 リポスト</div>
            <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:12, marginBottom:12, background:'var(--surface2)', fontSize:14, color:'var(--text2)' }}>
              {repostModal.content || '（メディア投稿）'}
            </div>
            <textarea value={repostComment} onChange={e => setRepostComment(e.target.value)}
              placeholder="コメントを追加（任意）" style={{ width:'100%', minHeight:60, padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, resize:'none', marginBottom:12, fontFamily:'inherit', boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setRepostModal(null)} style={{ flex:1, padding:'10px 0', borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={handleRepost} style={{ flex:1, padding:'10px 0', borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>リポスト</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
