import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function Friends({ currentUser, socket, onClearNotif, onStartChat }) {
  const [tab, setTab]               = useState('list');
  const [friends, setFriends]       = useState([]);
  const [requests, setRequests]     = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [message, setMessage]       = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [addIdInput, setAddIdInput] = useState('');
  const qrInputRef = useRef(null);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await axios.get('/api/friends');
      setFriends(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error(err); }
  }, []);

  const fetchRequests = useCallback(async () => {
    try { const res = await axios.get('/api/friend-requests'); setRequests(res.data); } catch {}
  }, []);

  const fetchOnline = useCallback(async () => {
    try { const res = await axios.get('/api/users/online'); setOnlineUsers(res.data || []); } catch {}
  }, []);

  useEffect(() => {
    fetchFriends(); fetchRequests(); fetchOnline();
    if (onClearNotif) onClearNotif();
  }, [fetchFriends, fetchRequests, fetchOnline, onClearNotif]);

  useEffect(() => {
    if (!socket) return;
    const onReq  = () => { fetchRequests(); };
    const onOnline = ({ userId }) => setOnlineUsers(p => [...new Set([...p, userId])]);
    const onOffline = ({ userId }) => setOnlineUsers(p => p.filter(id => id !== userId));
    socket.on('friend:request', onReq);
    socket.on('user:online',  onOnline);
    socket.on('user:offline', onOffline);
    return () => { socket.off('friend:request', onReq); socket.off('user:online', onOnline); socket.off('user:offline', onOffline); };
  }, [socket, fetchRequests]);

  const handleSearch = async () => {
    const q = searchQuery.trim() || addIdInput.trim();
    if (!q) return;
    setSearching(true); setSearchResults([]);
    try {
      const res = await axios.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data.filter(u => u.id !== currentUser.id));
    } catch { setMessage('検索に失敗しました'); }
    finally { setSearching(false); }
  };

  const sendRequest = async (userId) => {
    try {
      await axios.post('/api/friend-requests', { toId: userId });
      setMessage('友達申請を送りました！');
      setSearchResults(p => p.map(u => (u.id === userId || u._id === userId) ? { ...u, requested: true } : u));
    } catch (err) { setMessage(err.response?.data?.message || '申請に失敗しました'); }
  };

  const acceptRequest = async (requestId) => {
    try {
      await axios.post(`/api/friend-requests/${requestId}/accept`);
      setMessage('友達になりました！🎉'); fetchRequests(); fetchFriends();
    } catch {}
  };

  const rejectRequest = async (requestId) => {
    try { await axios.post(`/api/friend-requests/${requestId}/reject`); fetchRequests(); } catch {}
  };

  const removeFriend = (friendId) => {
    setConfirmDialog({ text: 'この友達を削除しますか？', onOk: async () => {
      try { await axios.delete(`/api/friends/${friendId}`); fetchFriends(); } catch {}
    }});
  };

  const handleQrScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMessage('QRコードを読み取り中...');
    try {
      const username = window.prompt('QRコードのユーザー名を入力してください（@なし）:');
      if (!username) { setMessage(''); return; }
      const res = await axios.post('/api/friends/by-qr', { username: username.trim() });
      setMessage(res.data.message || '友達申請を送りました！');
    } catch (err) { setMessage(err.response?.data?.error || '失敗しました'); }
    e.target.value = '';
  };

  const isFriend = (userId) => friends.some(f => String(f.id || f._id) === String(userId));
  const isOnline = (userId) => onlineUsers.includes(userId);

  const avatarUrl = (user) => {
    if (!user?.avatar) return null;
    return user.avatar.startsWith('http') ? user.avatar : `${SERVER_URL}${user.avatar}`;
  };

  const Avatar = ({ user, size = 52 }) => {
    const src = avatarUrl(user);
    const name = user?.display_name || user?.username || user?.from_name || '?';
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {src
          ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#06c755,#03a040)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700 }}>
              {name[0]?.toUpperCase()}
            </div>
        }
        {isOnline(user?.id) && (
          <div style={{ position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: '50%', background: '#06c755', border: '2px solid var(--surface)' }} />
        )}
      </div>
    );
  };

  // 友達をオンライン/オフラインで分けてアルファベット順
  const onlineFriends  = friends.filter(f => isOnline(f.id));
  const offlineFriends = friends.filter(f => !isOnline(f.id));

  const TABS = [
    { id: 'list',     icon: '👥', label: '友達',   badge: 0 },
    { id: 'requests', icon: '📩', label: '申請',   badge: requests.length },
    { id: 'add',      icon: '➕', label: '追加',   badge: 0 },
    { id: 'qr',       icon: '📷', label: 'QR',     badge: 0 },
  ];

  return (
    <div className="page" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      {/* 確認ダイアログ */}
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, textAlign:'center', marginBottom:20 }}>{confirmDialog.text}</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>削除</button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ background:'#06c755', color:'white', padding:'14px 16px 0', paddingTop:'calc(14px + env(safe-area-inset-top))' }}>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:12 }}>友達</div>
        {/* タブ */}
        <div style={{ display:'flex', gap:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex:1, padding:'8px 0 10px', background:'none', border:'none', color: tab===t.id ? 'white' : 'rgba(255,255,255,0.7)', fontSize:11, fontWeight: tab===t.id ? 700 : 400, cursor:'pointer', position:'relative',
                borderBottom: tab===t.id ? '3px solid white' : '3px solid transparent' }}>
              <div style={{ fontSize:18, marginBottom:2 }}>{t.icon}</div>
              {t.label}
              {t.badge > 0 && (
                <span style={{ position:'absolute', top:4, right:'50%', transform:'translateX(10px)', background:'#e74c3c', color:'white', borderRadius:10, padding:'1px 5px', fontSize:9, fontWeight:700 }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* メッセージ */}
      {message && (
        <div onClick={() => setMessage('')}
          style={{ background:'#e8f5e9', color:'#2e7d32', padding:'10px 16px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #c8e6c9' }}>
          {message} ✕
        </div>
      )}

      {/* ===== 友達一覧 ===== */}
      {tab === 'list' && (
        <div>
          {friends.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text2)' }}>
              <div style={{ fontSize:56, marginBottom:12 }}>👥</div>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>友達がいません</div>
              <div style={{ fontSize:13, marginBottom:20 }}>「追加」タブから友達を探そう！</div>
              <button onClick={() => setTab('add')} style={{ padding:'10px 28px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                ➕ 友達を追加する
              </button>
            </div>
          ) : (
            <>
              {/* オンライン中 */}
              {onlineFriends.length > 0 && (
                <>
                  <div style={{ padding:'10px 16px 6px', fontSize:12, color:'var(--text2)', fontWeight:600, background:'var(--bg)', letterSpacing:0.5 }}>
                    🟢 オンライン ({onlineFriends.length})
                  </div>
                  {onlineFriends.map(f => (
                    <FriendRow key={f.id||f._id} friend={f} Avatar={Avatar} onChat={() => onStartChat?.(f)} onRemove={() => removeFriend(f.id||f._id)} />
                  ))}
                </>
              )}
              {/* オフライン */}
              {offlineFriends.length > 0 && (
                <>
                  <div style={{ padding:'10px 16px 6px', fontSize:12, color:'var(--text2)', fontWeight:600, background:'var(--bg)', letterSpacing:0.5 }}>
                    ⚫ 友達 ({offlineFriends.length})
                  </div>
                  {offlineFriends.map(f => (
                    <FriendRow key={f.id||f._id} friend={f} Avatar={Avatar} onChat={() => onStartChat?.(f)} onRemove={() => removeFriend(f.id||f._id)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== 申請 ===== */}
      {tab === 'requests' && (
        <div>
          {requests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text2)' }}>
              <div style={{ fontSize:48, marginBottom:8 }}>📩</div>
              <div style={{ fontSize:14 }}>友達申請はありません</div>
            </div>
          ) : requests.map(req => (
            <div key={req.id||req._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, flexShrink:0 }}>
                {req.from_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{req.from_name}</div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>@{req.from_name} から友達申請が届いています</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => rejectRequest(req.id||req._id)}
                  style={{ padding:'7px 14px', borderRadius:20, background:'var(--surface2)', border:'1px solid var(--border)', fontSize:13, cursor:'pointer' }}>拒否</button>
                <button onClick={() => acceptRequest(req.id||req._id)}
                  style={{ padding:'7px 16px', borderRadius:20, background:'#06c755', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>承認</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 友達追加 ===== */}
      {tab === 'add' && (
        <div>
          {/* ID検索 */}
          <div style={{ padding:16, background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:10 }}>🔍 ID・名前で検索</div>
            <div style={{ display:'flex', gap:8 }}>
              <input className="form-input" style={{ flex:1, marginBottom:0 }}
                placeholder="ユーザーIDまたは名前を入力"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} disabled={searching}
                style={{ padding:'0 18px', borderRadius:12, background:'#06c755', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {searching ? '...' : '検索'}
              </button>
            </div>
          </div>

          {/* 検索結果 */}
          {searchResults.length > 0 && (
            <div>
              {searchResults.map(user => (
                <div key={user.id||user._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                  <Avatar user={user} size={52} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{user.display_name || user.username}</div>
                    <div style={{ fontSize:12, color:'var(--text2)' }}>@{user.username}</div>
                  </div>
                  {isFriend(user.id||user._id)
                    ? <span style={{ fontSize:13, color:'#06c755', fontWeight:700, padding:'7px 14px' }}>✓ 友達</span>
                    : user.requested
                      ? <span style={{ fontSize:13, color:'var(--text2)', padding:'7px 14px' }}>申請済み</span>
                      : <button onClick={() => sendRequest(user.id||user._id)}
                          style={{ padding:'7px 18px', borderRadius:20, background:'#06c755', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                          追加
                        </button>
                  }
                </div>
              ))}
            </div>
          )}

          {/* 招待リンク */}
          <div style={{ padding:16, margin:'12px 12px 0', background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>🔗 招待リンクをシェア</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:10 }}>リンクを送って友達に追加してもらおう</div>
            <button onClick={() => {
              const url = `${window.location.origin}/invite/user/${currentUser.username}`;
              navigator.clipboard.writeText(url);
              setMessage('リンクをコピーしました！');
            }} style={{ width:'100%', padding:'10px 0', borderRadius:12, background:'var(--surface2)', border:'1px solid var(--border)', fontSize:14, cursor:'pointer' }}>
              📋 マイリンクをコピー
            </button>
          </div>
        </div>
      )}

      {/* ===== QRコード ===== */}
      {tab === 'qr' && (
        <div style={{ padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:20, textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>マイQRコード</div>
            <div style={{ display:'inline-block', padding:16, background:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
              <QRCode value={`linekiller://add/${currentUser.username}`} size={180} level="H" />
            </div>
            <div style={{ marginTop:12, fontSize:14, fontWeight:600 }}>{currentUser.displayName || currentUser.username}</div>
            <div style={{ fontSize:13, color:'var(--text2)' }}>@{currentUser.username}</div>
          </div>

          <div style={{ background:'var(--surface)', borderRadius:16, padding:20, textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>QRコードを読み取る</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>友達のQRコードを読み取って友達追加</div>
            <button onClick={() => qrInputRef.current?.click()}
              style={{ width:'100%', padding:'12px 0', borderRadius:12, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
              📷 カメラで読み取る
            </button>
            <input ref={qrInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleQrScan} />
          </div>
        </div>
      )}
    </div>
  );
}

function FriendRow({ friend, Avatar, onChat, onRemove }) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'0.5px solid var(--border)', background:'var(--surface)', position:'relative' }}
      onClick={onChat}>
      <Avatar user={friend} size={52} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:2 }}>{friend.display_name || friend.username}</div>
        <div style={{ fontSize:12, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {friend.status || `@${friend.username}`}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); setShowMenu(m => !m); }}
        style={{ padding:'6px 10px', background:'none', border:'none', fontSize:18, color:'var(--text2)', cursor:'pointer', flexShrink:0 }}>
        ⋯
      </button>
      {showMenu && (
        <div style={{ position:'absolute', right:12, top:50, background:'var(--surface)', borderRadius:12, boxShadow:'0 4px 16px rgba(0,0,0,0.15)', zIndex:100, minWidth:140, overflow:'hidden' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { onChat(); setShowMenu(false); }}
            style={{ display:'block', width:'100%', padding:'12px 16px', textAlign:'left', background:'none', border:'none', fontSize:14, cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
            💬 トークする
          </button>
          <button onClick={() => { onRemove(); setShowMenu(false); }}
            style={{ display:'block', width:'100%', padding:'12px 16px', textAlign:'left', background:'none', border:'none', fontSize:14, color:'var(--danger)', cursor:'pointer' }}>
            🗑️ 友達を削除
          </button>
        </div>
      )}
    </div>
  );
}
