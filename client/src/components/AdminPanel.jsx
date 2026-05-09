import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
const ADMIN_USERNAME = 'とわ';
const CATEGORIES = ['管理者', 'ビジネス', 'クリエイター', 'ニュース', 'エンタメ', 'ゲーム', 'その他'];

export default function AdminPanel({ currentUser, onClose }) {
  const [tab, setTab]               = useState('users');
  const [users, setUsers]           = useState([]);
  const [requests, setRequests]     = useState([]);
  const [accounts, setAccounts]     = useState([]);
  const [newAccName, setNewAccName] = useState('');
  const [newAccDesc, setNewAccDesc] = useState('');
  const [newAccCat, setNewAccCat]   = useState('その他');
  const [newAccAvatar, setNewAccAvatar] = useState(null);
  const [broadcastTarget, setBroadcastTarget] = useState(null);
  const [broadcastText, setBroadcastText] = useState('');
  const [creating, setCreating]     = useState(false);
  const fileRef = React.useRef(null);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [msg, setMsg]               = useState('');
  const [editUser, setEditUser]     = useState(null); // 公式設定モーダル
  const [category, setCategory]     = useState('その他');

  const isAdmin = currentUser?.isAdmin || (currentUser?.username || '').trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase();

  const fetchUsers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/users', { params: { q } });
      setUsers(res.data);
    } catch (e) { setMsg(e.response?.data?.error || 'エラーが発生しました'); }
    finally { setLoading(false); }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get('/api/official-accounts/me');
      setAccounts(res.data);
    } catch (e) {}
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/official-requests');
      setRequests(res.data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
    fetchRequests();
    fetchAccounts();
  }, [isAdmin, fetchUsers, fetchRequests, fetchAccounts]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    clearTimeout(window._adminSearchTimer);
    window._adminSearchTimer = setTimeout(() => fetchUsers(e.target.value), 400);
  };

  const handleSetOfficial = async (userId, official) => {
    try {
      await axios.patch(`/api/admin/users/${userId}/official`, { official, category });
      setMsg(official ? `✅ 公式マークを付与しました` : `公式マークを削除しました`);
      setEditUser(null);
      fetchUsers(search);
    } catch (e) { setMsg(e.response?.data?.error || 'エラー'); }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`@${username} を削除しますか？この操作は取り消せません！`)) return;
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      setMsg(`@${username} を削除しました`);
      fetchUsers(search);
    } catch (e) { setMsg(e.response?.data?.error || '削除に失敗しました'); }
  };

  const handleRequest = async (id, action) => {
    try {
      await axios.patch(`/api/admin/official-requests/${id}`, { action });
      setMsg(action === 'approve' ? '✅ 承認しました！' : '拒否しました');
      fetchRequests();
    } catch (e) { setMsg('操作に失敗しました'); }
  };

  const avatarUrl = (av) => av ? (av.startsWith('http') ? av : `${SERVER_URL}${av}`) : null;

  if (!isAdmin) return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'var(--text2)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🚫</div>
        <div style={{ fontSize:18, fontWeight:700 }}>アクセス権限がありません</div>
        <button onClick={onClose} style={{ marginTop:16, padding:'8px 24px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', cursor:'pointer' }}>戻る</button>
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:9999, display:'flex', flexDirection:'column' }}>
      {/* ヘッダー */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text)' }}>←</button>
        <div>
          <div style={{ fontWeight:700, fontSize:18 }}>🛠️ 管理者パネル</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>WakkaChat Admin</div>
        </div>
      </div>

      {/* タブ */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
        {[
          { id:'users', label:'👥 ユーザー管理' },
          { id:'official', label:'✅ 公式申請' },
          { id:'bot', label:'🤖 公式アカウント' },
          { id:'self', label:'⚡ 自分の設定' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:'10px 0', border:'none', borderBottom: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent', background:'none', color: tab===t.id ? 'var(--primary)' : 'var(--text2)', fontSize:13, fontWeight: tab===t.id ? 700 : 400, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ padding:'8px 16px', background:'var(--surface2)', fontSize:13, color:'var(--primary)', borderBottom:'1px solid var(--border)' }}>
          {msg} <button onClick={() => setMsg('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', marginLeft:8 }}>✕</button>
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto' }}>

        {/* ユーザー管理 */}
        {tab === 'users' && (
          <div>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--bg)', zIndex:5 }}>
              <input value={search} onChange={handleSearch} placeholder="ユーザー名・IDで検索..."
                style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:14, outline:'none', boxSizing:'border-box' }} />
            </div>
            {loading && <div style={{ textAlign:'center', padding:24, color:'var(--text2)' }}>読み込み中...</div>}
            {users.map(u => (
              <div key={u.id} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, overflow:'hidden', flexShrink:0 }}>
                  {avatarUrl(u.avatar) ? <img src={avatarUrl(u.avatar)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (u.display_name?.[0] || u.username?.[0])}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontWeight:700, fontSize:15 }}>{u.display_name || u.username}</span>
                    {u.is_official && <span style={{ fontSize:11, background:'#1DB874', color:'white', borderRadius:8, padding:'1px 6px' }}>公式</span>}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>@{u.username} · ID: {u.id}</div>
                  {u.official_category && <div style={{ fontSize:11, color:'var(--text2)' }}>{u.official_category}</div>}
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => { setEditUser(u); setCategory(u.official_category || 'その他'); }}
                    style={{ padding:'5px 10px', borderRadius:8, background: u.is_official ? '#e74c3c' : '#1DB874', color:'white', border:'none', fontSize:12, cursor:'pointer', fontWeight:700 }}>
                    {u.is_official ? '剥奪' : '公式化'}
                  </button>
                  {u.username !== ADMIN_USERNAME && (
                    <button onClick={() => handleDeleteUser(u.id, u.username)}
                      style={{ padding:'5px 10px', borderRadius:8, background:'#e74c3c', color:'white', border:'none', fontSize:12, cursor:'pointer' }}>
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 公式申請管理 */}
        {tab === 'official' && (
          <div>
            {requests.length === 0 && (
              <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>申請中のアカウントはありません</div>
            )}
            {requests.map(r => (
              <div key={r.id} style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontWeight:700 }}>@{r.username}</span>
                  <span style={{ fontSize:12, padding:'2px 8px', borderRadius:10, background:'var(--surface2)', color:'var(--text2)' }}>{r.category}</span>
                  <span style={{ fontSize:11, color:'var(--text2)', marginLeft:'auto' }}>{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
                </div>
                <div style={{ fontSize:14, color:'var(--text2)', marginBottom:10, lineHeight:1.5 }}>{r.reason}</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => handleRequest(r.id, 'approve')}
                    style={{ flex:1, padding:'8px 0', borderRadius:10, background:'#1DB874', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>✅ 承認</button>
                  <button onClick={() => handleRequest(r.id, 'reject')}
                    style={{ flex:1, padding:'8px 0', borderRadius:10, background:'#e74c3c', color:'white', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>❌ 拒否</button>
                </div>
              </div>
            ))}
          </div>
        )}


        {/* 公式アカウント管理 */}
        {tab === 'bot' && (
          <div>
            {/* 新規作成フォーム */}
            <div style={{ padding:16, borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>➕ 新規公式アカウント作成</div>
              <div style={{ display:'flex', gap:12, marginBottom:10 }}>
                <div onClick={() => fileRef.current?.click()}
                  style={{ width:56, height:56, borderRadius:16, background:'var(--surface2)', border:'1px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:24, flexShrink:0 }}>
                  {newAccAvatar ? <img src={URL.createObjectURL(newAccAvatar)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:16 }} /> : '📷'}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => setNewAccAvatar(e.target.files[0])} />
                <div style={{ flex:1 }}>
                  <input value={newAccName} onChange={e => setNewAccName(e.target.value)}
                    placeholder="アカウント名（例：WakkaChatニュース）*"
                    style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:6 }} />
                  <select value={newAccCat} onChange={e => setNewAccCat(e.target.value)}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, outline:'none' }}>
                    {['ニュース', 'エンタメ', 'ゲーム', 'ビジネス', 'クリエイター', 'その他'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <textarea value={newAccDesc} onChange={e => setNewAccDesc(e.target.value)}
                placeholder="説明文・ウェルカムメッセージ（友達追加時に自動送信）"
                style={{ width:'100%', minHeight:60, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, resize:'none', boxSizing:'border-box', outline:'none', marginBottom:10 }} />
              <button onClick={async () => {
                if (!newAccName.trim()) return;
                setCreating(true);
                try {
                  const fd = new FormData();
                  fd.append('name', newAccName);
                  fd.append('description', newAccDesc);
                  fd.append('category', newAccCat);
                  if (newAccAvatar) fd.append('avatar', newAccAvatar);
                  await axios.post('/api/official-accounts', fd);
                  setNewAccName(''); setNewAccDesc(''); setNewAccAvatar(null);
                  setMsg('✅ 公式アカウントを作成しました！');
                  fetchAccounts();
                } catch (e) { setMsg(e.response?.data?.error || '作成に失敗しました'); }
                finally { setCreating(false); }
              }} disabled={creating || !newAccName.trim()}
                style={{ width:'100%', padding:'10px 0', borderRadius:12, background:'#1DB874', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', opacity: creating || !newAccName.trim() ? 0.5 : 1 }}>
                {creating ? '作成中...' : '🤖 作成する'}
              </button>
            </div>

            {/* 既存アカウント一覧 */}
            {accounts.length === 0 && (
              <div style={{ textAlign:'center', padding:32, color:'var(--text2)' }}>公式アカウントがまだありません</div>
            )}
            {accounts.map(acc => (
              <div key={acc.id} style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
                  <div style={{ width:48, height:48, borderRadius:14, background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, overflow:'hidden', flexShrink:0 }}>
                    {acc.avatar ? <img src={acc.avatar.startsWith('http') ? acc.avatar : `${SERVER_URL}${acc.avatar}`} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🤖'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{acc.name}</div>
                    <div style={{ fontSize:12, color:'var(--text2)' }}>{acc.category} · 👥 {acc.followerCount}人</div>
                  </div>
                  <button onClick={async () => {
                    if (!window.confirm(`「${acc.name}」を削除しますか？`)) return;
                    await axios.delete(`/api/official-accounts/${acc.id}`).catch(() => {});
                    fetchAccounts();
                  }} style={{ padding:'5px 10px', borderRadius:8, background:'#e74c3c', color:'white', border:'none', fontSize:12, cursor:'pointer' }}>削除</button>
                </div>
                {acc.description && <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8, lineHeight:1.5 }}>{acc.description}</div>}
                <button onClick={() => { setBroadcastTarget(acc); setBroadcastText(''); }}
                  style={{ width:'100%', padding:'8px 0', borderRadius:10, background:'var(--primary)', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  📣 メッセージ一斉送信（{acc.followerCount}人）
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 管理者自身の設定 */}
        {tab === 'self' && (
          <div style={{ padding:20 }}>
            <div style={{ background:'var(--surface)', borderRadius:16, padding:20, marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>⚡ 自分のアカウントを公式化</div>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>管理者は即時に公式アカウントに設定できるで</div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:13, marginBottom:6 }}>カテゴリ</div>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, outline:'none' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={async () => {
                  await axios.post('/api/admin/self-official', { official: true, category });
                  setMsg('✅ 公式アカウントに設定しました！再ログインで反映されます');
                }} style={{ flex:1, padding:'10px 0', borderRadius:12, background:'#1DB874', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                  ✅ 公式にする
                </button>
                <button onClick={async () => {
                  await axios.post('/api/admin/self-official', { official: false });
                  setMsg('公式マークを解除しました。再ログインで反映されます');
                }} style={{ flex:1, padding:'10px 0', borderRadius:12, background:'#e74c3c', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                  解除
                </button>
              </div>
            </div>
            <div style={{ background:'var(--surface)', borderRadius:16, padding:20 }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📊 統計</div>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>アプリの統計情報</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ background:'var(--surface2)', borderRadius:12, padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:700, color:'var(--primary)' }}>{users.length}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>総ユーザー数</div>
                </div>
                <div style={{ background:'var(--surface2)', borderRadius:12, padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:700, color:'#1DB874' }}>{users.filter(u => u.is_official).length}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>公式アカウント</div>
                </div>
                <div style={{ background:'var(--surface2)', borderRadius:12, padding:14, textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:700, color:'#f39c12' }}>{requests.length}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>申請中</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* 公式アカウント一斉送信モーダル */}
      {broadcastTarget && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', zIndex:100 }}>
          <div style={{ background:'var(--surface)', width:'100%', borderRadius:'20px 20px 0 0', padding:20 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📣 {broadcastTarget.name}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>{broadcastTarget.followerCount}人に送信します</div>
            <textarea value={broadcastText} onChange={e => setBroadcastText(e.target.value)}
              placeholder="送信するメッセージを入力..." rows={4}
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:15, resize:'none', boxSizing:'border-box', outline:'none', marginBottom:12 }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={async () => {
                if (!broadcastText.trim()) return;
                try {
                  const res = await axios.post(`/api/official-accounts/${broadcastTarget.id}/send`, { content: broadcastText });
                  setMsg(`✅ ${res.data.sent}人に送信しました！`);
                  setBroadcastTarget(null);
                } catch (e) { setMsg(e.response?.data?.error || '送信に失敗しました'); }
              }} disabled={!broadcastText.trim()}
                style={{ flex:1, padding:'10px 0', borderRadius:12, background:'#1DB874', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', opacity: !broadcastText.trim() ? 0.5 : 1 }}>
                全員に送信
              </button>
              <button onClick={() => setBroadcastTarget(null)}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'none', color:'var(--text)', fontSize:15, cursor:'pointer' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 公式設定モーダル */}
      {editUser && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', zIndex:100 }}>
          <div style={{ background:'var(--surface)', width:'100%', borderRadius:'20px 20px 0 0', padding:20 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>
              {editUser.is_official ? '⚠️ 公式マークを剥奪' : '✅ 公式アカウントに設定'}
            </div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>@{editUser.username}</div>
            {!editUser.is_official && (
              <div style={{ marginBottom:12 }}>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:14, outline:'none' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => handleSetOfficial(editUser.id, !editUser.is_official)}
                style={{ flex:1, padding:'10px 0', borderRadius:12, background: editUser.is_official ? '#e74c3c' : '#1DB874', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {editUser.is_official ? '剥奪する' : '公式にする'}
              </button>
              <button onClick={() => setEditUser(null)}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'none', color:'var(--text)', fontSize:15, cursor:'pointer' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
