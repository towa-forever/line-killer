import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function Profile({ currentUser, onUpdate, onLogout, onSwitchAccount, darkMode, onToggleDark, darkAutoMode, onToggleAuto }) {
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
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [subAccounts, setSubAccounts] = useState([]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subForm, setSubForm] = useState({ username:'', password:'', displayName:'' });
  const [subError, setSubError] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  // QRスキャン
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrResult, setQrResult] = useState('');
  const [qrSending, setQrSending] = useState(false);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const qrInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
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
      if (coverFile)  formData.append('cover', coverFile);
      const res = await axios.patch('/api/users/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUpdate(res.data);
      setMessage('プロフィールを更新しました！');
      setEditing(false);
      setAvatarFile(null); setAvatarPreview(null);
      setCoverFile(null);  setCoverPreview(null);
    } catch (err) {
      setMessage('更新に失敗しました');
    } finally { setSaving(false); }
  };

  // QRコード画像からユーザー名を読み取り
  const handleQrImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // QRコードの画像をcanvasで読み取る
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser').catch(() => null);
      if (BrowserQRCodeReader) {
        const reader = new BrowserQRCodeReader();
        const imgUrl = URL.createObjectURL(file);
        const result = await reader.decodeFromImageUrl(imgUrl);
        const text = result.getText();
        handleQrValue(text);
        return;
      }
    } catch (_) {}
    // zxingが使えない場合はファイルをFormDataで送る
    setMessage('QRコードの読み取りには別の方法をお試しください');
  };

  const handleQrValue = async (text) => {
    // linekiller://add/USERNAME or just USERNAME
    const match = text.match(/linekiller:\/\/add\/(.+)/) || text.match(/^([a-zA-Z0-9_]+)$/);
    const username = match?.[1]?.trim();
    if (!username) { setMessage('有効なQRコードではありません'); return; }
    setQrResult(username);
    setQrSending(true);
    try {
      const res = await axios.post('/api/friends/by-qr', { username });
      setMessage(res.data.message || '友達申請を送りました！');
    } catch (e) {
      setMessage(e.response?.data?.error || '申請に失敗しました');
    } finally { setQrSending(false); setShowQrScanner(false); }
  };

  // カメラQRスキャン（スマホ向け）
  const handleCameraQr = () => {
    // input type=file でカメラを使う（モバイル向け）
    qrInputRef.current?.click();
  };

  const avatarSrc  = avatarPreview  || (currentUser.avatar     ? (currentUser.avatar.startsWith('http') ? currentUser.avatar : `${SERVER_URL}${currentUser.avatar}`) : null);
  const coverSrc   = coverPreview   || (currentUser.coverImage ? (currentUser.coverImage.startsWith('http') ? currentUser.coverImage : `${SERVER_URL}${currentUser.coverImage}`) : null);

  const FRAMES = [{id:'none',label:'なし'},{id:'gold',label:'✨ ゴールド'},{id:'rainbow',label:'🌈 レインボー'},{id:'heart',label:'💗 ハート'},{id:'blue',label:'💙 ブルー'},{id:'glow',label:'💚 グロー'}];
  const SOUNDS = [
    {id:'default', label:'🎵 デフォルト'},
    {id:'pop',     label:'🎈 ポップ'},
    {id:'soft',    label:'🎶 ソフト'},
    {id:'chime',   label:'🔔 チャイム'},
    {id:'nature',  label:'🌿 ナチュラル'},
    {id:'mute',    label:'🔇 ミュート'},
  ];

  return (
    <div className="page" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      {/* ログアウト確認 */}
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

      {/* プロフィールカード */}
      <div className="card" style={{ margin:10, padding:0, overflow:'hidden' }}>
        {/* 背景画像エリア */}
        <div style={{ position:'relative', height:120, background: coverSrc ? 'transparent' : 'linear-gradient(135deg, var(--primary), #6c3483)', overflow:'hidden' }}>
          {coverSrc && <img src={coverSrc} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
          {editing && (
            <button onClick={() => coverInputRef.current?.click()} style={{
              position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.6)', color:'white',
              border:'none', borderRadius:20, padding:'5px 12px', fontSize:12, cursor:'pointer'
            }}>🖼️ 背景を変更</button>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleCoverChange} />
        </div>

        {/* アバター + 名前 */}
        <div style={{ padding:'0 16px 16px', textAlign:'center' }}>
          <div style={{ position:'relative', display:'inline-block', marginTop:-40, marginBottom:8 }}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--surface)' }} />
            ) : (
              <div className="profile-avatar">{currentUser.displayName?.[0] || currentUser.username?.[0] || '?'}</div>
            )}
            {editing && (
              <button onClick={() => fileInputRef.current?.click()} style={{
                position:'absolute', bottom:0, right:0, width:26, height:26, borderRadius:'50%',
                background:'var(--primary)', color:'white', fontSize:14, border:'2px solid var(--surface)', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>📷</button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleAvatarChange} />
          </div>

          {editing ? (
            <>
              <input className="form-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="表示名" style={{ marginTop:4 }} />
              <textarea className="form-input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="自己紹介..." rows={3} style={{ resize:'none' }} />
              <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
                <button className="btn btn-secondary" onClick={() => { setEditing(false); setAvatarPreview(null); setAvatarFile(null); setCoverPreview(null); setCoverFile(null); }}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="profile-name">{currentUser.displayName || currentUser.username}</div>
              <div className="profile-username">@{currentUser.username}</div>
              {currentUser.bio && <div className="profile-bio">{currentUser.bio}</div>}
              <button className="btn btn-secondary" style={{ marginTop:12 }} onClick={() => setEditing(true)}>✏️ 編集</button>
            </>
          )}
          {message && <div style={{ marginTop:10, fontSize:13, color:'var(--primary)' }}>{message}</div>}
        </div>
      </div>

      {/* QRコード */}
      <div className="card" style={{ margin:10, textAlign:'center' }}>
        <div className="profile-section-title">マイQRコード</div>
        <div style={{ display:'inline-block', padding:12, background:'white', borderRadius:8, marginTop:8 }}>
          <QRCode value={`linekiller://add/${currentUser.username}`} size={150} level="H" />
        </div>
        <p style={{ marginTop:8, fontSize:12, color:'var(--text2)' }}>QRを読み取って友達追加</p>
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:8 }}>
          <button className="btn btn-primary" onClick={handleCameraQr} disabled={qrSending}>
            {qrSending ? '送信中...' : '📷 QRを読み取る'}
          </button>
        </div>
        {/* QR画像アップロード用（カメラまたはファイル） */}
        <input ref={qrInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleQrImageUpload} />
        {qrResult && <div style={{ marginTop:8, fontSize:13, color:'var(--text2)' }}>読み取り: @{qrResult}</div>}
      </div>

      {/* 設定 */}
      <div className="card" style={{ margin:10 }}>
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

        {/* ステータス */}
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
            {FRAMES.map(f => (
              <button key={f.id} onClick={() => { setSelectedFrame(f.id); saveSettings({ avatarFrame: f.id }); }}
                style={{ padding:'6px 12px', borderRadius:20, fontSize:12, border:'2px solid', cursor:'pointer',
                  borderColor: selectedFrame === f.id ? 'var(--primary)' : 'var(--border)',
                  background: selectedFrame === f.id ? 'var(--primary)' : 'var(--surface2)',
                  color: selectedFrame === f.id ? 'white' : 'var(--text)' }}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* 通知音 */}
        <div style={{ padding:'12px 0' }}>
          <div style={{ fontSize:13, marginBottom:8 }}>🔊 通知音テーマ</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {SOUNDS.map(s => (
              <button key={s.id} onClick={() => { setSelectedSound(s.id); saveSettings({ soundTheme: s.id }); }}
                style={{ padding:'6px 12px', borderRadius:20, fontSize:12, border:'2px solid', cursor:'pointer',
                  borderColor: selectedSound === s.id ? 'var(--primary)' : 'var(--border)',
                  background: selectedSound === s.id ? 'var(--primary)' : 'var(--surface2)',
                  color: selectedSound === s.id ? 'white' : 'var(--text)' }}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* アプリアイコン変更 */}
      <div className="card" style={{ margin:10 }}>
        <div className="profile-section-title">🏠 アプリアイコン</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>ホーム画面に追加する際のアイコンを選択</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            { id:'default', emoji:'💬', label:'デフォルト' },
            { id:'green',   emoji:'🟢', label:'グリーン' },
            { id:'dark',    emoji:'🌙', label:'ダーク' },
            { id:'pink',    emoji:'🌸', label:'ピンク' },
            { id:'fire',    emoji:'🔥', label:'レッド' },
          ].map(icon => {
            const current = localStorage.getItem('appIcon') || 'default';
            return (
              <button key={icon.id} onClick={() => {
                localStorage.setItem('appIcon', icon.id);
                window.dispatchEvent(new CustomEvent('appIconChange', { detail: icon.id }));
              }}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 12px', borderRadius:12, border:'2px solid',
                  borderColor: current===icon.id ? 'var(--primary)' : 'var(--border)',
                  background: current===icon.id ? 'rgba(var(--primary-rgb),0.1)' : 'var(--surface2)', cursor:'pointer' }}>
                <span style={{ fontSize:28 }}>{icon.emoji}</span>
                <span style={{ fontSize:11 }}>{icon.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:11, color:'var(--text2)', marginTop:8 }}>
          💡 ホーム画面に追加後は再追加が必要です
        </div>
      </div>

      {/* ===== サブアカウント ===== */}
      <SubAccountSection
        currentUser={currentUser}
        subAccounts={subAccounts}
        setSubAccounts={setSubAccounts}
        showSubModal={showSubModal}
        setShowSubModal={setShowSubModal}
        subForm={subForm}
        setSubForm={setSubForm}
        subError={subError}
        setSubError={setSubError}
        subLoading={subLoading}
        setSubLoading={setSubLoading}
        onSwitchAccount={onSwitchAccount}
      />

      <div style={{ padding:'0 10px 20px' }}>
        <button className="btn btn-danger" style={{ width:'100%', padding:12 }} onClick={() => setShowLogoutConfirm(true)}>
          ログアウト
        </button>
      </div>

      <style>{`
        .profile-avatar { width:80px; height:80px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:36px; font-weight:700; margin:0 auto; border:3px solid var(--surface); }
        .profile-name { font-size:22px; font-weight:700; }
        .profile-username { font-size:14px; color:var(--text2); margin-top:4px; }
        .profile-bio { font-size:13px; color:var(--text2); margin-top:8px; line-height:1.5; }
        .profile-section-title { font-size:13px; font-weight:700; color:var(--text2); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px; }
        .setting-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; cursor:pointer; font-size:15px; border-bottom:1px solid var(--border); }
        .toggle { width:44px; height:24px; border-radius:12px; background:var(--border); position:relative; transition:background 0.3s; flex-shrink:0; }
        .toggle.on { background:var(--primary); }
        .toggle-knob { width:20px; height:20px; border-radius:50%; background:white; position:absolute; top:2px; left:2px; transition:left 0.3s; box-shadow:0 1px 4px rgba(0,0,0,0.2); }
        .toggle.on .toggle-knob { left:22px; }
      `}</style>
    </div>
  );
}

function SubAccountSection({ currentUser, subAccounts, setSubAccounts, showSubModal, setShowSubModal, subForm, setSubForm, subError, setSubError, subLoading, setSubLoading, onSwitchAccount }) {
  const isSubAccount = !!currentUser?.parentAccountId;

  useEffect(() => {
    if (isSubAccount) return;
    axios.get('/api/sub-accounts').then(r => setSubAccounts(r.data)).catch(() => {});
  }, [isSubAccount, setSubAccounts]);

  const createSub = async () => {
    if (!subForm.username.trim() || !subForm.password.trim()) { setSubError('IDとパスワードは必須です'); return; }
    setSubLoading(true); setSubError('');
    try {
      const res = await axios.post('/api/sub-accounts', subForm);
      setSubAccounts(p => [...p, res.data.sub]);
      setShowSubModal(false);
      setSubForm({ username:'', password:'', displayName:'' });
    } catch (e) { setSubError(e.response?.data?.error || '作成に失敗しました'); }
    finally { setSubLoading(false); }
  };

  const deleteSub = async (subId) => {
    if (!window.confirm('このサブアカウントを削除しますか？')) return;
    try {
      await axios.delete(`/api/sub-accounts/${subId}`);
      setSubAccounts(p => p.filter(s => s.id !== subId));
    } catch {}
  };

  const switchTo = async (subId) => {
    try {
      const res = await axios.post(`/api/sub-accounts/${subId}/switch`);
      onSwitchAccount?.(res.data.token, res.data.user);
    } catch {}
  };

  const switchToParent = async () => {
    try {
      const res = await axios.post(`/api/sub-accounts/${currentUser.id}/switch`);
      onSwitchAccount?.(res.data.token, res.data.user);
    } catch {}
  };

  return (
    <div className="card" style={{ margin:10 }}>
      {/* サブアカ作成モーダル */}
      {showSubModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setShowSubModal(false)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:340 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>➕ サブアカウント作成</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>新しいアカウントを追加します</div>
            <input className="form-input" placeholder="ID（ユーザー名）*" value={subForm.username}
              onChange={e => setSubForm(p => ({...p, username: e.target.value}))} style={{ marginBottom:10 }} />
            <input className="form-input" placeholder="表示名（省略可）" value={subForm.displayName}
              onChange={e => setSubForm(p => ({...p, displayName: e.target.value}))} style={{ marginBottom:10 }} />
            <input className="form-input" type="password" placeholder="パスワード*" value={subForm.password}
              onChange={e => setSubForm(p => ({...p, password: e.target.value}))} style={{ marginBottom: subError ? 6 : 16 }} />
            {subError && <div style={{ fontSize:12, color:'var(--danger)', marginBottom:12 }}>{subError}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowSubModal(false)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={createSub} disabled={subLoading} style={{ flex:1, padding:12, borderRadius:12, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {subLoading ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="profile-section-title">👤 アカウント管理</div>

      {/* 現在のアカウント */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'0.5px solid var(--border)', marginBottom:8 }}>
        <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700 }}>
          {(currentUser?.displayName||currentUser?.username||'?')[0]}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>{currentUser?.displayName || currentUser?.username}</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>@{currentUser?.username} {isSubAccount ? '（サブアカ）' : '（メイン）'}</div>
        </div>
        <span style={{ fontSize:11, background:'#06c755', color:'white', borderRadius:20, padding:'2px 10px', fontWeight:700 }}>使用中</span>
      </div>

      {/* サブアカ一覧 */}
      {!isSubAccount && subAccounts.map(sub => (
        <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#3498db,#2980b9)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700 }}>
            {(sub.displayName||sub.username||'?')[0]}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600 }}>{sub.displayName || sub.username}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>@{sub.username}</div>
          </div>
          <button onClick={() => switchTo(sub.id)}
            style={{ padding:'6px 14px', borderRadius:20, background:'#06c755', color:'white', border:'none', fontSize:12, fontWeight:700, cursor:'pointer', marginRight:4 }}>
            切替
          </button>
          <button onClick={() => deleteSub(sub.id)}
            style={{ padding:'6px 10px', borderRadius:20, background:'var(--surface2)', border:'1px solid var(--border)', fontSize:12, cursor:'pointer', color:'var(--danger)' }}>
            🗑️
          </button>
        </div>
      ))}

      {/* サブアカからメインに戻る */}
      {isSubAccount && (
        <button onClick={switchToParent}
          style={{ width:'100%', padding:'10px 0', borderRadius:12, background:'var(--surface2)', border:'1.5px solid var(--border)', fontSize:14, cursor:'pointer', marginBottom:8 }}>
          ← メインアカウントに戻る
        </button>
      )}

      {/* 追加ボタン */}
      {!isSubAccount && (
        <button onClick={() => setShowSubModal(true)}
          style={{ width:'100%', padding:'10px 0', borderRadius:12, background:'var(--surface2)', border:'1.5px dashed var(--border)', fontSize:14, cursor:'pointer', color:'var(--text2)', marginTop:8 }}>
          ➕ サブアカウントを追加（{subAccounts.length}/5）
        </button>
      )}
    </div>
  );
}
