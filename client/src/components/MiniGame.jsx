import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const GAMES = [
  { id:'reflex',  emoji:'⚡', name:'反射神経テスト',   desc:'画面が変わったら即タップ！' },
  { id:'number',  emoji:'🔢', name:'数字当てゲーム',   desc:'1〜100の数字を当てよう！' },
  { id:'memory',  emoji:'🧠', name:'記憶力ゲーム',     desc:'カードの組み合わせを覚えよう！' },
  { id:'type',    emoji:'⌨️', name:'タイピングゲーム', desc:'表示されたテキストを素早く入力！' },
  { id:'color',   emoji:'🎨', name:'色当てゲーム',     desc:'表示された色名の色を選べ！' },
  { id:'math',    emoji:'🔣', name:'暗算チャレンジ',   desc:'素早く計算せよ！' },
];

// ---- 各ゲームコンポーネント ----

function ReflexGame({ onShare, onBack }) {
  const [phase, setPhase] = useState('ready');
  const [ms, setMs]       = useState(null);
  const startRef  = useRef(null);
  const timerRef  = useRef(null);

  const start = () => {
    setPhase('waiting'); setMs(null);
    timerRef.current = setTimeout(() => {
      startRef.current = Date.now(); setPhase('tap');
    }, 1500 + Math.random() * 3000);
  };
  const tap = () => {
    if (phase === 'waiting') { clearTimeout(timerRef.current); setPhase('false'); return; }
    if (phase === 'tap') { setMs(Date.now() - startRef.current); setPhase('result'); }
  };
  const label = ms < 150 ? '🚀 超人的！！' : ms < 250 ? '⚡ めちゃ速い！' : ms < 400 ? '👍 なかなか！' : '🐢 もう少し！';
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:12 }}>⚡ 反射神経テスト</div>
      {phase === 'ready' && <><div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>緑になったらすぐタップ！赤の間はタップしないで！</div><button onClick={start} style={primaryBtn}>スタート</button></>}
      {phase === 'waiting' && <div onClick={tap} style={{ ...colorBox, background:'#ff3b30', color:'white' }}>待て…⏳</div>}
      {phase === 'tap'}
      {phase === 'tap' && <div onClick={tap} style={{ ...colorBox, background:'#06c755', color:'white', fontSize:26 }}>タップ！！</div>}
      {phase === 'false' && <><div style={{ fontSize:36, marginBottom:8 }}>😅</div><div style={{ color:'#ff3b30', fontWeight:700, marginBottom:16 }}>フライング！</div><button onClick={start} style={primaryBtn}>もう一度</button></>}
      {phase === 'result' && ms && <><div style={{ fontSize:40, marginBottom:4 }}>{ms < 250 ? '🚀' : '👍'}</div><div style={{ fontSize:36, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{ms}ms</div><div style={{ color:'var(--text2)', marginBottom:16 }}>{label}</div><div style={{ display:'flex', gap:8 }}><button onClick={start} style={secBtn}>もう一度</button><button onClick={() => onShare(`⚡ 反射神経テスト: ${ms}ms！${label}`, { game:'reflex', score: Math.max(0, 1000 - ms) })} style={primaryBtn}>シェア</button></div></>}
    </div>
  );
}

