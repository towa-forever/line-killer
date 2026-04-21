import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function TaskPanel({ room, currentUser, socket, onClose, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    axios.get('/api/rooms/' + room.id + '/tasks').then(r => { setTasks(r.data); setLoading(false); }).catch(() => setLoading(false));
    if (!socket) return;
    const onNew = t => setTasks(prev => [t, ...prev]);
    const onUpdated = t => setTasks(prev => prev.map(x => x.id === t.id ? t : x));
    const onDeleted = ({ taskId }) => setTasks(prev => prev.filter(x => x.id !== taskId));
    socket.on('task:new', onNew);
    socket.on('task:updated', onUpdated);
    socket.on('task:deleted', onDeleted);
    return () => { socket.off('task:new', onNew); socket.off('task:updated', onUpdated); socket.off('task:deleted', onDeleted); };
  }, [room.id, socket]);

  const addTask = useCallback(async () => {
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      await axios.post('/api/rooms/' + room.id + '/tasks', {
        title: title.trim(),
        assigneeId: assigneeId || currentUser?.id,
        assigneeName: currentUser?.username,
        due: due || null
      });
      setTitle(''); setAssigneeId(''); setDue('');
    } catch (e) {
      showToast?.('タスクの追加に失敗したで', 'error');
    } finally { setAdding(false); }
  }, [title, adding, room.id, assigneeId, currentUser, due, showToast]);

  const toggle = useCallback((task) => axios.patch('/api/tasks/' + task.id, { done: !task.done }).catch(() => {}), []);
  const del = useCallback((task) => axios.delete('/api/tasks/' + task.id).catch(() => {}), []);

  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:2000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:480, paddingBottom:'calc(20px + env(safe-area-inset-bottom))', maxHeight:'80dvh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:17 }}>✅ タスク管理</div>
          <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:4 }}>✕</button>
        </div>

        {/* 追加フォーム */}
        <div style={{ background:'var(--surface2)', borderRadius:12, padding:12, marginBottom:16 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タスクを入力..." className="form-input" style={{ marginBottom:8 }} />
          <div style={{ display:'flex', gap:8 }}>
            <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className="form-input" style={{ flex:1, marginBottom:0, fontSize:13 }} />
            <button onClick={addTask} disabled={adding || !title.trim()} style={{ padding:'0 16px', borderRadius:10, background: title.trim() ? 'var(--primary)' : 'var(--border)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor: title.trim() ? 'pointer' : 'default', flexShrink:0 }}>{adding ? '...' : '追加'}</button>
          </div>
        </div>

        {loading ? <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>読み込み中...</div> : <>
          {pending.length > 0 && <>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', marginBottom:8 }}>未完了 ({pending.length})</div>
            {pending.map(task => <TaskItem key={task.id} task={task} onToggle={toggle} onDelete={del} currentUser={currentUser} />)}
          </>}
          {done.length > 0 && <>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', margin:'12px 0 8px' }}>完了 ({done.length})</div>
            {done.map(task => <TaskItem key={task.id} task={task} onToggle={toggle} onDelete={del} currentUser={currentUser} />)}
          </>}
          {tasks.length === 0 && <div style={{ textAlign:'center', color:'var(--text2)', padding:'20px 0', fontSize:14 }}>タスクがまだないで！</div>}
        </>}
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete, currentUser }) {
  const overdue = task.due && !task.done && new Date(task.due) < new Date();
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <button onClick={() => onToggle(task)} style={{ width:22, height:22, borderRadius:6, border:`2px solid ${task.done ? 'var(--primary)' : 'var(--border)'}`, background: task.done ? 'var(--primary)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
        {task.done && <span style={{ color:'white', fontSize:13 }}>✓</span>}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--text2)' : 'var(--text)' }}>{task.title}</div>
        <div style={{ fontSize:11, color: overdue ? 'var(--danger)' : 'var(--text2)', marginTop:2 }}>
          {task.assignee_name && `@${task.assignee_name}`}
          {task.due && ` · ${overdue ? '⚠️ ' : ''}${new Date(task.due).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}`}
        </div>
      </div>
      {(task.creator_id === currentUser?.id) && (
        <button onClick={() => onDelete(task)} style={{ color:'var(--danger)', fontSize:16, padding:4, cursor:'pointer', background:'none', border:'none' }}>🗑️</button>
      )}
    </div>
  );
}
