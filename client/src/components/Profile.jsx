import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function Profile({ currentUser, onUpdate, onLogout, darkMode, onToggleDark, darkAutoMode, onToggleAuto }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [saving, setSaving] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(currentUser.avatarFrame || 'none');
  const [selectedSound, setSelectedSound] = useState(currentUser.soundTheme || 'default');
  const [statusText, setStatusText] = useState(currentUser.status || '');
  const [message, setMessage] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef(null);

  // パスワード変更
  const [showPwChange, setShowPwChange] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // OAuth連携
  const [oauthAccounts, setOauthAccounts] = useState([]);
  const [oauthMessage, setOauthMessage] = useState('');

  const [availableProviders, setAvailableProviders] = useState([]);

  useEffect(() => {
    axios.get('/api/auth/oauth-accounts')
      .then(res => setOauthAccounts(res.data))
      .catch(() => {});
    axios.get('/api/auth/providers')
      .then(res => setAvailableProviders(res.data.providers || []))
      .catch(() => setAvailableProviders([]));
  }, []);

  // OAuth連携状況取得
  React.useEffect(() => {
    axios.get('/api/auth/oauth-accounts')
      .then(r => setOauthAccounts(r.data))
      .catch(() => {});
  }, []);

  const handleChangePassword = async () => {
    if (!newPw || !confirmPw) { setPwMessage('新しいパスワードを入力してください'); return; }
    if (newPw !== confirmPw) { setPwMessage('新しいパスワードが一致しません'); return; }
    if (newPw.length < 6) { setPwMessage('6文字以上にしてください'); return; }
    setPwSaving(true); setPwMessage('');
    try {
      await axios.post('/api/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setPwMessage('✅ パスワードを変更しました！');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setShowPwChange(false); setPwMessage(''); }, 2000);
    } catch (err) {
      setPwMessage('❌ ' + (err.response?.data?.error || '変更に失敗しました'));
    } finally { setPwSaving(false); }
  };

  const handleOAuthLink = (provider) => {
    const token = localStorage.getItem('token') || '';
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
    window.location.href = `${serverUrl}/api/auth/${provider}?link_token=${encodeURIComponent(token)}`;
  };

  const handleOAuthUnlink = async (provider) => {
    try {
      await axios.delete(`/api/auth/oauth-accounts/${provider}`);
      setOauthAccounts(prev => prev.filter(a => a.provider !== provider));
      setOauthMessage(`${provider}の連携を解除しました`);
      setTimeout(() => setOauthMessage(''), 3000);
    } catch (err) {
      setOauthMessage('❌ ' + (err.response?.data?.error || '解除に失敗しました'));
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // OAuthコールバック後（linked=xxx）のメッセージ処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    const oauthErr = params.get('error');
    if (linked) {
      setOauthMessage(`✅ ${linked}との連携が完了しました！`);
      // URLパラメータを消す
      window.history.replaceState({}, '', '/');
      axios.get('/api/auth/oauth-accounts').then(res => setOauthAccounts(res.data)).catch(() => {});
    } else if (oauthErr?.endsWith('_not_configured')) {
      const p = oauthErr.replace('_not_configured', '');
      setOauthMessage(`❌ ${p}はまだ設定されていません`);
    }
  }, []);

  const handlePasswordChange = async () => {
    if (!newPw || !confirmPw) { setPwMessage('新しいパスワードを入力してください'); return; }
    if (newPw !== confirmPw) { setPwMessage('新しいパスワードが一致しません'); return; }
    if (newPw.length < 6) { setPwMessage('6文字以上にしてください'); return; }
    setPwSaving(true); setPwMessage('');
    try {
      await axios.post('/api/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setPwMessage('✅ パスワードを変更しました！');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setShowPwChange(false); setPwMessage(''); }, 2000);
    } catch(e) {
      setPwMessage('❌ ' + (e.response?.data?.error || '変更に失敗しました'));
    } finally { setPwSaving(false); }
  };

  const saveSettings = async (updates) => {
    try {
      const res = await axios.patch('/api/users/me', updates);
      onUpdate(res.data);
    } catch(e) { console.error(e); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('displayName', displayName);
      formData.append('bio', bio);
      if (avatarFile) formData.append('avatar', avatarFile);
      const res = await axios.patch('/api/users/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUpdate(res.data);
      setMessage('プロフィールを更新しました！');
      setEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      setMessage('更新に失敗しました');
    } finally { setSaving(false); }
  };

  const avatarSrc = avatarPreview || (currentUser.avatar ? `${SERVER_URL}${currentUser.avatar}` : null);

  return (
    <div className="page">
      {showLogoutConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setShowLogoutConfirm(false)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:300 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, textAlign:'center', marginBottom:8 }}>ログアウト</div>
            <div style={{ fontSize:14, color:'var(--text2)', textAlign:'center', marginBottom:20 }}>ログアウトしますか？</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={onLogout} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>ログアウト</button>
            </div>
          </div>
        </div>
      )}
      <div className="page-header">プロフィール</div>

      <div className="card" style={{ margin: 10, textAlign: 'center' }}>
        {/* アバター */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
          {avatarSrc ? (
            <img src={avatarSrc} alt="avatar" style={{
              width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
              border: '3px solid var(--primary)'
            }} />
          ) : (
            <div className="profile-avatar">{currentUser.displayName?.[0] || currentUser.username?.[0] || '?'}</div>
          )}
          {editing && (
            <button onClick={() => fileInputRef.current?.click()} style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--primary)', color: 'white',
              fontSize: 14, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>📷</button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={handleAvatarChange} />
        </div>

        {editing ? (
          <>
            <input className="form-input" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名" style={{ marginTop: 4 }} />
            <textarea className="form-input" value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="自己紹介..." rows={3} style={{ resize: 'none' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => {
                setEditing(false); setAvatarPreview(null); setAvatarFile(null);
              }}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="profile-name">{currentUser.displayName || currentUser.username}</div>
            <div className="profile-username">@{currentUser.username}</div>
            {currentUser.bio && <div className="profile-bio">{currentUser.bio}</div>}
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
              ✏️ 編集
            </button>
          </>
        )}
        {message && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--primary)' }}>{message}</div>}
      </div>

      <div className="card" style={{ margin: 10, textAlign: 'center' }}>
        <div className="profile-section-title">マイQRコード</div>
        <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 8, marginTop: 8 }}>
          <QRCode value={`linekiller://add/${currentUser.username}`} size={150} level="H" />
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>QRコードを読み取って友達追加</p>
      </div>

      <div className="card" style={{ margin: 10 }}>
        <div className="profile-section-title">設定</div>
        <div className="setting-row" onClick={onToggleDark}>
          <span>🌙 ダークモード</span>
          <div className={`toggle ${darkMode ? 'on' : ''}`}><div className="toggle-knob" /></div>
        </div>
        <div className="setting-row" onClick={onToggleAuto}>
          <div>
            <div>📱 システム連動</div>
            <div style={{ fontSize:11, color:'var(--text2)' }}>OSのダークモードに自動で合わせる</div>
          </div>
          <div className={`toggle ${darkAutoMode ? 'on' : ''}`}><div className="toggle-knob" /></div>
        </div>

        {/* ステータスメッセージ */}
        <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, marginBottom:6 }}>💬 ステータスメッセージ</div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={statusText} onChange={e => setStatusText(e.target.value)} placeholder="一言を入力..." className="form-input" style={{ flex:1, marginBottom:0, fontSize:13 }} maxLength={40} />
            <button onClick={() => saveSettings({ status: statusText })} style={{ padding:'0 12px', borderRadius:10, background:'var(--primary)', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>保存</button>
          </div>
        </div>

        {/* アバターフレーム */}
        <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, marginBottom:8 }}>🖼️ アバターフレーム</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[{id:'none',label:'なし'},{id:'gold',label:'✨'},{id:'rainbow',label:'🌈'},{id:'heart',label:'💗'},{id:'blue',label:'💙'},{id:'glow',label:'💚'}].map(f => (
              <button key={f.id} onClick={() => { setSelectedFrame(f.id); saveSettings({ avatarFrame: f.id }); }}
                style={{ padding:'6px 12px', borderRadius:20, fontSize:13, border:'2px solid', cursor:'pointer',
                  borderColor: selectedFrame === f.id ? 'var(--primary)' : 'var(--border)',
                  background: selectedFrame === f.id ? 'var(--primary)' : 'var(--surface2)',
                  color: selectedFrame === f.id ? 'white' : 'var(--text)', fontWeight: selectedFrame === f.id ? 700 : 400
                }}>{f.label} {f.id === 'none' ? 'なし' : f.id}</button>
            ))}
          </div>
        </div>

        {/* サウンドテーマ */}
        <div style={{ padding:'12px 0' }}>
          <div style={{ fontSize:13, marginBottom:8 }}>🔊 サウンドテーマ</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[{id:'default',label:'🎵 デフォルト'},{id:'pop',label:'🎈 ポップ'},{id:'soft',label:'🎶 ソフト'},{id:'mute',label:'🔇 ミュート'}].map(s => (
              <button key={s.id} onClick={() => { setSelectedSound(s.id); saveSettings({ soundTheme: s.id }); }}
                style={{ padding:'6px 12px', borderRadius:20, fontSize:13, border:'2px solid', cursor:'pointer',
                  borderColor: selectedSound === s.id ? 'var(--primary)' : 'var(--border)',
                  background: selectedSound === s.id ? 'var(--primary)' : 'var(--surface2)',
                  color: selectedSound === s.id ? 'white' : 'var(--text)', fontWeight: selectedSound === s.id ? 700 : 400
                }}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* パスワード変更 */}
      <div className="card" style={{ margin: 10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: showPwChange ? 14 : 0 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>🔑 パスワード変更</div>
          <button onClick={() => { setShowPwChange(f => !f); setPwMessage(''); }}
            style={{ fontSize:13, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
            {showPwChange ? '閉じる' : '変更する'}
          </button>
        </div>
        {showPwChange && (
          <div>
            <input type="password" className="form-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              placeholder="現在のパスワード（OAuth専用の場合は空白でOK）" style={{ marginBottom:8 }} />
            <input type="password" className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="新しいパスワード（6文字以上）" style={{ marginBottom:8 }} />
            <input type="password" className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              placeholder="新しいパスワード（確認）" style={{ marginBottom:10 }} />
            {pwMessage && (
              <div style={{ fontSize:13, color: pwMessage.startsWith('✅') ? 'var(--primary)' : 'var(--danger)', marginBottom:10, textAlign:'center' }}>
                {pwMessage}
              </div>
            )}
            <button onClick={handleChangePassword} disabled={pwSaving}
              style={{ width:'100%', padding:11, borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor:pwSaving ? 'not-allowed' : 'pointer' }}>
              {pwSaving ? '変更中...' : 'パスワードを変更'}
            </button>
          </div>
        )}
      </div>

      {/* 外部アカウント連携 */}
      <div className="card" style={{ margin: 10 }}>
        <div className="profile-section-title">🔗 外部アカウント連携</div>
        {oauthMessage && (
          <div style={{ fontSize:13, color: oauthMessage.startsWith('❌') ? 'var(--danger)' : 'var(--primary)', marginBottom:12, textAlign:'center' }}>
            {oauthMessage}
          </div>
        )}
        {[
          { provider:'google',    label:'Google',    icon:'🔴', bg:'#fff', color:'#333', border:'1px solid #ddd' },
          { provider:'github',    label:'GitHub',    icon:'⚫', bg:'#24292e', color:'#fff', border:'none' },
          { provider:'microsoft', label:'Microsoft', icon:'🔷', bg:'#0078d4', color:'#fff', border:'none' },
        ].map(({ provider, label, icon, bg, color, border }) => {
          const linked = oauthAccounts.some(a => a.provider === provider);
          return (
            <div key={provider} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{label}</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>{linked ? '✅ 連携済み' : '未連携'}</div>
                </div>
              </div>
              {linked ? (
                <button onClick={() => handleOAuthUnlink(provider)}
                  style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, background:'none', border:'1px solid var(--danger)', color:'var(--danger)', cursor:'pointer' }}>
                  連携解除
                </button>
              ) : (
                <button onClick={() => handleOAuthLink(provider)}
                  style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, background:bg, color, border, cursor:'pointer' }}>
                  連携する
                </button>
              )}
            </div>
          );
        })}
        <div style={{ fontSize:11, color:'var(--text2)', marginTop:10, lineHeight:1.6 }}>
          連携するとそのアカウントでもログインできます。<br/>
          ※ パスワードなし・連携1つの場合は解除できません。
        </div>
      </div>

      <div style={{ padding: '0 10px 20px' }}>
        <button className="btn btn-danger" style={{ width: '100%', padding: 12 }}
          onClick={() => setShowLogoutConfirm(true)}>
          ログアウト
        </button>
      </div>

      <style>{`
        .profile-avatar { width: 80px; height: 80px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; margin: 0 auto; }
        .profile-name { font-size: 22px; font-weight: 700; }
        .profile-username { font-size: 14px; color: var(--text2); margin-top: 4px; }
        .profile-bio { font-size: 13px; color: var(--text2); margin-top: 8px; line-height: 1.5; }
        .profile-section-title { font-size: 14px; font-weight: 700; color: var(--text2); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; cursor: pointer; font-size: 15px; }
        .toggle { width: 44px; height: 24px; border-radius: 12px; background: var(--border); position: relative; transition: background 0.3s; }
        .toggle.on { background: var(--primary); }
        .toggle-knob { width: 20px; height: 20px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: left 0.3s; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .toggle.on .toggle-knob { left: 22px; }
      `}</style>
    </div>
  );
}
