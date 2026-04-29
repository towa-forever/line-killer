import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function PollCard({ pollId, initialPoll, currentUser }) {
  const [poll, setPoll] = useState(initialPoll || null);
  const [freeText, setFreeText] = useState('');
  const [submittingFree, setSubmittingFree] = useState(false);
  const [showAllFree, setShowAllFree] = useState(false);

  useEffect(() => {
    if (!initialPoll && pollId) {
      axios.get('/api/polls/' + pollId).then(r => setPoll(r.data)).catch(() => {});
    }
  }, [pollId]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = useCallback(async (optId) => {
    if (!poll || poll.closed) return;
    try {
      const res = await axios.post('/api/polls/' + poll.id + '/vote', { optionId: optId });
      setPoll(res.data);
    } catch { /* 無視 */ }
  }, [poll]);

  const submitFreeText = useCallback(async () => {
    if (!poll || !freeText.trim() || submittingFree) return;
    setSubmittingFree(true);
    try {
      const res = await axios.post('/api/polls/' + poll.id + '/free-text', { text: freeText.trim() });
      setPoll(res.data);
      setFreeText('');
    } catch { /* 無視 */ }
    finally { setSubmittingFree(false); }
  }, [poll, freeText, submittingFree]);

  const close = useCallback(async () => {
    if (!poll) return;
    try {
      const res = await axios.post('/api/polls/' + poll.id + '/close');
      setPoll(res.data);
    } catch { /* 無視 */ }
  }, [poll]);

  if (!poll) return <div style={{ fontSize:13, color:'var(--text2)' }}>📊 投票を読み込み中...</div>;

  const totalVotes = poll.options.reduce((s, o) => s + o.voters.length, 0);
  const myVotes = poll.options.filter(o => o.voters.includes(currentUser?.id)).map(o => o.id);
  const myFreeAnswer = (poll.free_text_answers || []).find(a => a.user_id === currentUser?.id);
  const freeAnswers = poll.free_text_answers || [];
  const displayedFree = showAllFree ? freeAnswers : freeAnswers.slice(0, 3);

  return (
    <div style={{ background:'var(--surface)', borderRadius:14, padding:'12px 14px', minWidth:220, maxWidth:280 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>📊 {poll.question}</div>
      <div style={{ fontSize:11, color:'var(--text2)', marginBottom:10 }}>
        {poll.multi ? '複数選択可' : '単一選択'}
        {poll.allow_free_text && ' · 記述回答あり'}
        {' · 合計'}{totalVotes}票
        {freeAnswers.length > 0 && ` · 記述${freeAnswers.length}件`}
        {poll.closed && ' · 投票終了'}
      </div>
      {poll.options.map(opt => {
        const pct = totalVotes ? Math.round(opt.voters.length / totalVotes * 100) : 0;
        const voted = myVotes.includes(opt.id);
        return (
          <div key={opt.id} onClick={() => vote(opt.id)} style={{ marginBottom:7, cursor: poll.closed ? 'default' : 'pointer' }}>
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
      {poll.allow_free_text && (
        <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:600 }}>✏️ 記述回答</div>
          {freeAnswers.length > 0 && (
            <div style={{ marginBottom:8 }}>
              {displayedFree.map((a, i) => (
                <div key={i} style={{ fontSize:12, padding:'5px 8px', marginBottom:4, background:'var(--surface2)', borderRadius:8, borderLeft: a.user_id === currentUser?.id ? '3px solid var(--primary)' : '3px solid var(--border)' }}>
                  <span style={{ color:'var(--text2)', marginRight:4 }}>{a.username}:</span>
                  <span style={{ color:'var(--text)' }}>{a.text}</span>
                </div>
              ))}
              {freeAnswers.length > 3 && (
                <button onClick={() => setShowAllFree(v => !v)} style={{ fontSize:11, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', padding:'2px 0' }}>
                  {showAllFree ? '▲ 折りたたむ' : `▼ あと${freeAnswers.length - 3}件表示`}
                </button>
              )}
            </div>
          )}
          {!poll.closed && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input value={freeText} onChange={e => setFreeText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFreeText(); } }}
                placeholder={myFreeAnswer ? '回答を編集...' : '自由に回答...'}
                style={{ flex:1, fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', outline:'none' }}
              />
              <button onClick={submitFreeText} disabled={!freeText.trim() || submittingFree}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:8, background: freeText.trim() ? 'var(--primary)' : 'var(--border)', color: freeText.trim() ? 'white' : 'var(--text2)', border:'none', cursor: freeText.trim() ? 'pointer' : 'default', transition:'background 0.2s', flexShrink:0 }}>
                {myFreeAnswer ? '更新' : '送信'}
              </button>
            </div>
          )}
          {myFreeAnswer && !poll.closed && (
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>現在の回答: 「{myFreeAnswer.text}」</div>
          )}
        </div>
      )}
      {poll.creator_id === currentUser?.id && !poll.closed && (
        <button onClick={close} style={{ marginTop:8, fontSize:12, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:0 }}>投票を締め切る</button>
      )}
    </div>
  );
}