function NumberGame({ onShare, onBack }) {
  const [target]   = useState(() => Math.floor(Math.random() * 100) + 1);
  const [guess, setGuess] = useState('');
  const [hint, setHint]   = useState('');
  const [tries, setTries] = useState(0);
  const [won, setWon]     = useState(false);

  const check = () => {
    const g = parseInt(guess); if (isNaN(g) || g < 1 || g > 100) return;
    const t = tries + 1; setTries(t);
    if (g === target) setWon(true);
    else { setHint(g < target ? '📈 もっと大きい！' : '📉 もっと小さい！'); setGuess(''); }
  };
  const score = Math.max(0, 10 - tries);
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🔢 数字当てゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>1〜100 / {tries}回目</div>
      {!won ? <>
        {hint && <div style={{ fontSize:16, fontWeight:600, marginBottom:10 }}>{hint}</div>}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input type="number" min="1" max="100" value={guess} onChange={e => setGuess(e.target.value)} onKeyDown={e => e.key==='Enter'&&check()} placeholder="1〜100" className="form-input" style={{ flex:1, marginBottom:0, textAlign:'center', fontSize:18 }} autoFocus />
          <button onClick={check} style={{ ...primaryBtn, padding:'0 20px' }}>→</button>
        </div>
      </> : <>
        <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
        <div style={{ fontSize:24, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>正解！ {target}</div>
        <div style={{ color:'var(--text2)', marginBottom:16 }}>{tries}回でクリア！スコア {score}/10</div>
        <button onClick={() => onShare(`🔢 数字当てゲーム: ${tries}回で正解！スコア ${score}/10点`, { game:'number', score: score * 100 })} style={primaryBtn}>シェア</button>
      </>}
    </div>
  );
}

const CARD_EMOJIS = ['🍎','🍕','🎮','🐱','⚽','🌸','🎵','🔥','💎','🚀','🌈','🦁'];
function MemoryGame({ onShare, onBack }) {
  const size = 8; // ペア数
  const [cards, setCards]     = useState(() => shuffle([...CARD_EMOJIS.slice(0,size), ...CARD_EMOJIS.slice(0,size)].map((e,i) => ({ id:i, emoji:e, flipped:false, matched:false }))));
  const [selected, setSelected] = useState([]);
  const [moves, setMoves]       = useState(0);
  const [done, setDone]         = useState(false);

  const flip = (card) => {
    if (card.flipped || card.matched || selected.length === 2) return;
    const next = [...selected, card];
    const newCards = cards.map(c => c.id === card.id ? { ...c, flipped:true } : c);
    setCards(newCards); setSelected(next);
    if (next.length === 2) {
      setMoves(m => m+1);
      if (next[0].emoji === next[1].emoji) {
        setTimeout(() => {
          setCards(cs => {
            const updated = cs.map(c => next.some(s => s.id === c.id) ? { ...c, matched:true } : c);
            if (updated.every(c => c.matched)) setDone(true);
            return updated;
          });
          setSelected([]);
        }, 400);
      } else {
        setTimeout(() => {
          setCards(cs => cs.map(c => next.some(s => s.id === c.id) ? { ...c, flipped:false } : c));
          setSelected([]);
        }, 900);
      }
    }
  };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🧠 記憶力ゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{moves}手 / 残り{cards.filter(c=>!c.matched).length/2}ペア</div>
      {!done ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
          {cards.map(card => (
            <div key={card.id} onClick={() => flip(card)}
              style={{ height:56, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:24, cursor:'pointer', userSelect:'none',
                background: card.matched ? '#e8f5e9' : card.flipped ? 'var(--surface2)' : 'var(--primary)',
                transition:'all 0.2s' }}>
              {card.flipped || card.matched ? card.emoji : ''}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>クリア！</div>
          <div style={{ color:'var(--text2)', marginBottom:16 }}>{moves}手でクリア！</div>
          <button onClick={() => onShare(`🧠 記憶力ゲーム: ${moves}手でクリア！`, { game:'memory', score: Math.max(0, 1000 - moves * 20) })} style={primaryBtn}>シェア</button>
        </>
      )}
    </div>
  );
}

const TYPING_SENTENCES = [
  'LINE Killerで楽しくチャット！',
  'おはようございます！今日もよろしく！',
  '今日のランチは何食べる？',
  'プログラミングって楽しいよね！',
  'スマホとPCでどこでも繋がれる！',
];
function TypingGame({ onShare, onBack }) {
  const [idx]     = useState(() => Math.floor(Math.random() * TYPING_SENTENCES.length));
  const target    = TYPING_SENTENCES[idx];
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone]       = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(null);
  const timer     = useRef(null);

  const start = () => {
    setStarted(true); setInput(''); setDone(false); setElapsed(0);
    startTime.current = Date.now();
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current)/1000)), 100);
  };
  const onChange = (v) => {
    setInput(v);
    if (v === target) {
      clearInterval(timer.current);
      const sec = ((Date.now() - startTime.current)/1000).toFixed(1);
      setElapsed(parseFloat(sec)); setDone(true);
    }
  };
  const wpm = done ? Math.round((target.length / 5) / (elapsed / 60)) : 0;
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:12 }}>⌨️ タイピングゲーム</div>
      {!started ? (
        <><div style={{ padding:14, background:'var(--surface2)', borderRadius:12, fontSize:14, marginBottom:16, lineHeight:1.6 }}>「{target}」</div><button onClick={start} style={primaryBtn}>スタート</button></>
      ) : !done ? (
        <>
          <div style={{ padding:12, background:'var(--surface2)', borderRadius:12, fontSize:14, marginBottom:8, lineHeight:1.6 }}>
            {target.split('').map((ch,i) => (
              <span key={i} style={{ color: i < input.length ? (input[i]===ch ? '#06c755' : '#ff3b30') : 'var(--text)' }}>{ch}</span>
            ))}
          </div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>{elapsed}秒</div>
          <input value={input} onChange={e => onChange(e.target.value)} className="form-input" placeholder="ここに入力..." autoFocus style={{ marginBottom:0 }} />
        </>
      ) : (
        <>
          <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{elapsed}秒！</div>
          <div style={{ color:'var(--text2)', marginBottom:16 }}>約{wpm} WPM</div>
          <button onClick={() => onShare(`⌨️ タイピングゲーム: ${elapsed}秒でクリア！${wpm}WPM`, { game:'type', score: wpm * 10 })} style={primaryBtn}>シェア</button>
        </>
      )}
    </div>
  );
}

