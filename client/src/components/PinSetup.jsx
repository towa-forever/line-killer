import React, { useState } from 'react';
import axios from 'axios';

// PIN設定・変更コンポーネント
export function PinSetup({ enabled, onClose }) {
  const [pin, setPin]       = useState('');
  const [pin2, setPin2]     = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState('');

  const save = async () => {
    if (!/^\d{4,6}$/.test(pin)) { setError('PINは4〜6桁の数字にしてください'); return; }
    if (pin !== pin2) { setError('PINが一致しません'); return; }
    setSaving(true); setError('');
    try {
      await axios.post('/api/auth/pin/setup', { pin });
      setDone(true);
    } catch (e) { setError(e.response?.data?.error || '設定に失敗しました'); }
    finally { setSaving(false); }
  };

  const disable = async () => {
    if (!window.confirm('2段階認証を無効にしますか？')) return;
    await axios.post('/api/auth/pin/disable');
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:480, paddingBottom:'calc(24px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ fontSize:17, fontWeight:800 }}>🔒 2段階認証（PIN）</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:48, marginBottom:8 }}>🔒</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>PIN設定完了！</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>次回ログイン時からPINが必要になります</div>
            <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>閉じる</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.7 }}>
              {enabled ? 'PINを変更できます。無効にする場合は下のボタンをタップ。' : 'ログイン時に追加で4〜6桁のPINを入力する2段階認証を設定します。'}
            </div>
            {/* PIN入力（大きな数字ボタン） */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>新しいPIN（4〜6桁）</div>
              <input type="tel" className="form-input" placeholder="例: 1234" value={pin} maxLength={6}
                onChange={e => setPin(e.target.value.replace(/\D/g,''))} style={{ letterSpacing:8, fontSize:24, textAlign:'center' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>PIN（確認）</div>
              <input type="tel" className="form-input" placeholder="もう一度入力" value={pin2} maxLength={6}
                onChange={e => setPin2(e.target.value.replace(/\D/g,''))} style={{ letterSpacing:8, fontSize:24, textAlign:'center' }} />
            </div>
            {error && <div style={{ fontSize:12, color:'#c0392b', background:'#fff0f0', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>⚠️ {error}</div>}
            <button onClick={save} disabled={saving}
              style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom: enabled ? 10 : 0 }}>
              {saving ? '設定中…' : '🔒 PINを設定'}
            </button>
            {enabled && (
              <button onClick={disable}
                style={{ width:'100%', padding:12, borderRadius:24, background:'none', color:'var(--danger)', border:'1px solid var(--danger)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                2段階認証を無効にする
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// PIN入力モーダル（ログイン後の確認用）
export function PinVerify({ onSuccess, onCancel }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (!pin) { setError('PINを入力してください'); return; }
    setLoading(true); setError('');
    try {
      await axios.post('/api/auth/pin/verify', { pin });
      onSuccess();
    } catch (e) { setError('PINが違います'); setPin(''); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#06c755,#03a040)', zIndex:99999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32 }}>
      <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
      <div style={{ fontSize:22, fontWeight:800, color:'white', marginBottom:6 }}>PIN入力</div>
      <div style={{ fontSize:14, color:'rgba(255,255,255,0.8)', marginBottom:32 }}>2段階認証のPINを入力してください</div>
      <div style={{ background:'white', borderRadius:20, padding:24, width:'100%', maxWidth:300 }}>
        <input type="tel" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))} maxLength={6}
          style={{ width:'100%', padding:'16px 0', textAlign:'center', fontSize:36, letterSpacing:12, border:'none', outline:'none', color:'#333', boxSizing:'border-box' }}
          placeholder="••••" autoFocus onKeyDown={e => e.key === 'Enter' && verify()} />
        {error && <div style={{ fontSize:12, color:'#c0392b', textAlign:'center', marginTop:8 }}>{error}</div>}
        <button onClick={verify} disabled={loading}
          style={{ width:'100%', marginTop:16, padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:16, fontWeight:700, cursor:'pointer' }}>
          {loading ? '確認中…' : '確認'}
        </button>
      </div>
      <button onClick={onCancel} style={{ marginTop:20, color:'rgba(255,255,255,0.7)', background:'none', border:'none', fontSize:14, cursor:'pointer' }}>
        ログアウト
      </button>
    </div>
  );
}
