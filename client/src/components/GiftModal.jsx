import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const GIFT_AMOUNTS = [10, 50, 100, 300, 500];
const GIFT_STAMPS = ['⭐','💎','🌸','🎁','💰','🏆','❤️','🎉'];

export default function GiftModal({ targetUser, currentUser, onClose }) {
  const [amount, setAmount]     = useState(10);
  const [stamp, setStamp]       = useState('⭐');
  const [myCoins, setMyCoins]   = useState(0);
  const [sending, setSending]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    axios.get('/api/users/me/coins').then(r => setMyCoins(r.data.coins)).catch(() => {});
  }, []);

  const send = useCallback(async () => {
    if (amount > myCoins) { setError('コインが不足しています'); return; }
    setSending(true); setError('');
    try {
      const res = await axios.post(`/api/users/${targetUser.id}/gift`, { amount, stampId: stamp });
      setMyCoins(res.data.newBalance);
      setDone(true);
    } catch (e) { setError(e.response?.data?.error || '送信に失敗しました'); }
    finally { setSending(false); }
  }, [amount, myCoins, targetUser, stamp]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:480, paddingBottom:'calc(24px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontSize:17, fontWeight:800 }}>🎁 ギフトを贈る</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign:'center', padding:'24px 0' }}>
            <div style={{ fontSize:64, marginBottom:8 }}>{stamp}</div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>送りました！</div>
            <div style={{ fontSize:14, color:'var(--text2)', marginBottom:6 }}>
              {targetUser.displayName || targetUser.username} に {amount} コインをプレゼント
            </div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:24 }}>残高: {myCoins} コイン</div>
            <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>閉じる</button>
          </div>
        ) : (
          <>
            {/* 相手の情報 */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', background:'var(--bg)', borderRadius:12 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                {(targetUser.displayName || targetUser.username)[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{targetUser.displayName || targetUser.username}</div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>@{targetUser.username}</div>
              </div>
              <div style={{ marginLeft:'auto', fontSize:13, color:'#06c755', fontWeight:700 }}>💰 残高: {myCoins}</div>
            </div>

            {/* スタンプ選択 */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>スタンプを選ぶ</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {GIFT_STAMPS.map(s => (
                  <button key={s} onClick={() => setStamp(s)}
                    style={{ width:44, height:44, borderRadius:12, border:`2px solid ${stamp===s?'#06c755':'var(--border)'}`, background: stamp===s?'rgba(6,199,85,0.1)':'var(--bg)', fontSize:22, cursor:'pointer' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* 金額選択 */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>コイン数</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {GIFT_AMOUNTS.map(a => (
                  <button key={a} onClick={() => setAmount(a)}
                    style={{ flex:1, padding:'10px 0', borderRadius:12, border:`2px solid ${amount===a?'#06c755':'var(--border)'}`, background: amount===a?'rgba(6,199,85,0.1)':'var(--bg)', fontSize:14, fontWeight:700, cursor:'pointer', color: amount===a?'#06c755':'var(--text)', minWidth:56 }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ fontSize:12, color:'#c0392b', background:'#fff0f0', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>⚠️ {error}</div>}

            <button onClick={send} disabled={sending || amount > myCoins}
              style={{ width:'100%', padding:14, borderRadius:24, background: amount > myCoins ? '#ccc' : '#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor: amount > myCoins ? 'not-allowed' : 'pointer' }}>
              {sending ? '送信中…' : `🎁 ${stamp} × ${amount}コイン を贈る`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
