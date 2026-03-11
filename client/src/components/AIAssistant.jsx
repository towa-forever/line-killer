import React, { useState } from 'react';
import axios from 'axios';

export default function AIAssistant({ messages, currentRoom, onInsert, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [mode, setMode] = useState('summary'); // summary | translate | suggest
  const [translateTarget, setTranslateTarget] = useState('英語');
  const [translateText, setTranslateText] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const run = async () => {
    setLoading(true); setResult(''); setSuggestions([]);
    try {
      const payload = { type: mode, messages, text: translateText, targetLang: translateTarget };
      const res = await axios.post('/api/ai/assist', payload);
      const text = res.data.result || '';
      if (mode === 'suggest') {
        // 番号付きリストをパース
        const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
        setSuggestions(lines.map(l => l.replace(/^\d+\.\s*/, '').trim()));
      } else {
        setResult(text);
      }
    } catch(e) {
      setResult('AIへの接続に失敗したで。ANTHROPIC_API_KEYが設定されてるか確認してな。');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        padding: '20px', width: '100%', maxWidth: 480,
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        maxHeight: '80dvh', overflow: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:17 }}>🤖 AIアシスタント</div>
          <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:4 }}>✕</button>
        </div>

        {/* モード選択 */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[
            { id:'summary', label:'📋 要約' },
            { id:'translate', label:'🌐 翻訳' },
            { id:'suggest', label:'💡 返信案' },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(''); setSuggestions([]); }} style={{
              flex:1, padding:'9px 4px', borderRadius:10, fontSize:13, fontWeight:600,
              background: mode === m.id ? 'var(--primary)' : 'var(--surface2)',
              color: mode === m.id ? 'white' : 'var(--text)',
              border: 'none', cursor:'pointer'
            }}>{m.label}</button>
          ))}
        </div>

        {/* 翻訳設定 */}
        {mode === 'translate' && (
          <div style={{ marginBottom:12 }}>
            <textarea value={translateText} onChange={e => setTranslateText(e.target.value)}
              placeholder="翻訳したいテキストを入力..." className="form-input"
              style={{ minHeight:80, resize:'vertical', marginBottom:8 }} />
            <select value={translateTarget} onChange={e => setTranslateTarget(e.target.value)}
              className="form-input" style={{ marginBottom:0 }}>
              {['英語','中国語','韓国語','フランス語','スペイン語','ドイツ語','日本語'].map(l => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'summary' && (
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>
            直近{Math.min(messages.length, 50)}件のメッセージを要約するで
          </div>
        )}
        {mode === 'suggest' && (
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>
            会話の流れから返信案を3つ提案するで
          </div>
        )}

        <button onClick={run} disabled={loading} style={{
          width:'100%', padding:13, borderRadius:12, fontSize:15, fontWeight:700,
          background: loading ? 'var(--border)' : 'var(--primary)', color:'white',
          border:'none', cursor: loading ? 'not-allowed' : 'pointer', marginBottom:14
        }}>
          {loading ? '⏳ AIが考え中...' : '✨ 実行'}
        </button>

        {/* 結果 */}
        {result && (
          <div style={{ background:'var(--surface2)', borderRadius:12, padding:14, fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
            {result}
            <button onClick={() => onInsert(result)} style={{
              display:'block', marginTop:10, width:'100%', padding:'8px', borderRadius:8,
              background:'var(--primary)', color:'white', border:'none', fontSize:13, cursor:'pointer'
            }}>📤 入力欄に貼り付け</button>
          </div>
        )}
        {suggestions.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onInsert(s)} style={{
                textAlign:'left', padding:12, borderRadius:12, fontSize:14, lineHeight:1.5,
                background:'var(--surface2)', color:'var(--text)',
                border:'1px solid var(--border)', cursor:'pointer'
              }}>
                <span style={{ color:'var(--primary)', fontWeight:700, marginRight:6 }}>{i+1}.</span>{s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