const COLORS = [
  { name:'赤', color:'#e74c3c' }, { name:'青', color:'#3498db' },
  { name:'緑', color:'#2ecc71' }, { name:'黄', color:'#f1c40f' },
  { name:'紫', color:'#9b59b6' }, { name:'橙', color:'#e67e22' },
];
function ColorGame({ onShare, onBack }) {
  const [q, setQ]       = useState(() => genQ());
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState(null); // 'correct'|'wrong'

  function genQ() {
    const correct = COLORS[Math.floor(Math.random() * COLORS.length)];
    const shown   = COLORS[Math.floor(Math.random() * COLORS.length)]; // テキストの色（名前とは違う色）
    const opts = shuffle([correct, ...COLORS.filter(c=>c.name!==correct.name).slice(0,3)]);
    return { correct, shown, opts };
  }
  const answer = (c) => {
    const ok = c.name === q.correct.name;
    setFlash(ok ? 'correct' : 'wrong');
    setScore(s => ok ? s+1 : s); setTotal(t => t+1);
    setTimeout(() => { setFlash(null); setQ(genQ()); }, 600);
  };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🎨 色当てゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{score}/{total} 正解</div>
      <div style={{ fontSize:13, marginBottom:8 }}>この文字の「色」はどれ？</div>
      <div style={{ fontSize:52, fontWeight:900, color: q.shown.color, marginBottom:20,
        background: flash ? (flash==='correct' ? '#e8f5e9' : '#fde8e8') : 'var(--surface2)',
        borderRadius:16, padding:'16px 0', transition:'background 0.2s' }}>
        {q.correct.name}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {q.opts.map(c => (
          <button key={c.name} onClick={() => answer(c)}
            style={{ padding:14, borderRadius:14, border:'2px solid var(--border)', background:c.color, color:'white', fontWeight:800, fontSize:16, cursor:'pointer' }}>
            {c.name}
          </button>
        ))}
      </div>
      {total >= 10 && (
        <div style={{ marginTop:12 }}>
          <button onClick={() => onShare(`🎨 色当てゲーム: ${score}/${total}問正解！`, { game:'color', score: score * 100 })} style={primaryBtn}>シェア</button>
        </div>
      )}
    </div>
  );
}

function MathGame({ onShare, onBack }) {
  const [q, setQ]         = useState(() => genMath());
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [over, setOver]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); setOver(true); return 0; } return t-1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  function genMath() {
    const ops = ['+','-','×'];
    const op = ops[Math.floor(Math.random()*ops.length)];
    const a = Math.floor(Math.random()*12)+1, b = Math.floor(Math.random()*12)+1;
    const ans = op==='+' ? a+b : op==='-' ? a-b : a*b;
    return { expr:`${a} ${op} ${b}`, ans };
  }
  const submit = () => {
    const ok = parseInt(input) === q.ans;
    setFlash(ok ? 'correct' : 'wrong');
    setScore(s => ok ? s+1 : s); setTotal(t => t+1);
    setInput('');
    setTimeout(() => { setFlash(null); setQ(genMath()); }, 400);
  };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🔣 暗算チャレンジ</div>
      {!over ? (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:13, color:'var(--text2)' }}>{score}/{total} 正解</span>
            <span style={{ fontSize:13, fontWeight:700, color: timeLeft<10 ? '#e74c3c' : 'var(--text)' }}>⏱ {timeLeft}秒</span>
          </div>
          <div style={{ fontSize:44, fontWeight:900, color: flash ? (flash==='correct' ? '#06c755' : '#e74c3c') : 'var(--text)',
            background:'var(--surface2)', borderRadius:16, padding:'20px 0', marginBottom:16, transition:'color 0.2s' }}>
            {q.expr} = ?
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input type="number" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && submit()} className="form-input" style={{ flex:1, marginBottom:0, textAlign:'center', fontSize:20 }} autoFocus />
            <button onClick={submit} style={{ ...primaryBtn, padding:'0 20px' }}>→</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{score}問正解！</div>
          <div style={{ color:'var(--text2)', marginBottom:16 }}>30秒で{total}問中{score}問正解</div>
          <button onClick={() => onShare(`🔣 暗算チャレンジ: 30秒で${score}問正解！`, { game:'math', score: score * 100 })} style={primaryBtn}>シェア</button>
        </>
      )}
    </div>
  );
}

