import React, { useState } from 'react';
import axios from 'axios';
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
const api = axios.create({ baseURL: SERVER_URL });

export default function CreateRoom({ currentUser, friendsList = [], onClose, onCreated }) {
  const [tab, setTab] = useState('dm');
  const [friends] = useState(friendsList);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const toggleUser = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) { setError('相手を選んでください'); return; }
    if (tab === 'group' && !groupName.trim()) { setError('グループ名を入力してください'); return; }
    setCreating(true); setError(''); console.log('送信payload:', JSON.stringify(tab === 'dm' ? { memberIds: [selectedUsers[0]], name: 'DM' } : { memberIds: selectedUsers, name: groupName }));
    try {
      const payload = tab === 'dm'
        ? { memberIds: [selectedUsers[0]], name: "DM" }
        : { memberIds: selectedUsers, name: groupName };
      const res = await api.post('/api/rooms', payload);
      onCreated(res.data);
    } catch (err) {
      setError('エラー: ' + (err.response?.data?.error || err.response?.data?.message || err.message || 'ルーム作成に失敗しました') + ' / payload: ' + JSON.stringify({memberIds: selectedUsers, name: groupName || 'DM'}));
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
            onClick={() => setTab('group')}>グループ</button>
        </div>

        {tab === 'group' && (
          <input className="form-input" value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="グループ名" style={{ marginTop: 12 }} />
        )}

        <div style={{ maxHeight: 280, overflowY: 'auto', margin: '10px 0' }}>
          {friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text2)', fontSize: 13 }}>友達がいません</div>
          ) : (
            friends.map((friend) => {
              const selected = selectedUsers.includes(friend.id);
              const disabled = tab === 'dm' && selectedUsers.length > 0 && !selected;
              return (
                <div key={friend.id}
                  className={`friend-select-item ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => !disabled && toggleUser(friend.id)}>
                  <div className="friend-select-avatar">{friend.username?.[0] || '?'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{friend.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>@{friend.username}</div>
                  </div>
                  <div className={`select-check ${selected ? 'checked' : ''}`}>{selected && '✓'}</div>
                </div>
              );
            })
          )}
        </div>

        {error && <div style={{ color: '#e74c3c', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? '作成中...' : 'トーク開始'}
          </button>
        </div>
      </div>

      <style>{`
        .create-tabs { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 4px; }
        .create-tab { flex: 1; padding: 8px; font-size: 13px; font-weight: 600; color: var(--text2); background: var(--surface2); transition: all 0.2s; }
        .create-tab.active { background: var(--primary); color: white; }
        .friend-select-item { display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; border-radius: 8px; transition: background 0.15s; }
        .friend-select-item:hover { background: var(--surface2); }
        .friend-select-item.selected { background: #e8f5e9; }
        .friend-select-item.disabled { opacity: 0.4; cursor: not-allowed; }
        .friend-select-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex-shrink: 0; }
        .select-check { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; transition: all 0.2s; }
        .select-check.checked { background: var(--primary); border-color: var(--primary); color: white; }
      `}</style>
    </div>
  );
}
