import React, { useState } from 'react';
import axios from 'axios';

export default function PasswordReset({ onClose, onSuccess, onBack }) {
  const handleClose = onBack || onClose || (() => {});
  const [step, setStep] = useState('username'); // username → email → reset → done
  const [username, setUsername] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [email, setEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchEmail = async () => {
    if (!username.trim()) { setError('IDを入力してください'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.get(`/api/auth/recovery-email/${username.trim()}`);
      setMaskedEmail(res.data.maskedEmail);
      setStep('email');
    } catch (e) {
      setError(e.response?.data?.error || 'リカバリーメールが設定されていません');
    } finally { setLoading(false); }
  };

  const resetPassword = async () => {
    if (!email.trim()) { setError('メールアドレスを入力してください'); return; }
    if (!newPass) { setError('新しいパスワードを入力してください'); return; }
    if (newPass !== newPass2) { setError('パスワードが一致しません'); return; }
    setLoading(true); setError('');
    try {
      await axios.post('/api/auth/reset-password', {
        username: username.trim(), email: email.trim(), newPassword: newPass,
      });
      setStep('done');
    } catch (e) {
      setError(e.response?.data?.error || 'リセットに失敗しました');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={handleClose}>
      <div style={{ background:'var(--surface)', borderRadius:20, padding:28, width:'100%', maxWidth:360 }}
        onClick={e => e.stopPropagation()}>

        {step === 'done' ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>パスワードを変更しました</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:24 }}>新しいパスワードでログインしてください</div>
            <button onClick={handleClose} style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
              ログインへ
            </button>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
              {step !== 'username' && (
                <button onClick={() => { setStep('username'); setError(''); }} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text2)', padding:'0 4px' }}>←</button>
              )}
              <div style={{ fontSize:18, fontWeight:800, flex:1 }}>🔑 パスワードを忘れた</div>
              <button onClick={handleClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text2)' }}>✕</button>
            </div>

            {step === 'username' && (
              <>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.7 }}>
                  登録したIDを入力してください。<br/>リカバリーメールで本人確認を行います。
                </div>
                <input className="form-input" placeholder="ID" value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchEmail()}
                  style={{ marginBottom:16 }} autoFocus autoCapitalize="none" />
                {error && <div style={{ fontSize:12, color:'#c0392b', marginBottom:12, background:'#fff0f0', borderRadius:8, padding:'8px 12px' }}>⚠️ {error}</div>}
                <button onClick={fetchEmail} disabled={loading}
                  style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                  {loading ? '確認中…' : '次へ'}
                </button>
              </>
            )}

            {step === 'email' && (
              <>
                <div style={{ background:'var(--bg)', borderRadius:12, padding:'12px 14px', marginBottom:16, fontSize:14 }}>
                  📧 リカバリーメール: <strong>{maskedEmail}</strong>
                </div>
                <input className="form-input" type="email" placeholder="メールアドレスを入力" value={email}
                  onChange={e => setEmail(e.target.value)} style={{ marginBottom:12 }} />
                <div style={{ position:'relative', marginBottom:12 }}>
                  <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="新しいパスワード" value={newPass}
                    onChange={e => setNewPass(e.target.value)} style={{ marginBottom:0, paddingRight:44 }} />
                  <button type="button" onClick={() => setShowPw(v=>!v)}
                    style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text2)' }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                <input type="password" className="form-input" placeholder="パスワード（確認）" value={newPass2}
                  onChange={e => setNewPass2(e.target.value)} style={{ marginBottom:16 }} />
                {error && <div style={{ fontSize:12, color:'#c0392b', marginBottom:12, background:'#fff0f0', borderRadius:8, padding:'8px 12px' }}>⚠️ {error}</div>}
                <button onClick={resetPassword} disabled={loading}
                  style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                  {loading ? 'リセット中…' : '🔑 パスワードを変更'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
