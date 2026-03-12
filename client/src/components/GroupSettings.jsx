import React, { useState } from 'react';
import axios from 'axios';

export default function GroupSettings({ room, currentUser, onClose, onUpdate }) {
  const [name, setName] = useState(room?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [themeColor, setThemeColor] = useState(room?.theme_color || '');
  const [themeSaving, setThemeSaving] = useState(false);

  // GroupSettings.jsx は現在 App.js から呼ばれていないが、
  // 将来的に使う可能性があるので正しいAPIエンドポイントに修正
  const roomId = room?.id || room?._id;

  const generateInvite = async () => {
    setInviteLoading(true);
    try {
      const res = await axios.post(`/api/rooms/${roomId}/invite`);
      setInviteUrl(res.data.inviteUrl);
    } catch (e) { setMessage('招待リンクの生成に失敗しました'); }
    finally { setInviteLoading(false); }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setMessage('コピーしました！');
  };

  const saveTheme = async (color) => {
    setThemeSaving(true);
    try {
      await axios.patch(`/api/rooms/${roomId}/theme`, { themeColor: color });
      setThemeColor(color);
      setMessage('テーマを変更しました');
    } catch (e) { setMessage('失敗しました'); }
    finally { setThemeSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(`/api/rooms/${roomId}/name`, { name });
      onUpdate?.({ ...room, name });
      setMessage('更新しました');
    } catch (err) {
      setMessage('更新に失敗しました');
    } finally { setSaving(false); }
  };

  const handleKick = (userId) => {
    setConfirmDialog({ text: 'このメンバーを退出させますか？', onOk: async () => {
      try {
        await axios.delete(`/api/rooms/${roomId}/members/${userId}`);
        onUpdate?.({ ...room, members: room.members.filter(m => (m._id || m) !== userId) });
      } catch (err) { console.error(err); }
    }});
  };

  const handleLeave = () => {
    setConfirmDialog({ text: 'このグループを退出しますか？', onOk: async () => {
      try {
        await axios.delete(`/api/rooms/${roomId}/members/${currentUser.id}`);
        onClose?.();
      } catch (err) { console.error(err); }
    }});
  };

  const isAdmin = room?.creator_id === currentUser.id;

  return (
    <>
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:20, textAlign:'center' }}>{confirmDialog.text}</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>OK</button>
            </div>
          </div>
        </div>
      )}
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
            const memberId = member.id || member._id || member;
            const isMe = memberId === currentUser.id;
            const isCreator = memberId === room.creator_id;
            return (
              <div key={memberId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {(member.username || memberId)?.[0] || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{member.username || memberId}</span>
                  {isCreator && <span style={{ fontSize: 11, color: 'var(--primary)', marginLeft: 6 }}>👑 管理者</span>}
                  {isMe && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>あなた</span>}
                </div>
                {isAdmin && !isMe && !isCreator && (
                  <button className="btn-small btn-danger-s" onClick={() => handleKick(memberId)}>退出</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          {!isAdmin && (
            <button className="btn btn-danger" onClick={handleLeave}>グループを退出</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
      <style>{`
        .btn-small { padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; background: var(--surface2); color: var(--text); border: 1px solid var(--border); cursor: pointer; }
        .btn-danger-s { background: #e74c3c; color: white; border-color: #e74c3c; }
      `}</style>
    </div>
    </>
  );
}
