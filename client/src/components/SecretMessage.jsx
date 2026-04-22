import React, { useState, useEffect, useRef, useCallback } from 'react';
// 秘密メッセージ（閲覧後自動削除 or タイマー削除）
export default function SecretMessage({ socket, roomId, currentUser, onSent, onCancel }) {
  const [text, setText] = useState('');
  const [timer, setTimer] = useState(10); // 秒
  const TIMERS = [5, 10, 30, 60, 300];
  const fmt = s => s >= 60 ? `${s/60}分` : `${s}秒`;

  const send = useCallback(() => {
    if (!text.trim()) return;
    socket?.emit('message:send', {
      roomId, senderId: currentUser?.id,
      senderName: currentUser?.display_name || currentUser?.username,
      content: text.trim(), type: 'secret',
      fileData: { timer, label: '🔐 秘密メッセージ' },
      expiresAt: new Date(Date.now() + timer * 1000).toISOString(),
    });
    onSent?.();
  };

  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid #c77dff', borderRadius:20, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:16 }}>🔐</span>
        <span style={{ fontSize:14, fontWeight:700, color:'#c77dff' }}>秘密メッセージ</span>
        <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>読んだあと自動削除</span>
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="秘密の内容..." rows={3}
        style={{ resize:'none', borderRadius:12, border:'1px solid var(--border)', padding:'8px 12px', fontSize:14, background:'var(--bg)', color:'var(--text)', outline:'none' }} />
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:12, color:'var(--text2)' }}>表示時間:</span>
        {TIMERS.map(t => (
          <button key={t} onClick={() => setTimer(t)} style={{ padding:'4px 10px', borderRadius:10, border:'1.5px solid', fontSize:12, cursor:'pointer', fontWeight:600,
            borderColor: timer===t ? '#c77dff' : 'var(--border)', background: timer===t ? '#c77dff' : 'transparent', color: timer===t ? 'white' : 'var(--text)' }}>
            {fmt(t)}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={onCancel} style={{ padding:'6px 12px', borderRadius:12, border:'none', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', fontSize:13 }}>キャンセル</button>
        <button onClick={send} disabled={!text.trim()} style={{ padding:'6px 14px', borderRadius:12, border:'none', background:'#c77dff', color:'white', cursor:'pointer', fontSize:13, fontWeight:700 }}>送信</button>
      </div>
    </div>
  );
}

// 秘密メッセージの表示バブル
export function SecretBubble({ msg, isMine }) {
  const [revealed, setRevealed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const intervalRef = useRef(null);
  const timer = msg.fileData?.timer || msg.file_data?.timer || 10;

  const reveal = useCallback(() => {
    setRevealed(true);
    setRemaining(timer);
  }, []);
  // カウントダウン処理
  useEffect(() => {
    if (!revealed || isMine) return;
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [revealed, isMine]);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  if (expired) return (
    <span style={{ opacity:0.5, fontSize:13, fontStyle:'italic' }}>🔐 このメッセージは削除されました</span>
  );

  if (!revealed && !isMine) return (
    <button onClick={reveal} style={{ background:'rgba(199,125,255,0.15)', border:'1.5px solid #c77dff', borderRadius:12, padding:'8px 14px', cursor:'pointer', color:'#c77dff', fontWeight:700, fontSize:13 }}>
      🔐 タップして表示 ({timer}秒で消える)
    </button>
  );

  if (!revealed) return (
    <span style={{ opacity:0.7, fontSize:13 }}>🔐 秘密メッセージを送信しました ({timer}秒)</span>
  );

  const urgent = remaining !== null && remaining <= 5;

  return (
    <div style={{ position:'relative' }}>
      <span>{msg.content}</span>
      {!isMine && remaining !== null && (
        <div style={{
          fontSize:11, marginTop:6, fontWeight:700,
          color: urgent ? '#ff3b30' : '#c77dff',
          display:'flex', alignItems:'center', gap:5,
          transition:'color 0.3s',
        }}>
          <span style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:18, height:18, borderRadius:'50%',
            border: `2px solid ${urgent ? '#ff3b30' : '#c77dff'}`,
            fontSize:9, fontWeight:900,
            animation: urgent ? 'secretPulse 0.5s infinite alternate' : 'none',
          }}>
            {remaining}
          </span>
          {remaining}秒後に消えます
          <style>{`@keyframes secretPulse { from { opacity:1; transform:scale(1); } to { opacity:0.4; transform:scale(1.15); } }`}</style>
        </div>
      )}
    </div>
  );
}
