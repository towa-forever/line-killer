import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function Note({ room, currentUser, socket, onClose }) {
  const [tab, setTab] = useState('shared'); // 'shared' | 'mine'
  const [sharedContent, setSharedContent] = useState('');
  const [mineContent, setMineContent] = useState('');
  const [sharedInfo, setSharedInfo] = useState(null); // { updatedBy, updatedAt }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false); // 未保存の変更あり

  const fetchNotes = useCallback(async () => {
    try {
      const [shared, mine] = await Promise.all([
        axios.get(`/api/rooms/${room.id}/note/shared`),
        axios.get(`/api/rooms/${room.id}/note/mine`),
      ]);
      setSharedContent(shared.data.content || '');
      setSharedInfo({ updatedBy: shared.data.updatedBy, updatedAt: shared.data.updatedAt });
      setMineContent(mine.data.content || '');
    } catch (e) { console.error(e); }
  }, [room.id]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // リアルタイムで共有ノートの更新を受け取る
  useEffect(() => {
    if (!socket) return;
    const handler = ({ roomId, content, updatedBy }) => {
      if (roomId === room.id) {
        setSharedContent(content);
        setSharedInfo({ updatedBy, updatedAt: new Date() });
      }
    };
    socket.on('note:updated', handler);
    return () => socket.off('note:updated', handler);
  }, [socket, room.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === 'shared') {
        await axios.put(`/api/rooms/${room.id}/note/shared`, { content: sharedContent });
      } else {
        await axios.put(`/api/rooms/${room.id}/note/mine`, { content: mineContent });
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const content = tab === 'shared' ? sharedContent : mineContent;
  const setContent = (val) => {
    if (tab === 'shared') setSharedContent(val);
    else setMineContent(val);
    setDirty(true);
    setSaved(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 2000,
      display: 'flex', flexDirection: 'column'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)'
      }}>
        <button onClick={onClose} style={{ fontSize: 20, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>📝 ノート - {room.name || 'トーク'}</span>
        <button onClick={handleSave} disabled={saving || !dirty} style={{
          background: dirty ? 'var(--primary)' : 'var(--border)', color: dirty ? 'white' : 'var(--text2)', border: 'none',
          borderRadius: 8, padding: '6px 14px', fontSize: 14, cursor: dirty ? 'pointer' : 'default', fontWeight: 600,
          transition: 'background 0.2s'
        }}>
          {saving ? '保存中' : saved ? '✓ 保存済' : dirty ? '保存' : '保存済'}
        </button>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {[{ id: 'shared', label: '👥 共有ノート' }, { id: 'mine', label: '🔒 マイノート' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px', fontSize: 14, border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--primary)' : 'var(--surface)',
            color: tab === t.id ? 'white' : 'var(--text)',
            fontWeight: tab === t.id ? 700 : 400,
            borderBottom: tab === t.id ? '2px solid var(--primary)' : 'none'
          }}>{t.label}</button>
        ))}
      </div>

      {/* 更新者情報（共有ノートのみ） */}
      {tab === 'shared' && sharedInfo?.updatedBy && (
        <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)' }}>
          最終更新: {sharedInfo.updatedBy} · {sharedInfo.updatedAt ? new Date(sharedInfo.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
      )}

      {/* テキストエリア */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={tab === 'shared' ? 'みんなで共有するメモを書こう...' : '自分だけのメモを書こう...'}
        style={{
          flex: 1, padding: 16, fontSize: 15, lineHeight: 1.7,
          border: 'none', outline: 'none', resize: 'none',
          background: 'var(--bg)', color: 'var(--text)',
          fontFamily: 'inherit'
        }}
      />
    </div>
  );
}