// ---- スタイル定数 ----
const primaryBtn = { padding:'12px 24px', borderRadius:16, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor:'pointer' };
const secBtn     = { padding:'12px 24px', borderRadius:16, background:'var(--surface2)', color:'var(--text)', border:'none', fontWeight:600, fontSize:14, cursor:'pointer' };
const backBtnStyle = { background:'none', border:'none', color:'var(--text2)', fontSize:13, cursor:'pointer', marginBottom:10, padding:'4px 0' };
const colorBox   = { height:150, borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, fontWeight:700 };

function shuffle(arr) { return [...arr].sort(() => Math.random()-0.5); }

// ---- メインコンポーネント ----
export default function MiniGame({ onSendResult, onClose }) {
  const [game, setGame] = useState(null);
  const [coinToast, setCoinToast] = useState(null); // { coins, score }

  const share = async (text, scoreData) => {
    // スコアをAPIに送信してコイン獲得数を表示
    if (scoreData?.game && typeof scoreData.score === 'number') {
      try {
        const res = await axios.post('/api/game/score', scoreData);
        if (res.data?.coinsEarned > 0) {
          setCoinToast({ coins: res.data.coinsEarned, score: scoreData.score });
          setTimeout(() => {
            setCoinToast(null);
            onSendResult(text);
            onClose();
          }, 1800);
          return;
        }
      } catch { /* 無視 */ }
    }
    onSendResult(text);
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}
      onClick={!game ? onClose : undefined}>
      {/* コイン獲得トースト */}
      {coinToast && (
        <div style={{
          position:'absolute', top:60, left:'50%', transform:'translateX(-50%)',
          background:'linear-gradient(135deg, #f7b731, #f9ca24)',
          color:'#333', borderRadius:20, padding:'14px 28px', zIndex:10,
          textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
          animation:'fadeInDown 0.3s ease'
        }}>
          <div style={{ fontSize:32, marginBottom:4 }}>🪙</div>
          <div style={{ fontWeight:800, fontSize:22 }}>+{coinToast.coins} コイン！</div>
          <div style={{ fontSize:12, opacity:0.8, marginTop:2 }}>スコア: {coinToast.score}pts</div>
        </div>
      )}
      <div style={{ background:'var(--surface)', borderRadius:24, padding:24, width:'92%', maxWidth:360, textAlign:'center', maxHeight:'85vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>
        {!game ? (
          <>
            <div style={{ fontSize:28, marginBottom:4 }}>🎮</div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:4 }}>ミニゲーム</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>みんなで盛り上がろう！</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {GAMES.map(g => (
                <button key={g.id} onClick={() => setGame(g.id)}
                  style={{ padding:'14px 16px', borderRadius:16, background:'var(--surface2)', border:'1px solid var(--border)',
                    color:'var(--text)', fontWeight:700, fontSize:14, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22 }}>{g.emoji}</span>
                  <div>
                    <div>{g.name}</div>
                    <div style={{ fontSize:11, fontWeight:400, color:'var(--text2)', marginTop:2 }}>{g.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ marginTop:14, fontSize:13, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>閉じる</button>
          </>
        ) : game === 'reflex'  ? <ReflexGame  onShare={share} onBack={() => setGame(null)} />
        :   game === 'number'  ? <NumberGame  onShare={share} onBack={() => setGame(null)} />
        :   game === 'memory'  ? <MemoryGame  onShare={share} onBack={() => setGame(null)} />
        :   game === 'type'    ? <TypingGame  onShare={share} onBack={() => setGame(null)} />
        :   game === 'color'   ? <ColorGame   onShare={share} onBack={() => setGame(null)} />
        :   game === 'math'    ? <MathGame    onShare={share} onBack={() => setGame(null)} />
        : null}
      </div>
    </div>
  );
}
