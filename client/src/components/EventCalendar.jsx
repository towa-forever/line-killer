import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

export default function EventCalendar({ room, currentUser, socket, onClose }) {
  const [events, setEvents] = useState([]);
  const [view, setView] = useState('calendar'); // calendar | list | create | edit
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    axios.get('/api/rooms/' + room.id + '/events')
      .then(r => { setEvents(r.data); setLoading(false); })
      .catch(() => setLoading(false));
    if (!socket) return;
    const onNew = e => setEvents(prev => [...prev, e].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)));
    const onUpd = e => setEvents(prev => prev.map(x => x.id === e.id ? e : x));
    const onDel = ({ id }) => setEvents(prev => prev.filter(x => x.id !== id));
    socket.on('event:new', onNew);
    socket.on('event:updated', onUpd);
    socket.on('event:deleted', onDel);
    return () => {
      socket.off('event:new', onNew);
      socket.off('event:updated', onUpd);
      socket.off('event:deleted', onDel);
    };
  }, [room.id, socket]);

  // カレンダー計算
  const calendarData = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    events.forEach(e => {
      const d = new Date(e.start_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const key = d.getDate();
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(e);
      }
    });
    return { first, days, byDay };
  }, [month, events]);

  const resetForm = () => {
    setTitle(''); setDesc(''); setStartAt(''); setEndAt('');
    setEditingEvent(null); setCreateError('');
  };

  const openCreate = (day) => {
    resetForm();
    if (day) {
      const y = month.getFullYear(), m = month.getMonth();
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T10:00`;
      setStartAt(dateStr);
    }
    setView('create');
  };

  const openEdit = (evt) => {
    setEditingEvent(evt);
    setTitle(evt.title);
    setDesc(evt.description || '');
    const fmt = d => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; };
    setStartAt(fmt(evt.start_at));
    setEndAt(evt.end_at ? fmt(evt.end_at) : '');
    setView('edit');
  };

  const save = useCallback(async () => {
    if (!title.trim() || !startAt) { setCreateError('タイトルと開始日時は必須やで'); return; }
    setSaving(true);
    try {
      if (editingEvent) {
        await axios.put('/api/events/' + editingEvent.id, { title: title.trim(), description: desc, startAt, endAt });
      } else {
        await axios.post('/api/rooms/' + room.id + '/events', { title: title.trim(), description: desc, startAt, endAt });
      }
      resetForm(); setView('calendar');
    } catch { setCreateError('保存に失敗したで...'); }
    finally { setSaving(false); }
  }, [title, startAt, desc, endAt, room.id, editingEvent]);

  const deleteEvent = useCallback(async (evtId) => {
    if (!window.confirm('このイベントを削除する？')) return;
    try {
      await axios.delete('/api/events/' + evtId);
      setEvents(prev => prev.filter(e => e.id !== evtId));
    } catch { alert('削除に失敗したで'); }
  }, []);

  const attend = useCallback(async (eventId, status) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      const attendees = (e.attendees || []).map(a =>
        a.user_id === currentUser?.id ? { ...a, status } : a
      );
      if (!attendees.find(a => a.user_id === currentUser?.id)) {
        attendees.push({ user_id: currentUser?.id, status });
      }
      return { ...e, attendees };
    }));
    await axios.patch('/api/events/' + eventId + '/attend', { status }).catch(() => {});
  }, [currentUser]);

  const STATUS_COLOR = { going: '#06c755', maybe: '#ff9500', notgoing: '#ff3b30' };
  const today = new Date();

  const dayEvents = selectedDay
    ? (calendarData.byDay[selectedDay] || [])
    : [];

  const upcomingEvents = useMemo(() =>
    events.filter(e => new Date(e.start_at) >= new Date()).sort((a,b) => new Date(a.start_at)-new Date(b.start_at)).slice(0,5),
  [events]);

  const EventCard = ({ evt }) => {
    const myAttend = evt.attendees?.find(a => a.user_id === currentUser?.id);
    const goingCount = evt.attendees?.filter(a => a.status === 'going').length || 0;
    const isPast = new Date(evt.start_at) < new Date();
    const isCreator = evt.creator_id === currentUser?.id;
    return (
      <div style={{ background:'var(--surface2)', borderRadius:14, padding:14, marginBottom:10, opacity: isPast ? 0.7 : 1 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
          <div style={{ fontWeight:700, fontSize:15, flex:1 }}>{evt.title}</div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {isCreator && (
              <>
                <button onClick={() => openEdit(evt)} style={{ fontSize:12, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>編集</button>
                <button onClick={() => deleteEvent(evt.id)} style={{ fontSize:12, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>削除</button>
              </>
            )}
          </div>
        </div>
        {evt.description && <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>{evt.description}</div>}
        <div style={{ fontSize:12, color:'var(--primary)', marginBottom:10, fontWeight:600 }}>
          📅 {new Date(evt.start_at).toLocaleDateString('ja-JP', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}
          {evt.end_at && ` 〜 ${new Date(evt.end_at).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}`}
          <span style={{ marginLeft:8, color:'var(--text2)', fontWeight:400 }}>参加{goingCount}人</span>
        </div>
        {!isPast && (
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
        )}
      </div>
    );
  };

  const FormView = () => (
    <div style={{ background:'var(--surface2)', borderRadius:14, padding:14 }}>
      <div style={{ fontWeight:700, marginBottom:10, fontSize:14 }}>{editingEvent ? '✏️ イベントを編集' : '✨ 新しいイベント'}</div>
      <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル *" style={{ marginBottom:8 }} />
      <textarea className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="説明（任意）" style={{ minHeight:60, resize:'vertical', marginBottom:8 }} />
      <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>開始日時 *</label>
      <input type="datetime-local" className="form-input" value={startAt} onChange={e => setStartAt(e.target.value)} style={{ marginBottom:8 }} />
      <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>終了日時（任意）</label>
      <input type="datetime-local" className="form-input" value={endAt} onChange={e => setEndAt(e.target.value)} style={{ marginBottom:12 }} />
      {createError && <div style={{ color:'var(--danger)', fontSize:13, marginBottom:8, textAlign:'center' }}>{createError}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => { resetForm(); setView('calendar'); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface)', border:'1px solid var(--border)', fontWeight:600, fontSize:14, cursor:'pointer', color:'var(--text)' }}>キャンセル</button>
        <button onClick={save} disabled={saving} style={{ flex:1, padding:12, borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? '保存中...' : (editingEvent ? '更新' : '作成')}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:2000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, paddingBottom:'calc(16px + env(safe-area-inset-bottom))', maxHeight:'92dvh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'16px 16px 0' }}>
          {/* ヘッダー */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:17 }}>📅 イベント</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {view === 'calendar' && (
                <>
                  <button onClick={() => setView('list')} style={{ padding:'6px 12px', borderRadius:20, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:12, cursor:'pointer' }}>一覧</button>
                  <button onClick={() => openCreate(null)} style={{ padding:'6px 14px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>＋ 作成</button>
                </>
              )}
              {view === 'list' && <button onClick={() => setView('calendar')} style={{ padding:'6px 12px', borderRadius:20, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:12, cursor:'pointer' }}>カレンダー</button>}
              <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          </div>

          {/* カレンダービュー */}
          {view === 'calendar' && (
            <>
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <button onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth()-1)); setSelectedDay(null); }} style={{ fontSize:20, padding:'4px 10px', background:'var(--surface2)', border:'none', cursor:'pointer', borderRadius:8, color:'var(--text)' }}>‹</button>
                  <span style={{ fontWeight:700, fontSize:15 }}>{month.toLocaleDateString('ja-JP', { year:'numeric', month:'long' })}</span>
                  <button onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth()+1)); setSelectedDay(null); }} style={{ fontSize:20, padding:'4px 10px', background:'var(--surface2)', border:'none', cursor:'pointer', borderRadius:8, color:'var(--text)' }}>›</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, textAlign:'center' }}>
                  {['日','月','火','水','木','金','土'].map((d,i) => <div key={d} style={{ fontSize:11, color: i===0?'#ff3b30':i===6?'#007aff':'var(--text2)', padding:'4px 0', fontWeight:600 }}>{d}</div>)}
                  {Array(calendarData.first).fill(null).map((_,i) => <div key={'e'+i} />)}
                  {Array(calendarData.days).fill(null).map((_,i) => {
                    const d = i+1;
                    const isToday = d===today.getDate() && month.getMonth()===today.getMonth() && month.getFullYear()===today.getFullYear();
                    const isSel = d === selectedDay;
                    const evts = calendarData.byDay[d] || [];
                    return (
                      <div key={d} onClick={() => setSelectedDay(isSel ? null : d)} style={{
                        padding:'6px 2px', borderRadius:10, cursor:'pointer',
                        background: isSel ? 'var(--primary)' : isToday ? 'var(--primary)20' : 'transparent',
                        border: isSel ? '2px solid var(--primary)' : isToday ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                      }}>
                        <span style={{ fontSize:13, color: isSel ? 'white' : isToday ? 'var(--primary)' : 'var(--text)', fontWeight: isToday ? 700 : 400 }}>{d}</span>
                        {evts.length > 0 && (
                          <div style={{ display:'flex', justifyContent:'center', gap:1, marginTop:2 }}>
                            {evts.slice(0,3).map((e,j) => <div key={j} style={{ width:4, height:4, borderRadius:'50%', background: isSel ? 'white' : 'var(--primary)' }} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* create / edit フォーム */}
          {(view === 'create' || view === 'edit') && <FormView />}
        </div>

        <div style={{ padding:'0 16px 16px' }}>
          {/* 選択日のイベント */}
          {view === 'calendar' && selectedDay && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'8px 0' }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{month.getMonth()+1}月{selectedDay}日のイベント</div>
                <button onClick={() => openCreate(selectedDay)} style={{ fontSize:12, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>＋ 追加</button>
              </div>
              {dayEvents.length === 0
                ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'12px 0', fontSize:13 }}>この日はイベントないで</div>
                : dayEvents.map(e => <EventCard key={e.id} evt={e} />)
              }
            </>
          )}

          {/* 未選択時：直近イベント */}
          {view === 'calendar' && !selectedDay && (
            <>
              <div style={{ fontWeight:700, fontSize:14, margin:'8px 0' }}>📌 直近のイベント</div>
              {loading ? (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>読み込み中...</div>
              ) : upcomingEvents.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:'12px 0', fontSize:13 }}>予定イベントなし</div>
              ) : upcomingEvents.map(e => <EventCard key={e.id} evt={e} />)}
            </>
          )}

          {/* 一覧ビュー */}
          {view === 'list' && (
            <>
              <div style={{ fontWeight:700, fontSize:14, margin:'8px 0' }}>全イベント（{events.length}件）</div>
              {loading ? (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>読み込み中...</div>
              ) : events.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:20, fontSize:14 }}>イベントがまだないで！</div>
              ) : [...events].sort((a,b) => new Date(b.start_at)-new Date(a.start_at)).map(e => <EventCard key={e.id} evt={e} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
