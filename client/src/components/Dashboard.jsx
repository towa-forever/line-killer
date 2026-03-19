import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Dashboard({ currentUser, onNavigateRoom }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    axios.get('/api/dashboard').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const totalUnread = data?.unread?.reduce((s, r) => s + r.count, 0) || 0;

  const Section = ({ icon, title, children, empty }) => (
    <div style={{ background:'var(--surface)', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{title}</span>
      </div>
      {children || <div style={{ fontSize:13, color:'var(--text2)', textAlign:'center', padding:'8px 0' }}>{empty}</div>}
    </div>
  );

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text2)' }}>読み込み中...</div>;

  return (
    <div style={{ padding:'12px', overflowY:'auto', height:'100%', boxSizing:'border-box' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>
          おはよう、{currentUser?.displayName || currentUser?.username}👋
        </div>
        <div style={{ fontSize:13, color:'var(--text2)', marginTop:4 }}>
          {new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' })}
        </div>
      </div>

      {/* サマリーカード */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
        {[
          { icon:'💬', label:'未読', value: totalUnread, color:'#ff3b30' },
          { icon:'✅', label:'タスク', value: data?.tasks?.length || 0, color:'#06c755' },
          { icon:'📅', label:'イベント', value: data?.events?.length || 0, color:'#007aff' },
        ].map(c => (
          <div key={c.label} style={{ background:'var(--surface)', borderRadius:14, padding:'14px 10px', textAlign:'center' }}>
            <div style={{ fontSize:24 }}>{c.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color: c.value > 0 ? c.color : 'var(--text)', marginTop:4 }}>{c.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 未読トーク */}
      {data?.unread?.length > 0 && (
        <Section icon="💬" title={`未読トーク（${totalUnread}件）`}>
          {data.unread.slice(0, 4).map(r => (
            <div key={r.roomId} onClick={() => onNavigateRoom(r.roomId)}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
              <span style={{ fontSize:14, color:'var(--text)' }}>{r.roomName}</span>
              <span style={{ background:'#ff3b30', color:'white', borderRadius:12, padding:'2px 8px', fontSize:12, fontWeight:700 }}>{r.count}</span>
            </div>
          ))}
        </Section>
      )}

      {/* タスク */}
      <Section icon="✅" title="直近のタスク" empty="タスクがないで！">
        {data?.tasks?.length > 0 && data.tasks.slice(0, 4).map(t => {
          const overdue = t.due && new Date(t.due) < new Date();
          return (
            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:16 }}>📌</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                {t.due && <div style={{ fontSize:11, color: overdue ? '#ff3b30' : 'var(--text2)' }}>
                  {overdue ? '⚠️ ' : ''}{new Date(t.due).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                </div>}
              </div>
            </div>
          );
        })}
      </Section>

      {/* イベント */}
      <Section icon="📅" title="今後のイベント" empty="イベントがないで！">
        {data?.events?.length > 0 && data.events.slice(0, 3).map(e => (
          <div key={e.id} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
            <div style={{ background:'var(--primary)', color:'white', borderRadius:10, padding:'6px 10px', textAlign:'center', minWidth:44 }}>
              <div style={{ fontSize:16, fontWeight:800 }}>{new Date(e.startAt).getDate()}</div>
              <div style={{ fontSize:10 }}>{new Date(e.startAt).toLocaleDateString('ja-JP', { month:'short' })}</div>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{e.title}</div>
              <div style={{ fontSize:11, color:'var(--text2)' }}>
                {new Date(e.startAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}〜
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* スケジュール送信 */}
      {data?.scheduled?.length > 0 && (
        <Section icon="⏰" title="予約送信">
          {data.scheduled.map(s => (
            <div key={s.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:13, color:'var(--text)', marginBottom:2 }}>{s.content.slice(0, 40)}{s.content.length > 40 ? '…' : ''}</div>
              <div style={{ fontSize:11, color:'var(--text2)' }}>
                {new Date(s.sendAt).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}に送信予定
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
