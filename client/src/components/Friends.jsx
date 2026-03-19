import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function Friends({ currentUser, socket, onClearNotif, onStartChat }) {
  const [tab, setTab]                 = useState('list');
  const [friends, setFriends]         = useState([]);
  const [requests, setRequests]       = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]     = useState(false);
  const [message, setMessage]         = useState('');
  const [messageType, setMessageType] = useState('success'); // success | error
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const qrInputRef = useRef(null);

  const showMsg = (text, type = 'success') => { setMessage(text); setMessageType(type); setTimeout(() => setMessage(''), 3000); };

  const fetchFriends  = useCallback(async () => {
    try { const r = await axios.get('/api/friends'); setFriends(Array.isArray(r.data) ? r.data : []); }
    catch { setFriends(prev => prev); /* エラー時は現状維持 */ }
  }, []);
  const fetchRequests = useCallback(async () => { try { const r = await axios.get('/api/friend-requests'); setRequests(Array.isArray(r.data) ? r.data : []); } catch {} }, []);
  const fetchOnline   = useCallback(async () => { try { const r = await axios.get('/api/users/online'); setOnlineUsers(r.data || []); } catch {} }, []);

  useEffect(() => {
    fetchFriends(); fetchRequests(); fetchOnline();
    if (onClearNotif) onClearNotif();
    const timer = setInterval(() => { fetchFriends(); fetchOnline(); }, 30000);
    return () => clearInterval(timer);
  }, [fetchFriends, fetchRequests, fetchOnline, onClearNotif]);

  useEffect(() => {
    if (!socket) return;
    const onReq     = () => fetchRequests();
    const onOnline  = ({ userId }) => setOnlineUsers(p => [...new Set([...p, userId])]);
    const onOffline = ({ userId }) => setOnlineUsers(p => p.filter(id => id !== userId));
    socket.on('friend:request', onReq);
    socket.on('user:online',    onOnline);
    socket.on('user:offline',   onOffline);
    return () => { socket.off('friend:request', onReq); socket.off('user:online', onOnline); socket.off('user:offline', onOffline); };
  }, [socket, fetchRequests]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true); setSearchResults([]);
    try {
      const res = await axios.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data.filter(u => u.id !== currentUser.id));
      if (res.data.filter(u => u.id !== currentUser.id).length === 0) showMsg('ユーザーが見つかりませんでした', 'error');
    } catch { showMsg('検索に失敗しました', 'error'); }
    finally { setSearching(false); }
  };

  const sendRequest = async (userId) => {
    try {
      await axios.post('/api/friend-requests', { toId: userId });
      showMsg('友達申請を送りました！');
      setSearchResults(p => p.map(u => (u.id === userId || u._id === userId) ? { ...u, requested: true } : u));
    } catch (err) { showMsg(err.response?.data?.message || '申請に失敗しました', 'error'); }
  };

  const acceptRequest = async (requestId) => {
    try {
      await axios.post(`/api/friend-requests/${requestId}/accept`);
      showMsg('友達になりました！🎉');
      fetchRequests();
      fetchFriends();
      setTimeout(() => setTab('list'), 1000); // 1秒後に友達タブに移動
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
    // jsQR でQRコードを読み取る
    try {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        // jsQRが利用可能か確認
        if (window.jsQR) {
          const code = window.jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            const match = code.data.match(/linekiller:\/\/add\/(.+)/);
            const username = match ? match[1] : code.data;
            try {
              const res = await axios.post('/api/friends/by-qr', { username: username.trim() });
              showMsg(res.data.message || '友達申請を送りました！');
            } catch (err) { showMsg(err.response?.data?.error || '失敗しました', 'error'); }
          } else { showMsg('QRコードが読み取れませんでした', 'error'); }
        } else {
          // フォールバック: ユーザー名を手動入力
          const username = window.prompt('友達のID（@なし）を入力してください:');
          if (username?.trim()) {
            try {
              const res = await axios.post('/api/friends/by-qr', { username: username.trim() });
              showMsg(res.data.message || '友達申請を送りました！');
            } catch (err) { showMsg(err.response?.data?.error || '失敗しました', 'error'); }
          }
        }
      };
      img.src = URL.createObjectURL(file);
    } catch { showMsg('読み取りに失敗しました', 'error'); }
    e.target.value = '';
  };

  const isFriend  = (userId) => friends.some(f => String(f.id || f._id) === String(userId));
  const isOnline  = (userId) => onlineUsers.includes(userId);
  const avatarUrl = (user)   => {
    if (!user?.avatar) return null;
    return user.avatar.startsWith('http') ? user.avatar : `${SERVER_URL}${user.avatar}`;
  };

  const Avatar = ({ user, size = 52 }) => {
    const src  = avatarUrl(user);
    const name = user?.display_name || user?.username || '?';
    return (
      <div style={{ position:'relative', flexShrink:0 }}>
        {src
          ? <img src={src} alt="" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover' }} />
          : <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.38, fontWeight:700 }}>
              {name[0]?.toUpperCase()}
            </div>
        }
        {isOnline(user?.id) && (
          <div style={{ position:'absolute', bottom:1, right:1, width:13, height:13, borderRadius:'50%', background:'#06c755', border:'2px solid var(--surface)' }} />
        )}
      </div>
    );
  };

  const onlineFriends  = friends.filter(f => isOnline(f.id));
  const offlineFriends = friends.filter(f => !isOnline(f.id));

  const TABS = [
    { id:'list',     icon:'👥', label:'友達',   badge:0 },
    { id:'requests', icon:'📩', label:'申請',   badge:requests.length },
    { id:'add',      icon:'➕', label:'追加',   badge:0 },
    { id:'qr',       icon:'📷', label:'QRコード', badge:0 },
  ];

  return (
    <div className="page" style={{ overflowY:'auto', paddingBottom:80, background:'var(--bg)' }}>

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

      {/* ヘッダー + タブ */}
      <div style={{ background:'#06c755', color:'white', paddingTop:'calc(14px + env(safe-area-inset-top))' }}>
        <div className="friends-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}><span>友達</span></div>
        <div style={{ display:'flex' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'list') fetchFriends(); if (t.id === 'requests') fetchRequests(); }}
              style={{ flex:1, padding:'8px 0 10px', background:'none', border:'none', color: tab===t.id ? 'white' : 'rgba(255,255,255,0.65)', fontSize:11, fontWeight: tab===t.id ? 700 : 400, cursor:'pointer', position:'relative',
                borderBottom: tab===t.id ? '2.5px solid white' : '2.5px solid transparent', transition:'all 0.15s' }}>
              <div style={{ fontSize:20, marginBottom:2 }}>{t.icon}</div>
              {t.label}
              {t.badge > 0 && (
                <span style={{ position:'absolute', top:4, right:'50%', transform:'translateX(12px)', background:'#e74c3c', color:'white', borderRadius:10, padding:'1px 5px', fontSize:9, fontWeight:700 }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* トースト通知 */}
      {message && (
        <div style={{ background: messageType==='error' ? '#fff0f0' : '#e8f5e9', color: messageType==='error' ? '#c0392b' : '#2e7d32',
          padding:'10px 16px', fontSize:13, borderBottom:`1px solid ${messageType==='error' ? '#ffcdd2' : '#c8e6c9'}`,
          display:'flex', alignItems:'center', gap:8 }}>
          <span>{messageType==='error' ? '⚠️' : '✅'}</span>
          <span style={{ flex:1 }}>{message}</span>
          <button onClick={() => setMessage('')} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'inherit', opacity:0.6 }}>✕</button>
        </div>
      )}

      {/* ===== 友達一覧 ===== */}
      {tab === 'list' && (
        <div>
          {friends.length === 0 ? (
            <div style={{ textAlign:'center', padding:'70px 24px', color:'var(--text2)' }}>
              <div style={{ fontSize:64, marginBottom:12 }}>👥</div>
              <div style={{ fontWeight:700, fontSize:17, color:'var(--text)', marginBottom:6 }}>友達がいません</div>
              <div style={{ fontSize:13, marginBottom:24, lineHeight:1.6 }}>IDやQRコードで友達を追加しよう！</div>
              <button onClick={() => setTab('add')}
                style={{ padding:'12px 32px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(6,199,85,0.35)' }}>
                ➕ 友達を追加する
              </button>
            </div>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <>
                  <div style={{ padding:'10px 16px 6px', fontSize:12, color:'var(--text2)', fontWeight:600, background:'var(--bg)', letterSpacing:0.3 }}>
                    🟢 オンライン ({onlineFriends.length}人)
                  </div>
                  {onlineFriends.map(f => <FriendRow key={f.id||f._id} friend={f} Avatar={Avatar} onChat={() => onStartChat?.(f)} onRemove={() => removeFriend(f.id||f._id)} />)}
                </>
              )}
              <div style={{ padding:'10px 16px 6px', fontSize:12, color:'var(--text2)', fontWeight:600, background:'var(--bg)', letterSpacing:0.3 }}>
                友達 ({offlineFriends.length}人)
              </div>
              {offlineFriends.map(f => <FriendRow key={f.id||f._id} friend={f} Avatar={Avatar} onChat={() => onStartChat?.(f)} onRemove={() => removeFriend(f.id||f._id)} />)}
            </>
          )}
        </div>
      )}

      {/* ===== 申請 ===== */}
      {tab === 'requests' && (
        <div>
          {requests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'70px 24px', color:'var(--text2)' }}>
              <div style={{ fontSize:56, marginBottom:10 }}>📩</div>
              <div style={{ fontWeight:600, fontSize:16, color:'var(--text)', marginBottom:6 }}>申請はありません</div>
              <div style={{ fontSize:13 }}>友達からの申請がここに届きます</div>
            </div>
          ) : (
            <>
              <div style={{ padding:'10px 16px 6px', fontSize:12, color:'var(--text2)', fontWeight:600, background:'var(--bg)' }}>
                承認待ち ({requests.length}件)
              </div>
              {requests.map(req => (
                <div key={req.id||req._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'0.5px solid var(--border)', background:'var(--surface)' }}>
                  <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, flexShrink:0 }}>
                    {req.from_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{req.from_name}</div>
                    <div style={{ fontSize:12, color:'var(--text2)' }}>@{req.from_name} から友達申請</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <button onClick={() => acceptRequest(req.id||req._id)}
                      style={{ padding:'7px 18px', borderRadius:20, background:'#06c755', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                      承認
                    </button>
                    <button onClick={() => rejectRequest(req.id||req._id)}
                      style={{ padding:'7px 18px', borderRadius:20, background:'var(--surface2)', border:'1px solid var(--border)', fontSize:13, cursor:'pointer', color:'var(--text2)' }}>
                      拒否
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ===== 友達追加 ===== */}
      {tab === 'add' && (
        <div style={{ padding:'12px 14px' }}>

          {/* ID検索カード */}
          <div style={{ background:'var(--surface)', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>🔍 IDで友達追加</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>相手のID（ユーザー名）を入力して検索</div>
            <div style={{ display:'flex', gap:8, marginBottom: searchResults.length > 0 ? 12 : 0 }}>
              <input className="form-input" style={{ flex:1, marginBottom:0, borderRadius:24, paddingLeft:16 }}
                placeholder="例: towa0806"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} disabled={searching}
                style={{ padding:'0 20px', height:42, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                {searching ? '…' : '検索'}
              </button>
            </div>

            {/* 検索結果 */}
            {searchResults.map(user => (
              <div key={user.id||user._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderTop:'0.5px solid var(--border)' }}>
                <Avatar user={user} size={48} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{user.display_name || user.username}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>ID: {user.username}</div>
                </div>
                {isFriend(user.id||user._id)
                  ? <span style={{ fontSize:13, color:'#06c755', fontWeight:700 }}>✓ 友達</span>
                  : user.requested
                    ? <span style={{ fontSize:12, color:'var(--text2)', background:'var(--surface2)', padding:'6px 12px', borderRadius:20 }}>申請済み</span>
                    : <button onClick={() => sendRequest(user.id||user._id)}
                        style={{ padding:'8px 20px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(6,199,85,0.3)' }}>
                        追加
                      </button>
                }
              </div>
            ))}
          </div>

          {/* QRコードで追加 */}
          <div style={{ background:'var(--surface)', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>📷 QRコードで追加</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>相手のQRコードを読み取って友達追加</div>
            <button onClick={() => qrInputRef.current?.click()}
              style={{ width:'100%', padding:'12px 0', borderRadius:24, background:'var(--surface2)', border:'1.5px solid var(--border)', fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--text)' }}>
              📷 QRコードを読み取る
            </button>
            <input ref={qrInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleQrScan} />
          </div>

          {/* 招待リンク */}
          <div style={{ background:'var(--surface)', borderRadius:16, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>🔗 招待リンクで追加</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>マイリンクをシェアして友達に追加してもらおう</div>
            <div style={{ background:'var(--bg)', borderRadius:12, padding:'10px 14px', fontSize:13, color:'var(--text2)', marginBottom:10, wordBreak:'break-all' }}>
              {`${window.location.origin}/invite/user/${currentUser.username}`}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/invite/user/${currentUser.username}`); showMsg('リンクをコピーしました！'); }}
              style={{ width:'100%', padding:'12px 0', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 3px 10px rgba(6,199,85,0.3)' }}>
              📋 リンクをコピー
            </button>
          </div>
        </div>
      )}

      {/* ===== QRコード ===== */}
      {tab === 'qr' && (
        <div style={{ padding:'20px 16px' }}>
          {/* マイQRコード */}
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, textAlign:'center', marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>マイQRコード</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>このQRコードを読み取ってもらうと友達追加できます</div>
            <div style={{ display:'inline-block', padding:16, background:'white', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.1)', marginBottom:16 }}>
              <QRCode value={`linekiller://add/${currentUser.username}`} size={190} level="H"
                imageSettings={{ src:'', x:undefined, y:undefined, height:0, width:0, excavate:false }} />
            </div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:2 }}>{currentUser.displayName || currentUser.username}</div>
            <div style={{ fontSize:13, color:'var(--text2)', background:'var(--bg)', display:'inline-block', padding:'4px 14px', borderRadius:20, marginTop:4 }}>
              ID: {currentUser.username}
            </div>
          </div>

          {/* QRを読み取る */}
          <div style={{ background:'var(--surface)', borderRadius:20, padding:20, textAlign:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>QRコードを読み取る</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>友達のQRコードを読み取って追加</div>
            <button onClick={() => qrInputRef.current?.click()}
              style={{ width:'100%', padding:'14px 0', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(6,199,85,0.35)' }}>
              カメラを起動する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FriendRow({ friend, Avatar, onChat, onRemove }) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'0.5px solid var(--border)', background:'var(--surface)', position:'relative', cursor:'pointer' }}
      onClick={onChat}>
      <Avatar user={friend} size={52} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:1 }}>{friend.display_name || friend.username}</div>
        <div style={{ fontSize:12, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {friend.status || `ID: ${friend.username}`}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); setShowMenu(m => !m); }}
        style={{ padding:'8px', background:'none', border:'none', fontSize:20, color:'var(--text2)', cursor:'pointer', flexShrink:0, borderRadius:8 }}>
        ···
      </button>
      {showMenu && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={e => { e.stopPropagation(); setShowMenu(false); }} />
          <div style={{ position:'absolute', right:12, top:'100%', background:'var(--surface)', borderRadius:14, boxShadow:'0 6px 20px rgba(0,0,0,0.15)', zIndex:100, minWidth:160, overflow:'hidden', border:'0.5px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => { onChat(); setShowMenu(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'13px 16px', textAlign:'left', background:'none', border:'none', fontSize:14, cursor:'pointer', borderBottom:'0.5px solid var(--border)' }}>
              <span>💬</span> トークする
            </button>
            <button onClick={() => { onRemove(); setShowMenu(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'13px 16px', textAlign:'left', background:'none', border:'none', fontSize:14, color:'var(--danger)', cursor:'pointer' }}>
              <span>🗑️</span> 友達を削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
