import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function PollCard({ pollId, initialPoll, currentUser }) {
  const [poll, setPoll] = useState(initialPoll || null);

  useEffect(() => {
    if (!initialPoll && pollId) {
      axios.get('/api/polls/' + pollId).then(r => setPoll(r.data)).catch(() => {});
    }
  }, [pollId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!poll) return <div style={{ fontSize:13, color:'var(--text2)' }}>📊 投票を読み込み中...</div>;

  const totalVotes = poll.options.reduce((s, o) => s + o.voters.length, 0);
  const myVotes = poll.options.filter(o => o.voters.includes(currentUser?.id)).map(o => o.id);

  const vote = async (optId) => {
    if (poll.closed) return;
    try { const res = await axios.post('/api/polls/' + poll.id + '/vote', { optionId: optId });
    setPoll(res.data); } catch { /* 無視 */ }
  };

  const close = async () => {
    try { const res = await axios.post('/api/polls/' + poll.id + '/close');
    setPoll(res.data); } catch { /* 無視 */ }
  };

  return (
    <div style={{ background:'var(--surface)', borderRadius:14, padding:'12px 14px', minWidth:220, maxWidth:280 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>📊 {poll.question}</div>
      <div style={{ fontSize:11, color:'var(--text2)', marginBottom:10 }}>
        {poll.multi ? '複数選択可' : '単一選択'} · 合計{totalVotes}票
        {poll.closed && ' · 投票終了'}
      </div>
      {poll.options.map(opt => {
        const pct = totalVotes ? Math.round(opt.voters.length / totalVotes * 100) : 0;
        const voted = myVotes.includes(opt.id);
        return (
          <div key={opt.id} onClick={() => vote(opt.id)} style={{
            marginBottom:7, cursor: poll.closed ? 'default' : 'pointer',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:3 }}>
              <span style={{ fontWeight: voted ? 700 : 400, color: voted ? 'var(--primary)' : 'var(--text)' }}>
                {voted ? '✓ ' : ''}{opt.text}
              </span>
              <span style={{ color:'var(--text2)', fontSize:12 }}>{opt.voters.length}票 ({pct}%)</span>
            </div>
            <div style={{ height:6, borderRadius:3, background:'var(--surface2)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: voted ? 'var(--primary)' : 'var(--border)', borderRadius:3, transition:'width 0.3s' }} />
            </div>
          </div>
        );
      })}
      {poll.creator_id === currentUser?.id && !poll.closed && (
        <button onClick={close} style={{
          marginTop:8, fontSize:12, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:0
        }}>投票を締め切る</button>
      )}
    </div>
  );
}
