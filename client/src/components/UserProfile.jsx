import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://wakkachat.onrender.com';

export default function UserProfile({ username, currentUser, onClose, onStartChat, onCall, onVoiceCall }) {
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/users/${username}/profile`)
      .then(r => setUser(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  const avatarSrc  = user?.avatar ? (user.avatar.startsWith('http') ? user.avatar : `${SERVER_URL}${user.avatar}`) : null;
  const coverSrc   = user?.coverImage ? (user.coverImage.startsWith('http') ? user.coverImage : `${SERVER_URL}${user.coverImage}`) : null;
  const isSelf = user?.username === currentUser?.username;

  const lastSeenText = useCallback((date) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date);
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `${day}日前にオンライン`;
    if (hr > 0) return `${hr}時間前にオンライン`;
    if (min > 0) return `${min}分前にオンライン`;
    return 'さっきオンライン';
  }, []);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* 背景画像 */}
        <div style={{ position:'relative', height:120, background: coverSrc ? 'transparent' : 'linear-gradient(135deg,var(--primary),#6c3483)', overflow:'hidden', borderRadius:'20px 20px 0 0' }}>
          {coverSrc && <img src={coverSrc} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
          <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,0.4)', border:'none', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* アバター */}
        <div style={{ padding:'0 20px 20px', textAlign:'center' }}>
          <div style={{ position:'relative', display:'inline-block', marginTop:-45, marginBottom:10 }}>
            {avatarSrc
              ? <img src={avatarSrc} alt="" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--surface)' }} />
              : <div style={{ width:80, height:80, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, fontWeight:700, border:'3px solid var(--surface)', margin:'0 auto' }}>{user?.displayName?.[0] || '?'}</div>
            }
            {/* オンライン状態 */}
            {user?.showOnline && (
              <div style={{ position:'absolute', bottom:4, right:4, width:18, height:18, borderRadius:'50%', background: user?.isOnline ? '#06c755' : '#aaa', border:'2px solid var(--surface)' }} />
            )}
          </div>

          {loading ? (
            <div style={{ color:'var(--text2)', fontSize:14 }}>読み込み中...</div>
          ) : user ? (
            <>
              <div style={{ fontSize:20, fontWeight:800, marginBottom:2 }}>{user.displayName}</div>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>@{user.username}</div>

              {/* オンライン状態 */}
              {user.showOnline && (
                <div style={{ fontSize:12, color: user.isOnline ? '#06c755' : 'var(--text2)', marginBottom:8, fontWeight: user.isOnline ? 700 : 400 }}>
                  {user.isOnline ? '● オンライン' : lastSeenText(user.lastSeen)}
                </div>
              )}

              {/* ステータス */}
              {user.status && (
                <div style={{ fontSize:13, color:'var(--text2)', background:'var(--surface2)', borderRadius:20, padding:'4px 14px', display:'inline-block', marginBottom:10 }}>
                  {user.status}
                </div>
              )}

              {/* 自己紹介 */}
              {user.bio && <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:16 }}>{user.bio}</div>}

              {/* ボタン（自分以外） */}
              {!isSelf && (
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  <button onClick={() => onStartChat(user)} className="btn btn-primary" style={{ flex:1, maxWidth:140 }}>
                    💬 トーク
                  </button>
                  <button onClick={() => onVoiceCall?.(user)} className="btn btn-secondary" style={{ flex:1, maxWidth:140 }}>
                    📞 音声通話
                  </button>
                  <button onClick={() => onCall?.(user)} className="btn btn-secondary" style={{ flex:1, maxWidth:140 }}>
                    📹 ビデオ
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ color:'var(--text2)', fontSize:14 }}>ユーザーが見つかりません</div>
          )}
        </div>
      </div>
    </div>
  );
}
