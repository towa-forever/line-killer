import React, { useState } from 'react';
import axios from 'axios';

const QUESTIONS = [
  'ペットの名前は？',
  '小学校の名前は？',
  '母親の旧姓は？',
  '好きな食べ物は？',
  '初めて買ったゲームのタイトルは？',
  '生まれた病院の名前は？',
  '親友の名前は？',
];

export default function PasswordReset({ onClose, onSuccess, onBack }) {
  // onBackがあればonCloseとして使う
  const handleClose = onBack || onClose || (() => {});
  const [step, setStep]       = useState('username'); // username → question → reset → done
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer]   = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const fetchQuestion = async () => {
    if (!username.trim()) { setError('IDを入力してください'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.get(`/api/auth/secret-question/${username.trim()}`);
      setQuestion(res.data.question);
      setStep('question');
    } catch (e) {
      setError(e.response?.data?.error || '秘密の質問が設定されていません');
    } finally { setLoading(false); }
  };

  const resetPassword = async () => {
    if (!answer.trim()) { setError('答えを入力してください'); return; }
    if (newPass.length < 6) { setError('パスワードは6文字以上にしてください'); return; }
    if (newPass !== newPass2) { setError('パスワードが一致しません'); return; }
    setLoading(true); setError('');
    try {
      await axios.post('/api/auth/reset-password', {
        username: username.trim(), answer: answer.trim(), newPassword: newPass,
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
                  登録したIDを入力してください。<br/>秘密の質問で本人確認を行います。
                </div>
                <input className="form-input" placeholder="ID（@なし）" value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchQuestion()}
                  style={{ marginBottom:16 }} autoFocus />
                {error && <div style={{ fontSize:12, color:'#c0392b', marginBottom:12, background:'#fff0f0', borderRadius:8, padding:'8px 12px' }}>⚠️ {error}</div>}
                <button onClick={fetchQuestion} disabled={loading}
                  style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                  {loading ? '確認中…' : '次へ'}
                </button>
              </>
            )}

            {step === 'question' && (
              <>
                <div style={{ background:'var(--bg)', borderRadius:12, padding:'12px 14px', marginBottom:16, fontSize:14, fontWeight:600 }}>
                  🤔 {question}
                </div>
                <input className="form-input" placeholder="答え" value={answer}
                  onChange={e => setAnswer(e.target.value)} style={{ marginBottom:12 }} />
                <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>新しいパスワード</div>
                <input type="password" className="form-input" placeholder="6文字以上" value={newPass}
                  onChange={e => setNewPass(e.target.value)} style={{ marginBottom:12 }} />
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

// 秘密の質問設定コンポーネント（プロフィールから使う）
export function SecretQuestionSetup({ onClose }) {
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [customQ, setCustomQ]   = useState('');
  const [answer, setAnswer]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  const save = async () => {
    const q = question === 'custom' ? customQ.trim() : question;
    if (!q) { setError('質問を入力してください'); return; }
    if (!answer.trim()) { setError('答えを入力してください'); return; }
    setSaving(true); setError('');
    try {
      await axios.post('/api/auth/secret-question', { question: q, answer: answer.trim() });
      setDone(true);
    } catch (e) { setError(e.response?.data?.error || '保存に失敗しました'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:480, paddingBottom:'calc(24px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ fontSize:17, fontWeight:800 }}>🔐 秘密の質問を設定</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>設定完了！</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>パスワードを忘れたときに使えます</div>
            <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>閉じる</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>質問を選択</div>
              <select value={question} onChange={e => setQuestion(e.target.value)}
                style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:14, outline:'none' }}>
                {QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                <option value="custom">自由入力</option>
              </select>
            </div>
            {question === 'custom' && (
              <input className="form-input" placeholder="質問を入力" value={customQ}
                onChange={e => setCustomQ(e.target.value)} style={{ marginBottom:12 }} />
            )}
            <input className="form-input" placeholder="答え（後から変更可）" value={answer}
              onChange={e => setAnswer(e.target.value)} style={{ marginBottom:16 }} />
            {error && <div style={{ fontSize:12, color:'#c0392b', background:'#fff0f0', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>⚠️ {error}</div>}
            <button onClick={save} disabled={saving}
              style={{ width:'100%', padding:14, borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
              {saving ? '保存中…' : '💾 保存'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
