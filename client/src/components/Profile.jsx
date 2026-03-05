import React, { useState } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

export default function Profile({ currentUser, onUpdate, onLogout, darkMode, onToggleDark }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.patch('/api/users/me', { displayName, bio });
      onUpdate(res.data);
      setMessage('プロフィールを更新しました！');
      setEditing(false);
    } catch (err) {
      setMessage('更新に失敗しました');
    } finally { setSaving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">プロフィール</div>

      <div className="card" style={{ margin: 10, textAlign: 'center' }}>
        <div className="profile-avatar">{currentUser.displayName?.[0] || '?'}</div>
        {editing ? (
          <>
            <input className="form-input" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名" style={{ marginTop: 12 }} />
            <textarea className="form-input" value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="自己紹介..." rows={3} style={{ resize: 'none' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="profile-name">{currentUser.displayName}</div>
            <div className="profile-username">@{currentUser.username}</div>
            {currentUser.bio && <div className="profile-bio">{currentUser.bio}</div>}
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
              ✏️ 編集
            </button>
          </>
        )}
        {message && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--primary)' }}>{message}</div>}
      </div>

      <div className="card" style={{ margin: 10, textAlign: 'center' }}>
        <div className="profile-section-title">マイQRコード</div>
        <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 8, marginTop: 8 }}>
          <QRCode value={`linekiller://add/${currentUser.username}`} size={150} level="H" />
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>QRコードを読み取って友達追加</p>
      </div>

      <div className="card" style={{ margin: 10 }}>
        <div className="profile-section-title">設定</div>
        <div className="setting-row" onClick={onToggleDark}>
          <span>🌙 ダークモード</span>
          <div className={`toggle ${darkMode ? 'on' : ''}`}>
            <div className="toggle-knob" />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 10px 20px' }}>
        <button className="btn btn-danger" style={{ width: '100%', padding: 12 }}
          onClick={() => { if (window.confirm('ログアウトしますか？')) onLogout(); }}>
          ログアウト
        </button>
      </div>

      <style>{`
        .profile-avatar { width: 80px; height: 80px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; margin: 0 auto 12px; }
        .profile-name { font-size: 22px; font-weight: 700; }
        .profile-username { font-size: 14px; color: var(--text2); margin-top: 4px; }
        .profile-bio { font-size: 13px; color: var(--text2); margin-top: 8px; line-height: 1.5; }
        .profile-section-title { font-size: 14px; font-weight: 700; color: var(--text2); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; cursor: pointer; font-size: 15px; }
        .toggle { width: 44px; height: 24px; border-radius: 12px; background: var(--border); position: relative; transition: background 0.3s; }
        .toggle.on { background: var(--primary); }
        .toggle-knob { width: 20px; height: 20px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: left 0.3s; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .toggle.on .toggle-knob { left: 22px; }
      `}</style>
    </div>
  );
}
