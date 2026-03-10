import React, { useState, useRef } from 'react';

// チャット内ミニゲーム: 反射神経ゲーム・数字当てゲーム
export default function MiniGame({ onSendResult, onClose }) {
  const [game, setGame] = useState(null); // null | 'reflex' | 'number'
  const [phase, setPhase] = useState('ready'); // ready | playing | result
  const [score, setScore] = useState(0);
  const [target, setTarget] = useState(null);
  const [guess, setGuess] = useState('');
  const [hint, setHint] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [reflexTime, setReflexTime] = useState(null);
  const startRef = useRef(null);
  const timerRef = useRef(null);

  const startReflex = () => {
    setPhase('playing'); setReflexTime(null);
    const delay = 1500 + Math.random() * 3000;
    timerRef.current = setTimeout(() => {
      startRef.current = Date.now();
      setPhase('tap');
    }, delay);
  };

  const tapReflex = () => {
    if (phase !== 'tap') { clearTimeout(timerRef.current); setPhase('false-start'); return; }
    const ms = Date.now() - startRef.current;
    setReflexTime(ms); setPhase('result');
  };

  const startNumber = () => {
    const n = Math.floor(Math.random() * 100) + 1;
    setTarget(n); setGuess(''); setHint(''); setAttempts(0); setPhase('playing');
  };

  const guessNumber = () => {
    const g = parseInt(guess);
    if (isNaN(g) || g < 1 || g > 100) return;
    const a = attempts + 1; setAttempts(a);
    if (g === target) { setPhase('result'); setScore(Math.max(0, 10 - a)); }
    else { setHint(g < target ? '📈 もっと大きい！' : '📉 もっと小さい！'); setGuess(''); }
  };

  const shareResult = (text) => {
    onSendResult(text); onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:24, padding:24, width:'90%', maxWidth:340, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        {!game ? (
          <>
            <div style={{ fontSize:24, marginBottom:8 }}>🎮</div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:6 }}>ミニゲーム</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>みんなで盛り上がろう！</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={() => { setGame('reflex'); setPhase('ready'); }} style={{ padding:16, borderRadius:16, background:'linear-gradient(135deg,#ff6b6b,#ff8fab)', color:'white', border:'none', fontWeight:700, fontSize:15, cursor:'pointer' }}>
                ⚡ 反射神経テスト<br/><span style={{ fontSize:11, fontWeight:400 }}>画面が変わったら即タップ！</span>
              </button>
              <button onClick={() => { setGame('number'); startNumber(); }} style={{ padding:16, borderRadius:16, background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', border:'none', fontWeight:700, fontSize:15, cursor:'pointer' }}>
                🔢 数字当てゲーム<br/><span style={{ fontSize:11, fontWeight:400 }}>1〜100の数字を当てよう！</span>
              </button>
            </div>
            <button onClick={onClose} style={{ marginTop:14, fontSize:13, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>閉じる</button>
          </>
        ) : game === 'reflex' ? (
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:12 }}>⚡ 反射神経テスト</div>
            {phase === 'ready' && (
              <>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>緑になったらすぐタップ！<br/>赤の間はタップしないで！</div>
                <button onClick={startReflex} style={{ padding:'14px 32px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:15, cursor:'pointer' }}>スタート</button>
              </>
            )}
            {phase === 'playing' && (
              <div onClick={tapReflex} style={{ height:160, borderRadius:20, background:'#ff3b30', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16, color:'white', fontWeight:700 }}>
                待て…⏳
              </div>
            )}
            {phase === 'tap' && (
              <div onClick={tapReflex} style={{ height:160, borderRadius:20, background:'#06c755', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:24, color:'white', fontWeight:800 }}>
                タップ！！
              </div>
            )}
            {phase === 'false-start' && (
              <>
                <div style={{ fontSize:40, marginBottom:8 }}>😅</div>
                <div style={{ fontWeight:700, marginBottom:16, color:'#ff3b30' }}>フライング！</div>
                <button onClick={startReflex} style={{ padding:'10px 24px', borderRadius:16, background:'var(--primary)', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>もう一度</button>
              </>
            )}
            {phase === 'result' && reflexTime && (
              <>
                <div style={{ fontSize:48, marginBottom:8 }}>{reflexTime < 200 ? '🚀' : reflexTime < 400 ? '⚡' : reflexTime < 600 ? '👍' : '🐢'}</div>
                <div style={{ fontSize:36, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{reflexTime}ms</div>
                <div style={{ fontSize:14, color:'var(--text2)', marginBottom:16 }}>
                  {reflexTime < 200 ? '超人的！！' : reflexTime < 400 ? 'めちゃ速い！' : reflexTime < 600 ? 'なかなか！' : 'もう少し！'}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { setPhase('ready'); }} style={{ flex:1, padding:12, borderRadius:14, background:'var(--surface2)', color:'var(--text)', border:'none', fontWeight:600, cursor:'pointer' }}>もう一度</button>
                  <button onClick={() => shareResult(`⚡ 反射神経テスト: ${reflexTime}ms！${reflexTime < 200 ? '超人的！！' : reflexTime < 400 ? 'めちゃ速い！' : reflexTime < 600 ? 'なかなか！' : 'もう少し！'}`)}
                    style={{ flex:1, padding:12, borderRadius:14, background:'var(--primary)', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>シェア</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:4 }}>🔢 数字当てゲーム</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>1〜100 / {attempts}回目</div>
            {phase === 'playing' ? (
              <>
                {hint && <div style={{ fontSize:16, marginBottom:12, fontWeight:600 }}>{hint}</div>}
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <input type="number" min="1" max="100" value={guess} onChange={e => setGuess(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && guessNumber()}
                    placeholder="数字を入力..." className="form-input" style={{ flex:1, marginBottom:0, fontSize:18, textAlign:'center' }} autoFocus />
                  <button onClick={guessNumber} style={{ padding:'0 16px', borderRadius:12, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:16, cursor:'pointer' }}>→</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:48, marginBottom:8 }}>{score >= 8 ? '🏆' : score >= 5 ? '🎉' : '👏'}</div>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>正解！ {target}</div>
                <div style={{ fontSize:14, color:'var(--text2)', marginBottom:16 }}>{attempts}回でクリア！ スコア: {score}/10</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={startNumber} style={{ flex:1, padding:12, borderRadius:14, background:'var(--surface2)', color:'var(--text)', border:'none', fontWeight:600, cursor:'pointer' }}>もう一度</button>
                  <button onClick={() => shareResult(`🔢 数字当てゲーム: ${attempts}回で正解！ スコア${score}/10点`)}
                    style={{ flex:1, padding:12, borderRadius:14, background:'var(--primary)', color:'white', border:'none', fontWeight:700, cursor:'pointer' }}>シェア</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
