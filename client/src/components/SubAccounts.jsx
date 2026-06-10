import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || '';

export default function SubAccounts({ currentUser, onSwitch, onClose }) {
  const [subs, setSubs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('list'); // list | create
  const [form, setForm]               = useState({ username: '', password: '', displayName: '' });
  const [creating, setCreating]       = useState(false);
  const [msg, setMsg]                 = useState({ text: '', type: '' });
  const [switchingId, setSwitchingId] = useState(null);
  const [switchingMain, setSwitchingMain] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isSubAccount = !!currentUser?.parentAccountId;

  const showMsg = useCallback((text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 3000);
  }, []);

  useEffect(() => { fetchSubs(); }, []);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/sub-accounts');
      setSubs(res.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  // サブ垢に切り替え
  const handleSwitch = useCallback(async (subId) => {
    setSwitchingId(subId);
    try {
      const res = await axios.post(`/api/sub-accounts/${subId}/switch`);
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onSwitch(res.data.user);
      onClose();
    } catch (e) {
      showMsg(e.response?.data?.error || '切り替えに失敗しました', 'error');
    } finally { setSwitchingId(null); }
  }, [onSwitch, onClose, showMsg]);

  // メインアカウントに戻る
  const handleSwitchToMain = useCallback(async () => {
    setSwitchingMain(true);
    try {
      const res = await axios.post('/api/sub-accounts/switch-to-main');
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onSwitch(res.data.user);
      onClose();
    } catch (e) {
      showMsg(e.response?.data?.error || '切り替えに失敗しました', 'error');
    } finally { setSwitchingMain(false); }
  }, [onSwitch, onClose, showMsg]);

  // サブ垢削除
  const handleDelete = useCallback(async (subId) => {
    try {
      await axios.delete(`/api/sub-accounts/${subId}`);
      showMsg('削除しました');
      fetchSubs();
    } catch (e) {
      showMsg(e.response?.data?.error || '削除に失敗しました', 'error');
    }
    setConfirmDelete(null);
  }, [fetchSubs, showMsg]);

  // サブ垢作成
  const handleCreate = useCallback(async () => {
    if (!form.username.trim() || !form.password.trim()) {
      showMsg('IDとパスワードは必須です', 'error'); return;
    }
    setCreating(true);
    try {
      await axios.post('/api/sub-accounts', {
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || form.username.trim(),
      });
      showMsg('サブアカウントを作成しました！');
      setForm({ username: '', password: '', displayName: '' });
      setTab('list');
      fetchSubs();
    } catch (e) {
      showMsg(e.response?.data?.error || '作成に失敗しました', 'error');
    } finally { setCreating(false); }
  }, [form, fetchSubs, showMsg]);

  const Avatar = ({ user, size = 46 }) => {
    const src = user?.avatar
      ? (user.avatar.startsWith('http') ? user.avatar : `${SERVER_URL}${user.avatar}`)
      : null;
    const name = user?.displayName || user?.username || '?';
    return src
      ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
      : <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#06c755,#03a040)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700 }}>
          {name[0]?.toUpperCase()}
        </div>;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>アカウント切り替え</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>✕</button>
        </div>

        {/* トースト */}
        {msg.text && (
          <div style={{ margin: '10px 16px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, flexShrink: 0,
            background: msg.type === 'error' ? '#fff0f0' : '#e8f5e9',
            color: msg.type === 'error' ? '#c0392b' : '#2e7d32' }}>
            {msg.type === 'error' ? '⚠️ ' : '✅ '}{msg.text}
          </div>
        )}

        {/* タブ（メインアカウントのみ表示） */}
        {!isSubAccount && (
          <div style={{ display: 'flex', margin: '14px 16px 0', background: 'var(--bg)', borderRadius: 12, padding: 3, flexShrink: 0 }}>
            {[{ id: 'list', label: '一覧' }, { id: 'create', label: '新規作成' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
                  background: tab === t.id ? 'var(--surface)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: tab === t.id ? 'var(--text)' : 'var(--text2)',
                  boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px 32px' }}>

          {/* ===== 一覧タブ ===== */}
          {tab === 'list' && (
            <>
              {/* サブ垢の場合：メインへ戻るボタン */}
              {isSubAccount && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>メインアカウント</div>
                  <button
                    onClick={handleSwitchToMain}
                    disabled={switchingMain}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'rgba(6,199,85,0.08)', border: '1.5px solid #06c755', borderRadius: 14, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#06c755,#03a040)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏠</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>メインアカウントに戻る</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>サブ垢からメインへ切り替え</div>
                    </div>
                    <span style={{ fontSize: 13, color: 'white', background: '#06c755', borderRadius: 20, padding: '5px 12px', fontWeight: 700, flexShrink: 0 }}>
                      {switchingMain ? '...' : '戻る'}
                    </span>
                  </button>
                </div>
              )}

              {/* 現在のアカウント */}
              <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>現在のアカウント</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(6,199,85,0.08)', borderRadius: 14, border: '1.5px solid #06c755', marginBottom: 16 }}>
                <Avatar user={currentUser} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{currentUser?.displayName || currentUser?.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>@{currentUser?.username}</div>
                  {isSubAccount && <div style={{ fontSize: 11, color: '#06c755', marginTop: 2, fontWeight: 600 }}>サブアカウント</div>}
                </div>
                <span style={{ fontSize: 12, background: '#06c755', color: 'white', borderRadius: 20, padding: '3px 10px', fontWeight: 600, flexShrink: 0 }}>使用中</span>
              </div>

              {/* サブアカ一覧（メインアカウントのみ表示） */}
              {!isSubAccount && (
                loading ? (
                  <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: 20 }}>読み込み中...</div>
                ) : subs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text2)' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>サブアカウントがありません</div>
                    <div style={{ fontSize: 12 }}>「新規作成」タブから追加できます</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>サブアカウント ({subs.length}/5)</div>
                    {subs.map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg)', borderRadius: 14, marginBottom: 8 }}>
                        <Avatar user={sub} size={46} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{sub.displayName || sub.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>@{sub.username}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => handleSwitch(sub.id)} disabled={switchingId === sub.id}
                            style={{ padding: '7px 14px', borderRadius: 20, background: '#06c755', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: switchingId === sub.id ? 0.6 : 1 }}>
                            {switchingId === sub.id ? '...' : '切替'}
                          </button>
                          <button onClick={() => setConfirmDelete(sub)}
                            style={{ padding: '7px 10px', borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', color: 'var(--danger)' }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )
              )}
            </>
          )}

          {/* ===== 新規作成タブ ===== */}
          {tab === 'create' && !isSubAccount && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6, background: 'var(--bg)', borderRadius: 12, padding: '10px 14px' }}>
                サブアカウントは最大5個まで作成できます。<br />メインアカウントとは独立したアカウントです。
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>表示名（任意）</div>
                <input className="form-input" placeholder="例: サブ垢、趣味用 など" value={form.displayName}
                  onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} style={{ marginBottom: 0 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>ID <span style={{ color: 'red' }}>*</span></div>
                <input className="form-input" placeholder="半角英数字・記号（3文字以上）" value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))} style={{ marginBottom: 0 }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>パスワード <span style={{ color: 'red' }}>*</span></div>
                <input type="password" className="form-input" placeholder="6文字以上" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))} style={{ marginBottom: 0 }} />
              </div>
              <button onClick={handleCreate} disabled={creating}
                style={{ width: '100%', padding: '14px 0', borderRadius: 24, background: creating ? '#ccc' : '#06c755', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(6,199,85,0.3)' }}>
                {creating ? '作成中...' : '✨ サブアカウントを作成'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>サブアカを削除しますか？</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              「{confirmDelete.displayName || confirmDelete.username}」を削除します。<br />この操作は取り消せません。
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--surface2)', border: 'none', fontSize: 15, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={() => handleDelete(confirmDelete.id)} style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--danger)', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
