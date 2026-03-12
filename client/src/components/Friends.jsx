import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

export default function Friends({ currentUser, socket, onClearNotif }) {
  const [tab, setTab] = useState('list');
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null); // {text, onOk}

  const fetchFriends = useCallback(async () => {
    try { const res = await axios.get('/api/friends'); setFriends(res.data); } catch (err) {}
  }, []);

  const fetchRequests = useCallback(async () => {
    try { const res = await axios.get('/api/friend-requests'); setRequests(res.data); } catch (err) {}
  }, []);

  useEffect(() => {
    fetchFriends(); fetchRequests();
    if (onClearNotif) onClearNotif();
  }, [fetchFriends, fetchRequests, onClearNotif]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchRequests();
    socket.on('friend:request', handler);
    return () => socket.off('friend:request', handler);
  }, [socket, fetchRequests]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchResults([]);
    try {
      const res = await axios.get(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data.filter((u) => u._id !== currentUser._id && u.id !== currentUser.id));
    } catch (err) { setMessage('検索に失敗しました'); }
    finally { setSearching(false); }
  };

  const sendRequest = async (userId) => {
    try {
      await axios.post('/api/friend-requests', { toId: userId });
      setMessage('友達申請を送りました！');
      setSearchResults((prev) => prev.filter((u) => u._id !== userId && u.id !== userId));
    } catch (err) { setMessage(err.response?.data?.message || '申請に失敗しました'); }
  };

  const acceptRequest = async (requestId) => {
    try {
      await axios.post(`/api/friend-requests/${requestId}/accept`);
      setMessage('友達になりました！'); fetchRequests(); fetchFriends();
    } catch (err) { console.error(err); }
  };

  const rejectRequest = async (requestId) => {
    try {
      await axios.post(`/api/friend-requests/${requestId}/reject`);
      fetchRequests();
    } catch (err) {}
  };

  const blockUser = (userId) => {
    setConfirmDialog({ text: 'このユーザーをブロックしますか？', onOk: async () => {
      try { await axios.post(`/api/users/${userId}/block`); setMessage('ブロックしました'); fetchFriends(); } catch {}
    }});
  };

  const removeFriend = (friendId) => {
    setConfirmDialog({ text: '友達を削除しますか？', onOk: async () => {
      try { await axios.delete(`/api/friends/${friendId}`); fetchFriends(); } catch {}
    }});
  };

  const isFriend = (userId) => {
    if (!userId) return false;
    return friends.some((f) => {
      const fid = f.id || f._id || '';
      return fid === userId || fid === String(userId);
    });
  };

  return (
    <div className="page">
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:20, textAlign:'center' }}>{confirmDialog.text}</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>キャンセル</button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>OK</button>
            </div>
          </div>
        </div>
      )}
      <div className="page-header">友達管理</div>
      <div className="friends-tabs">
        {[
          { id: 'list', label: '友達', count: friends.length },
          { id: 'requests', label: '申請', count: requests.length },
          { id: 'search', label: '検索', count: 0 },
          { id: 'qr', label: 'QR', count: 0 },
        ].map((t) => (
          <button key={t.id} className={`friends-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count > 0 && <span className="friends-tab-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {message && <div className="friends-message" onClick={() => setMessage('')}>{message} ✕</div>}

      {tab === 'list' && (
        <div>
          {friends.length === 0 ? <div className="empty-state">友達がいません。検索で追加しよう！</div> : (
            friends.map((friend) => (
              <div key={friend._id || friend.id} className="user-item">
                <div className="user-avatar-circle" style={{ overflow:'hidden', padding:0 }}>
                  {friend.avatar
                    ? <img src={friend.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                    : <span style={{ lineHeight:'44px' }}>{friend.username?.[0]?.toUpperCase() || '?'}</span>}
                </div>
                <div className="user-info">
                  <div className="user-name">{friend.display_name || friend.username}</div>
                  <div className="user-id">@{friend.username}</div>
                </div>
                <div className="user-actions">
                  <button className="btn-small btn-danger-s" onClick={() => blockUser(friend._id || friend.id)}>ブロック</button>
                  <button className="btn-small" onClick={() => removeFriend(friend._id || friend.id)}>削除</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div>
          {requests.length === 0 ? <div className="empty-state">申請はありません</div> : (
            requests.map((req) => (
              <div key={req._id || req.id} className="user-item">
                <div className="user-avatar-circle">
                  {req.from_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="user-info">
                  <div className="user-name">{req.from_name}</div>
                  <div className="user-id">@{req.from_name}</div>
                </div>
                <div className="user-actions">
                  <button className="btn-small btn-primary-s" onClick={() => acceptRequest(req._id || req.id)}>承認</button>
                  <button className="btn-small" onClick={() => rejectRequest(req._id || req.id)}>拒否</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="card">
          <div className="search-row">
            <input className="form-input" style={{ marginBottom: 0 }}
              placeholder="ユーザーIDまたは名前で検索..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
              {searching ? '...' : '検索'}
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            {searchResults.map((user) => (
              <div key={user._id || user.id} className="user-item">
                <div className="user-avatar-circle" style={{ overflow:'hidden', padding:0 }}>
                  {user.avatar
                    ? <img src={user.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                    : <span style={{ lineHeight:'44px' }}>{user.username?.[0]?.toUpperCase() || '?'}</span>}
                </div>
                <div className="user-info">
                  <div className="user-name">{user.display_name || user.username}</div>
                  <div className="user-id">@{user.username}</div>
                </div>
                <div className="user-actions">
                  {isFriend(user._id || user.id)
                    ? <span className="badge-friend">友達</span>
                    : <button className="btn-small btn-primary-s" onClick={() => sendRequest(user._id || user.id)}>申請</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: 16 }}>マイQRコード</h3>
          <div style={{ display: 'inline-block', padding: 16, background: 'white', borderRadius: 12 }}>
            <QRCode value={`linekiller://add/${currentUser.username}`} size={200} level="H" />
          </div>
          <p style={{ marginTop: 16, color: 'var(--text2)', fontSize: 13 }}>@{currentUser.username}</p>
        </div>
      )}

      <style>{`
        .friends-tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); }
        .friends-tab { flex: 1; padding: 10px; font-size: 13px; color: var(--text2); position: relative; border-bottom: 2px solid transparent; transition: color 0.2s; cursor: pointer; background: none; border-top: none; border-left: none; border-right: none; }
        .friends-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
        .friends-tab-badge { position: absolute; top: 6px; right: 8px; background: #e74c3c; color: white; border-radius: 10px; padding: 1px 5px; font-size: 9px; }
        .friends-message { background: #e8f5e9; color: #2e7d32; padding: 10px 16px; font-size: 13px; cursor: pointer; }
        .user-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
        .user-avatar-circle { width: 44px; height: 44px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; flex-shrink: 0; }
        .user-info { flex: 1; min-width: 0; }
        .user-name { font-weight: 600; font-size: 14px; }
        .user-id { font-size: 12px; color: var(--text2); }
        .user-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .btn-small { padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
        .btn-primary-s { background: var(--primary); color: white; border-color: var(--primary); }
        .btn-danger-s { background: #e74c3c; color: white; border-color: #e74c3c; }
        .badge-friend { font-size: 12px; color: var(--primary); font-weight: 600; padding: 5px 10px; }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text2); font-size: 14px; }
        .search-row { display: flex; gap: 8px; align-items: center; }
        .search-row .form-input { flex: 1; margin-bottom: 0; }
      `}</style>
    </div>
  );
}
