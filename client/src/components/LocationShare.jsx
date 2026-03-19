import React, { useState } from 'react';

export default function LocationShare({ socket, roomId, currentUser, onSent, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const send = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        socket?.emit('message:send', {
          roomId, senderId: currentUser?.id,
          senderName: currentUser?.display_name || currentUser?.username,
          content: `📍 現在地を共有`,
          type: 'location',
          fileData: { lat, lng, label: '現在地' },
        });
        setLoading(false);
        onSent?.();
      },
      (err) => { setError('位置情報の取得に失敗したで'); setLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid #4d96ff', borderRadius:20, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <span style={{ fontSize:13, color:'var(--text2)' }}>📍 現在地を送る</span>
        {error && <span style={{ fontSize:11, color:'var(--danger)' }}>{error}</span>}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onCancel} style={{ padding:'6px 12px', borderRadius:12, border:'none', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', fontSize:13 }}>キャンセル</button>
        <button onClick={send} disabled={loading} style={{ padding:'6px 14px', borderRadius:12, border:'none', background:'#4d96ff', color:'white', cursor:'pointer', fontSize:13, fontWeight:700 }}>
          {loading ? '取得中...' : '📍 送信'}
        </button>
      </div>
    </div>
  );
}

// 地図表示バブル
export function LocationBubble({ msg, isMine }) {
  const data = msg.fileData || msg.file_data;
  if (!data?.lat) return null;
  const { lat, lng, label } = data;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`;
  const imgUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=280x140&markers=${lat},${lng},red`;
  return (
    <div style={{ borderRadius:14, overflow:'hidden', cursor:'pointer' }} onClick={() => window.open(mapUrl, '_blank')}>
      <img src={imgUrl} alt="地図" style={{ width:'100%', display:'block', borderRadius:14 }}
        onError={e => { e.target.style.display='none'; }} />
      <div style={{ padding:'6px 10px', background: isMine ? 'rgba(0,0,0,0.15)' : 'var(--surface2)', fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
        <span>📍</span><span>{label || '現在地'}</span>
        <span style={{ marginLeft:'auto', fontSize:11, opacity:0.7 }}>タップで地図を開く</span>
      </div>
    </div>
  );
}
