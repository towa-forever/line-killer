import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ChatStats({ roomId, roomName, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/rooms/${roomId}/stats`).then(r => { setStats(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [roomId]);

  const MEDALS = ['🥇','🥈','🥉'];
  const HOURS = Array(24).fill(0).map((_,i) => i);
  const maxH = stats ? Math.max(...stats.hourMap, 1) : 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85dvh', overflow:'auto', borderRadius:'20px 20px 0 0' }}>
        <div style={{ display:'flex', alignItems:'center', padding:'14px 16px 0', gap:10 }}>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text)' }}>←</button>
          <h2 style={{ fontSize:17, fontWeight:700, margin:0 }}>📊 {roomName}の統計</h2>
        </div>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text2)' }}>集計中やで...</div>
        ) : !stats ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text2)' }}>データなし</div>
        ) : (
          <div style={{ padding:'16px' }}>
            {/* 総メッセージ数 */}
            <div style={{ background:'linear-gradient(135deg,var(--primary),#05a847)', borderRadius:16, padding:'16px', color:'white', marginBottom:16, textAlign:'center' }}>
              <div style={{ fontSize:13, opacity:0.85 }}>総メッセージ数</div>
              <div style={{ fontSize:40, fontWeight:800 }}>{stats.total.toLocaleString()}</div>
              {stats.firstMessage && <div style={{ fontSize:11, opacity:0.75 }}>初回: {new Date(stats.firstMessage).toLocaleDateString('ja-JP')}</div>}
            </div>

            {/* 送信ランキング */}
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:10, color:'var(--text)' }}>🏆 送信ランキング</h3>
            {stats.ranking.slice(0,10).map((r, i) => (
              <div key={r.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--surface2)', borderRadius:12, marginBottom:6 }}>
                <span style={{ fontSize: i<3?20:14, width:28, textAlign:'center' }}>{i<3 ? MEDALS[i] : i+1}</span>
                <span style={{ flex:1, fontWeight:600, fontSize:14, color:'var(--text)' }}>{r.name}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:Math.min(80, (r.count/stats.ranking[0].count)*80), height:6, background:'var(--primary)', borderRadius:3 }} />
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', minWidth:36, textAlign:'right' }}>{r.count}</span>
                </div>
              </div>
            ))}

            {/* 時間帯グラフ */}
            <h3 style={{ fontSize:14, fontWeight:700, margin:'16px 0 10px', color:'var(--text)' }}>⏰ 時間帯別アクティビティ</h3>
            <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:60, padding:'0 4px', background:'var(--surface2)', borderRadius:12 }}>
              {HOURS.map(h => (
                <div key={h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{ width:'100%', background: h===stats.mostActiveHour ? 'var(--primary)' : 'var(--border)', borderRadius:'3px 3px 0 0', height: Math.max(2, (stats.hourMap[h]/maxH)*52), transition:'height 0.3s' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text2)', padding:'4px 4px 0' }}>
              <span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>23時</span>
            </div>
            <div style={{ marginTop:8, fontSize:12, color:'var(--text2)', textAlign:'center' }}>
              一番アクティブな時間帯: <strong style={{ color:'var(--primary)' }}>{stats.mostActiveHour}時台</strong>
            </div>

            {/* メッセージタイプ内訳 */}
            <h3 style={{ fontSize:14, fontWeight:700, margin:'16px 0 10px', color:'var(--text)' }}>📎 メッセージタイプ</h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {Object.entries(stats.types||{}).map(([type, count]) => {
                const icons = { text:'💬', image:'🖼️', file:'📎', voice:'🎤', location:'📍', sticker:'🎭' };
                return (
                  <div key={type} style={{ background:'var(--surface2)', borderRadius:12, padding:'6px 12px', fontSize:13 }}>
                    {icons[type]||'📄'} {type}: <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
