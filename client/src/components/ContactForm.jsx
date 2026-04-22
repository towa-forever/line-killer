import React, { useState, useCallback } from 'react';
import axios from 'axios';

const CATEGORIES = [
  { value: 'bug',       label: '🐛 バグ・不具合' },
  { value: 'feature',   label: '✨ 機能のリクエスト' },
  { value: 'account',   label: '👤 アカウントについて' },
  { value: 'privacy',   label: '🔒 プライバシー・安全' },
  { value: 'other',     label: '💬 その他' },
];

export default function ContactForm({ currentUser, onClose }) {
  const [category, setCategory] = useState('');
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = useCallback(async () => {
    if (!category) { setError('カテゴリを選んでください'); return; }
    if (!title.trim()) { setError('件名を入力してください'); return; }
    if (!body.trim() || body.trim().length < 10) { setError('内容を10文字以上入力してください'); return; }
    setSending(true); setError('');
    try {
      await axios.post('/api/contact', {
        category, title: title.trim(), body: body.trim(),
      });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.error || '送信に失敗しました。しばらくしてから再試行してください。');
    } finally { setSending(false); }
  }, [category, title, body]);

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:8000, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* ヘッダー */}
      <div style={{ background:'#06c755', color:'white', padding:'calc(14px + env(safe-area-inset-top)) 16px 14px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'white', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>←</button>
        <span style={{ fontSize:18, fontWeight:800, flex:1 }}>お問い合わせ</span>
      </div>

      {done ? (
        /* 送信完了 */
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, textAlign:'center' }}>
          <div style={{ fontSize:72, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>送信完了！</div>
          <div style={{ fontSize:14, color:'var(--text2)', lineHeight:1.7, marginBottom:32 }}>
            お問い合わせを受け付けました。<br/>
            内容を確認の上、対応いたします。<br/>
            しばらくお待ちください。
          </div>
          <button onClick={onClose} style={{ padding:'13px 40px', borderRadius:24, background:'#06c755', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
            閉じる
          </button>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'20px 16px 40px' }}>
          {/* ユーザー情報 */}
          <div style={{ background:'var(--surface)', borderRadius:14, padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:16, flexShrink:0 }}>
              {(currentUser?.displayName || currentUser?.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>{currentUser?.displayName || currentUser?.username}</div>
              <div style={{ fontSize:12, color:'var(--text2)' }}>@{currentUser?.username}</div>
            </div>
          </div>

          {/* カテゴリ */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--text)' }}>
              カテゴリ <span style={{ color:'#e74c3c' }}>*</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  style={{ padding:'11px 10px', borderRadius:12, fontSize:13, fontWeight:600, cursor:'pointer', textAlign:'left',
                    background: category === cat.value ? 'rgba(6,199,85,0.12)' : 'var(--surface)',
                    border: category === cat.value ? '2px solid #06c755' : '2px solid var(--border)',
                    color: category === cat.value ? '#06c755' : 'var(--text)',
                    transition: 'all 0.15s',
                  }}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 件名 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>件名 <span style={{ color:'#e74c3c' }}>*</span></div>
            <input
              className="form-input"
              placeholder="例: 通話が繋がらない"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              style={{ marginBottom:0 }}
            />
            <div style={{ fontSize:11, color:'var(--text2)', textAlign:'right', marginTop:4 }}>{title.length}/100</div>
          </div>

          {/* 内容 */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>内容 <span style={{ color:'#e74c3c' }}>*</span></div>
            <textarea
              className="form-input"
              placeholder="詳しい状況を教えてください（端末・OS・発生した操作など）"
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={1000}
              rows={6}
              style={{ resize:'none', marginBottom:0, fontFamily:'inherit' }}
            />
            <div style={{ fontSize:11, color:'var(--text2)', textAlign:'right', marginTop:4 }}>{body.length}/1000</div>
          </div>

          {/* エラー */}
          {error && (
            <div style={{ background:'#fff0f0', border:'1px solid #ffd0d0', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#c0392b', marginBottom:16 }}>
              ⚠️ {error}
            </div>
          )}

          {/* 送信ボタン */}
          <button onClick={handleSubmit} disabled={sending}
            style={{ width:'100%', padding:'15px 0', borderRadius:24, background: sending ? '#ccc' : '#06c755', color:'white', border:'none', fontSize:16, fontWeight:800, cursor: sending ? 'not-allowed' : 'pointer', boxShadow:'0 4px 16px rgba(6,199,85,0.3)', transition:'all 0.2s' }}>
            {sending ? '送信中…' : '📨 送信する'}
          </button>

          <div style={{ fontSize:12, color:'var(--text2)', textAlign:'center', marginTop:16, lineHeight:1.6 }}>
            いただいた内容は改善のために活用させていただきます。<br/>
            個人情報は適切に管理します。
          </div>
        </div>
      )}
    </div>
  );
}
