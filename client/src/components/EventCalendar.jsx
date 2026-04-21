import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function EventCalendar({ room, currentUser, socket, onClose }) {
  const [events, setEvents] = useState([]);
  const [view, setView] = useState('list'); // list | create
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    axios.get('/api/rooms/' + room.id + '/events').then(r => { setEvents(r.data); setLoading(false); }).catch(() => setLoading(false));
    if (!socket) return;
    const onNew = e => setEvents(prev => [...prev, e].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)));
    const onUpd = e => setEvents(prev => prev.map(x => x.id === e.id ? e : x));
    socket.on('event:new', onNew); socket.on('event:updated', onUpd);
    return () => { socket.off('event:new', onNew); socket.off('event:updated', onUpd); };
  }, [room.id, socket]);

  const create = useCallback(async () => {
    if (!title.trim() || !startAt) return;
    try { await axios.post('/api/rooms/' + room.id + '/events', { title: title.trim(), description: desc, startAt, endAt }); }
    catch { setCreateError('イベントの保存に失敗しました'); return; }
    setTitle(''); setDesc(''); setStartAt(''); setEndAt(''); setView('list'); setCreateError('');
  }, [title, startAt, desc, endAt, room.id]);

  const attend = useCallback(async (eventId, status) => {
    // オプティミスティックUI更新（即時反映）
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      const attendees = (e.attendees || []).map(a =>
        a.user_id === currentUser?.id ? { ...a, status } : a
      );
      // 自分の参加情報がなければ追加
      if (!attendees.find(a => a.user_id === currentUser?.id)) {
        attendees.push({ user_id: currentUser?.id, status });
      }
      return { ...e, attendees };
    }));
    try { await axios.patch('/api/events/' + eventId + '/attend', { status }); }
    catch { /* サーバーエラー時はsocket経由で正しい状態に戻る */ }
  };

  const STATUS_COLOR = { going: '#06c755', maybe: '#ff9500', notgoing: '#ff3b30', pending: 'var(--text2)' };

  // カレンダーグリッド
  const daysInMonth = () => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    return { first, days };
  };
  const { first, days } = daysInMonth();
  const eventDays = new Set(events.map(e => {
    const d = new Date(e.start_at);
    if (d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()) return d.getDate();
    return null;
  }).filter(Boolean));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:2000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, paddingBottom:'calc(16px + env(safe-area-inset-bottom))', maxHeight:'90dvh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'16px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:17 }}>📅 イベント</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setView(view === 'create' ? 'list' : 'create')}
                style={{ padding:'6px 14px', borderRadius:20, background: view === 'create' ? 'var(--primary)' : 'var(--surface2)', color: view === 'create' ? 'white' : 'var(--text)', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {view === 'create' ? 'キャンセル' : '＋ 作成'}
              </button>
              <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          </div>

          {/* カレンダー */}
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1))} style={{ fontSize:18, padding:'4px 8px', background:'none', border:'none', cursor:'pointer', color:'var(--text)' }}>‹</button>
              <span style={{ fontWeight:700, fontSize:15 }}>{month.toLocaleDateString('ja-JP', { year:'numeric', month:'long' })}</span>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1))} style={{ fontSize:18, padding:'4px 8px', background:'none', border:'none', cursor:'pointer', color:'var(--text)' }}>›</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, textAlign:'center' }}>
              {['日','月','火','水','木','金','土'].map(d => <div key={d} style={{ fontSize:11, color:'var(--text2)', padding:'4px 0', fontWeight:600 }}>{d}</div>)}
              {Array(first).fill(null).map((_, i) => <div key={'e'+i} />)}
              {Array(days).fill(null).map((_, i) => {
                const d = i + 1, today = new Date();
                const isToday = d === today.getDate() && month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear();
                const hasEvent = eventDays.has(d);
                return (
                  <div key={d} style={{ padding:'6px 2px', borderRadius:8, background: isToday ? 'var(--primary)' : 'transparent', position:'relative' }}>
                    <span style={{ fontSize:13, color: isToday ? 'white' : 'var(--text)', fontWeight: isToday ? 700 : 400 }}>{d}</span>
                    {hasEvent && <div style={{ width:4, height:4, borderRadius:'50%', background: isToday ? 'white' : 'var(--primary)', margin:'2px auto 0' }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding:'0 16px 16px' }}>
          {view === 'create' ? (
            <div style={{ background:'var(--surface2)', borderRadius:14, padding:14 }}>
              <div style={{ fontWeight:700, marginBottom:10, fontSize:14 }}>✨ 新しいイベント</div>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル *" style={{ marginBottom:8 }} />
              <textarea className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="説明（任意）" style={{ minHeight:60, resize:'vertical', marginBottom:8 }} />
              <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>開始日時 *</label>
              <input type="datetime-local" className="form-input" value={startAt} onChange={e => setStartAt(e.target.value)} style={{ marginBottom:8 }} />
              <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>終了日時（任意）</label>
              <input type="datetime-local" className="form-input" value={endAt} onChange={e => setEndAt(e.target.value)} style={{ marginBottom:12 }} />
              {createError && <div style={{ color:'var(--danger)', fontSize:13, marginBottom:8, textAlign:'center' }}>{createError}</div>}
              <button onClick={create} style={{ width:'100%', padding:12, borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor:'pointer' }}>作成</button>
            </div>
          ) : loading ? (
            <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>読み込み中...</div>
          ) : events.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text2)', padding:20, fontSize:14 }}>イベントがまだないで！</div>
          ) : events.map(evt => {
            const myAttend = evt.attendees?.find(a => a.user_id === currentUser?.id);
            const goingCount = evt.attendees?.filter(a => a.status === 'going').length || 0;
            return (
              <div key={evt.id} style={{ background:'var(--surface2)', borderRadius:14, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{evt.title}</div>
                  <span style={{ fontSize:11, color:'var(--text2)' }}>参加{goingCount}人</span>
                </div>
                {evt.description && <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>{evt.description}</div>}
                <div style={{ fontSize:12, color:'var(--primary)', marginBottom:10, fontWeight:600 }}>
                  📅 {new Date(evt.start_at).toLocaleDateString('ja-JP', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  {evt.end_at && ` 〜 ${new Date(evt.end_at).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}`}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {[['going','✅ 参加'],['maybe','🤔 未定'],['notgoing','❌ 不参加']].map(([s, label]) => (
                    <button key={s} onClick={() => attend(evt.id, s)} style={{
                      flex:1, padding:'6px 4px', borderRadius:10, fontSize:11, fontWeight:600,
                      border: '1.5px solid', cursor:'pointer',
                      borderColor: myAttend?.status === s ? STATUS_COLOR[s] : 'var(--border)',
                      background: myAttend?.status === s ? STATUS_COLOR[s] : 'transparent',
                      color: myAttend?.status === s ? 'white' : 'var(--text)',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
