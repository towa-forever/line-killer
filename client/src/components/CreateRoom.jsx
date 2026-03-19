import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function CreateRoom({ currentUser, friendsList: initialFriends = [], onClose, onCreated, onOpen }) {
  const [tab, setTab] = useState('dm');
  const [friends, setFriends] = useState(initialFriends);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // マウント時に最新の友達リストを取得
  useEffect(() => {
    setLoading(true);
    axios.get('/api/friends')
      .then(res => { setFriends(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { setFriends(Array.isArray(initialFriends) ? initialFriends : []); })
      .finally(() => setLoading(false));
    if (onOpen) onOpen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleUser = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) { setError('相手を選んでください'); return; }
    if (tab === 'group' && !groupName.trim()) { setError('グループ名を入力してください'); return; }
    setCreating(true); setError('');
    try {
      let res;
      if (tab === 'dm') {
        res = await axios.post('/api/rooms/dm', { targetUserId: selectedUsers[0] });
      } else {
        res = await axios.post('/api/rooms', { memberIds: selectedUsers, name: groupName.trim() });
      }
      if (!res.data || !res.data.id) {
        setError('サーバーからルーム情報が返ってきませんでした');
        return;
      }
      onCreated(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || '作成に失敗しました';
      setError('エラー: ' + msg);
      console.error('[CreateRoom]', err.response?.status, err.response?.data, err.message);
    } finally { setCreating(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">✏️ 新しいトーク</div>

        <div className="create-tabs">
          <button className={`create-tab ${tab === 'dm' ? 'active' : ''}`}
            onClick={() => { setTab('dm'); setSelectedUsers([]); }}>1対1</button>
          <button className={`create-tab ${tab === 'group' ? 'active' : ''}`}
            onClick={() => { setTab('group'); setSelectedUsers([]); }}>グループ</button>
        </div>

        {tab === 'group' && (
          <input className="form-input" value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="グループ名（必須）" style={{ marginTop: 12 }} autoFocus />
        )}

        <div style={{ maxHeight: 280, overflowY: 'auto', margin: '10px 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text2)' }}>読み込み中...</div>
          ) : friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text2)', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              友達を追加してからトークを作成できます
            </div>
          ) : (
            friends.map((friend) => {
              const selected = selectedUsers.includes(friend.id);
              const disabled = tab === 'dm' && selectedUsers.length > 0 && !selected;
              const avatarSrc = friend.avatar
                ? (friend.avatar.startsWith('http') ? friend.avatar : `${SERVER_URL}${friend.avatar}`)
                : null;
              return (
                <div key={friend.id}
                  className={`friend-select-item ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => !disabled && toggleUser(friend.id)}>
                  <div className="friend-select-avatar">
                    {avatarSrc
                      ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : (friend.display_name || friend.username)?.[0]?.toUpperCase() || '?'
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{friend.display_name || friend.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>@{friend.username}</div>
                  </div>
                  <div className={`select-check ${selected ? 'checked' : ''}`}>{selected ? '✓' : ''}</div>
                </div>
              );
            })
          )}
        </div>

        {selectedUsers.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, textAlign: 'center' }}>
            {tab === 'dm' ? '1人選択済み' : `${selectedUsers.length}人選択済み`}
          </div>
        )}

        {error && <div style={{ color: '#e74c3c', fontSize: 13, marginBottom: 8, background: '#fff0f0', padding: '8px 12px', borderRadius: 8 }}>⚠️ {error}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || selectedUsers.length === 0}>
            {creating ? '作成中...' : tab === 'dm' ? '💬 トーク開始' : '👥 グループ作成'}
          </button>
        </div>
      </div>

      <style>{`
        .create-tabs { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 4px; }
        .create-tab { flex: 1; padding: 10px; font-size: 14px; font-weight: 600; color: var(--text2); background: var(--surface2); transition: all 0.2s; border: none; cursor: pointer; }
        .create-tab.active { background: var(--primary); color: white; }
        .friend-select-item { display: flex; align-items: center; gap: 12px; padding: 12px 4px; cursor: pointer; border-radius: 10px; transition: background 0.15s; border-bottom: 0.5px solid var(--border); }
        .friend-select-item:active { background: var(--surface2); }
        .friend-select-item.selected { background: rgba(6,199,85,0.08); }
        .friend-select-item.disabled { opacity: 0.35; cursor: not-allowed; }
        .friend-select-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; flex-shrink: 0; overflow: hidden; }
        .select-check { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; transition: all 0.2s; }
        .select-check.checked { background: var(--primary); border-color: var(--primary); color: white; font-weight: 700; }
      `}</style>
    </div>
  );
}
