import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function ReadLater({ currentUser, onClose, onJumpTo }) {
  const [msgs, setMsgs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/read-later').then(r => setMsgs(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const remove = useCallback(async (msgId) => {
    await axios.delete(`/api/read-later/${msgId}`).catch(() => {});
    setMsgs(m => m.filter(x => x.id !== msgId));
  }, []);

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:8000, display:'flex', flexDirection:'column' }}>
      <div style={{ background:'#06c755', color:'white', padding:'calc(14px + env(safe-area-inset-top)) 16px 14px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'white', fontSize:22, cursor:'pointer' }}>←</button>
        <span style={{ fontSize:18, fontWeight:800, flex:1 }}>🔖 後で読む</span>
        <span style={{ fontSize:13, opacity:0.8 }}>{msgs.length}件</span>
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>読み込み中...</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--text2)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🔖</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>リストが空です</div>
            <div style={{ fontSize:13 }}>メッセージの長押しメニューから<br/>「後で読む」に追加できます</div>
          </div>
        ) : msgs.map(msg => (
          <div key={msg.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', borderBottom:'0.5px solid var(--border)' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:'var(--text2)', marginBottom:3 }}>
                {msg.sender_name} · {new Date(msg.created_at).toLocaleDateString('ja-JP')}
              </div>
              <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                {msg.type === 'stamp' ? '[スタンプ]' : msg.type === 'image' ? '[画像]' : msg.content}
              </div>
            </div>
            <button onClick={() => remove(msg.id)}
              style={{ background:'none', border:'none', color:'var(--text2)', fontSize:18, cursor:'pointer', padding:'2px 6px', flexShrink:0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
