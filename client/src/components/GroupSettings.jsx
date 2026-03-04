import React, { useState } from 'react';
import axios from 'axios';

export default function GroupSettings({ room, currentUser, onClose, onUpdate }) {
  const [name, setName] = useState(room?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`/api/rooms/${room._id}`, { name });
      onUpdate?.(res.data);
      setMessage('更新しました');
    } catch (err) {
      setMessage('更新に失敗しました');
    } finally { setSaving(false); }
  };

  const handleKick = async (userId) => {
    if (!window.confirm('このメンバーを退出させますか？')) return;
    try {
      const res = await axios.post(`/api/rooms/${room._id}/kick`, { userId });
      onUpdate?.(res.data);
    } catch (err) { console.error(err); }
  };

  const handleLeave = async () => {
    if (!window.confirm('このグループを退出しますか？')) return;
    try {
      await axios.post(`/api/rooms/${room._id}/leave`);
      onClose?.();
    } catch (err) { console.error(err); }
  };

  const isAdmin = room?.admin === currentUser._id || room?.admin?._id === currentUser._id;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">⚙️ グループ設定</div>

        {message && <div style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 10 }}>{message}</div>}

        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">グループ名</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ marginBottom: 0, flex: 1 }}
                value={name} onChange={(e) => setName(e.target.value)} placeholder="グループ名" />
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '...' : '保存'}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">メンバー ({room?.members?.length || 0})</label>
          {room?.members?.map((member) => {
            const memberId = member._id || member;
            const isMe = memberId === currentUser._id;
            const isMemberAdmin = room.admin === memberId || room.admin?._id === memberId;
            return (
              <div key={memberId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {member.displayName?.[0] || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{member.displayName || memberId}</span>
                  {isMemberAdmin && <span style={{ fontSize: 11, color: 'var(--primary)', marginLeft: 6 }}>管理者</span>}
                  {isMe && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>あなた</span>}
                </div>
                {isAdmin && !isMe && (
                  <button className="btn-small btn-danger-s" onClick={() => handleKick(memberId)}>退出</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-danger" onClick={handleLeave}>グループを退出</button>
          <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
      <style>{`
        .btn-small { padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
        .btn-danger-s { background: #e74c3c; color: white; border-color: #e74c3c; }
      `}</style>
    </div>
  );
}
