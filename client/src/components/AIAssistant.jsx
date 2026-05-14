import React, { useState, useCallback } from 'react';
import axios from 'axios';

export default function AIAssistant({ messages, currentRoom, onInsert, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [mode, setMode] = useState('summary');
  const [translateTarget, setTranslateTarget] = useState('英語');
  const [translateText, setTranslateText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [emotionResult, setEmotionResult] = useState(null);
  const [emotionText, setEmotionText] = useState('');
  const [wakkabotMsg, setWakkabotMsg] = useState('');
  const [wakkabotResult, setWakkabotResult] = useState('');

  const run = useCallback(async () => {
    setLoading(true); setResult(''); setSuggestions([]); setEmotionResult(null); setWakkabotResult('');
    try {
      if (mode === 'wakkabot') {
        const res = await axios.post('/api/ai/wakkabot', { message: wakkabotMsg, history: messages.slice(-10) });
        setWakkabotResult(res.data.result || '');
      } else if (mode === 'emotion') {
        const text = emotionText || messages.slice(-5).map(m => m.content).join(' ');
        const res = await axios.post('/api/ai/emotion', { text });
        setEmotionResult(res.data.emoji || '😐');
      } else {
        const payload = { type: mode, messages, text: translateText, targetLang: translateTarget };
        const res = await axios.post('/api/ai/assist', payload);
        const text = res.data.result || '';
        if (mode === 'suggest') {
          const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
          setSuggestions(lines.map(l => l.replace(/^\d+\.\s*/, '').trim()));
        } else {
          setResult(text);
        }
      }
    } catch(e) {
      const msg = e.response?.data?.error || e.message || '';
      if (e.response?.status === 401) {
        setResult('❌ 認証エラーやで。ログインし直してみてな。');
      } else if (e.response?.status === 500 && msg.includes('API')) {
        setResult('❌ AI APIエラーやで。しばらく待ってから試してみてな。');
      } else if (e.response?.status === 400) {
        setResult('❌ ' + (msg || 'メッセージが足りへんで。もう少しトークしてから試してな。'));
      } else {
        setResult('❌ AIへの接続に失敗したで。しばらく待ってから試してな。');
      }
    }
    setLoading(false);
  }, [mode, messages, translateText, translateTarget, wakkabotMsg, emotionText]);

  const MODES = [
    { id:'summary',  label:'📋 要約' },
    { id:'suggest',  label:'💡 返信案' },
    { id:'translate',label:'🌐 翻訳' },
    { id:'wakkabot', label:'🤖 BOT' },
    { id:'emotion',  label:'🎭 感情' },
  ];

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:2000
    }} onClick={onClose}>
      <div style={{
        background:'var(--surface)', borderRadius:'20px 20px 0 0',
        padding:'20px', width:'100%', maxWidth:480,
        paddingBottom:'calc(20px + env(safe-area-inset-bottom))',
        maxHeight:'85dvh', overflow:'auto'
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:17 }}>🤖 AIアシスタント</div>
          <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:4 }}>✕</button>
        </div>

        {/* モード選択 */}
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(''); setSuggestions([]); setEmotionResult(null); setWakkabotResult(''); }} style={{
              flex:'1 1 auto', padding:'9px 6px', borderRadius:10, fontSize:12, fontWeight:600,
              background: mode === m.id ? 'var(--primary)' : 'var(--surface2)',
              color: mode === m.id ? 'white' : 'var(--text)',
              border:'none', cursor:'pointer', minWidth:60
            }}>{m.label}</button>
          ))}
        </div>

        {/* 各モードの説明・入力 */}
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
        {mode === 'wakkabot' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
              💡 チャットでも <strong>@WakkaBOT</strong> と入力すると自動返答するで！
            </div>
            <textarea value={wakkabotMsg} onChange={e => setWakkabotMsg(e.target.value)}
              placeholder="WakkaBOTへの質問や話しかけたいことを入力..." className="form-input"
              style={{ minHeight:80, resize:'vertical' }} />
          </div>
        )}
        {mode === 'emotion' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
              メッセージのトーンを感情アイコンで表すで。空欄なら直近のトークを分析するで
            </div>
            <textarea value={emotionText} onChange={e => setEmotionText(e.target.value)}
              placeholder="分析したいテキスト（省略可）..." className="form-input"
              style={{ minHeight:60, resize:'vertical' }} />
          </div>
        )}

        <button onClick={run} disabled={loading} style={{
          width:'100%', padding:13, borderRadius:12, fontSize:15, fontWeight:700,
          background: loading ? 'var(--border)' : 'var(--primary)', color:'white',
          border:'none', cursor: loading ? 'not-allowed' : 'pointer', marginBottom:14
        }}>
          {loading ? '⏳ AIが考え中...' : '✨ 実行'}
        </button>

        {/* 結果表示 */}
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
        {emotionResult && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:64, marginBottom:8 }}>{emotionResult}</div>
            <div style={{ fontSize:14, color:'var(--text2)' }}>AIが分析した感情やで</div>
          </div>
        )}
        {wakkabotResult && (
          <div style={{ background:'var(--surface2)', borderRadius:12, padding:14 }}>
            <div style={{ fontSize:12, color:'var(--primary)', fontWeight:700, marginBottom:6 }}>🤖 WakkaBOT</div>
            <div style={{ fontSize:14, lineHeight:1.7, color:'var(--text)', whiteSpace:'pre-wrap' }}>{wakkabotResult}</div>
            <button onClick={() => onInsert(wakkabotResult)} style={{
              display:'block', marginTop:10, width:'100%', padding:'8px', borderRadius:8,
              background:'var(--primary)', color:'white', border:'none', fontSize:13, cursor:'pointer'
            }}>📤 入力欄に貼り付け</button>
          </div>
        )}
      </div>
    </div>
  );
}
