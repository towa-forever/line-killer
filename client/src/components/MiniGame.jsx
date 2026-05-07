import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

const GAMES = [
  { id:'reflex',  emoji:'⚡', name:'反射神経テスト',   desc:'画面が変わったら即タップ！',  maxScore:1000 },
  { id:'number',  emoji:'🔢', name:'数字当てゲーム',   desc:'1〜100の数字を当てよう！',    maxScore:1000 },
  { id:'memory',  emoji:'🧠', name:'記憶力ゲーム',     desc:'カードの組み合わせを覚えよう！', maxScore:1000 },
  { id:'type',    emoji:'⌨️', name:'タイピングゲーム', desc:'表示されたテキストを素早く入力！', maxScore:1000 },
  { id:'color',   emoji:'🎨', name:'色当てゲーム',     desc:'表示された色名の色を選べ！',  maxScore:1000 },
  { id:'math',    emoji:'🔣', name:'暗算チャレンジ',   desc:'素早く計算せよ！',            maxScore:1000 },
];

const BET_OPTIONS = [
  { coins: 0,   label: '無料',   multiplier: 1,   emoji: '🎮' },
  { coins: 10,  label: '10コイン', multiplier: 1.5, emoji: '🥉' },
  { coins: 30,  label: '30コイン', multiplier: 2,   emoji: '🥈' },
  { coins: 100, label: '100コイン', multiplier: 3,  emoji: '🥇' },
  { coins: 300, label: '300コイン', multiplier: 5,  emoji: '💎' },
];

const SHOP_ITEMS = [
  { id:'hint',     emoji:'💡', name:'ヒント',       desc:'数字当てで正解の範囲を教えてくれる', price:20 },
  { id:'timeext',  emoji:'⏰', name:'時間延長',     desc:'暗算チャレンジの時間+15秒',          price:30 },
  { id:'slowcard', emoji:'🐢', name:'スロー記憶',   desc:'カードが少し長く見える',              price:25 },
  { id:'skin_gold',emoji:'✨', name:'ゴールドスキン', desc:'ゲーム画面が金色に光る',            price:100 },
  { id:'skin_neon', emoji:'🌈', name:'ネオンスキン', desc:'ゲーム画面がネオンカラーに',         price:150 },
];

const primaryBtn  = { padding:'12px 24px', borderRadius:16, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:14, cursor:'pointer' };
const secBtn      = { padding:'12px 24px', borderRadius:16, background:'var(--surface2)', color:'var(--text)', border:'none', fontWeight:600, fontSize:14, cursor:'pointer' };
const backBtnStyle = { background:'none', border:'none', color:'var(--text2)', fontSize:13, cursor:'pointer', marginBottom:10, padding:'4px 0' };
const colorBox    = { height:150, borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, fontWeight:700 };

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ---- ゲームコンポーネント ----
function ReflexGame({ onShare, onBack, items }) {
  const [phase, setPhase] = useState('ready');
  const [ms, setMs] = useState(null);
  const startRef = useRef(null);
  const timerRef = useRef(null);
  const skin = items?.skin_gold ? { background:'linear-gradient(135deg,#f7b731,#f9ca24)' } : items?.skin_neon ? { background:'linear-gradient(135deg,#a29bfe,#fd79a8)' } : {};

  const start = () => {
    setPhase('waiting'); setMs(null);
    timerRef.current = setTimeout(() => { startRef.current = Date.now(); setPhase('tap'); }, 1500 + Math.random() * 3000);
  };
  const tap = () => {
    if (phase === 'waiting') { clearTimeout(timerRef.current); setPhase('false'); return; }
    if (phase === 'tap') { setMs(Date.now() - startRef.current); setPhase('result'); }
  };
  const label = !ms ? '' : ms < 150 ? '🚀 超人的！！' : ms < 250 ? '⚡ めちゃ速い！' : ms < 400 ? '👍 なかなか！' : '🐢 もう少し！';
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:12 }}>⚡ 反射神経テスト</div>
      {phase === 'ready' && <><div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>緑になったらすぐタップ！赤の間はタップしないで！</div><button onClick={start} style={primaryBtn}>スタート</button></>}
      {phase === 'waiting' && <div onClick={tap} style={{ ...colorBox, background:'#ff3b30', color:'white', ...skin }}>待て…⏳</div>}
      {phase === 'tap' && <div onClick={tap} style={{ ...colorBox, background:'#06c755', color:'white', fontSize:26, ...skin }}>タップ！！</div>}
      {phase === 'false' && <><div style={{ fontSize:36, marginBottom:8 }}>😅</div><div style={{ color:'#ff3b30', fontWeight:700, marginBottom:16 }}>フライング！</div><button onClick={start} style={primaryBtn}>もう一度</button></>}
      {phase === 'result' && ms && <><div style={{ fontSize:40, marginBottom:4 }}>{ms < 250 ? '🚀' : '👍'}</div><div style={{ fontSize:36, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{ms}ms</div><div style={{ color:'var(--text2)', marginBottom:16 }}>{label}</div><div style={{ display:'flex', gap:8 }}><button onClick={start} style={secBtn}>もう一度</button><button onClick={() => onShare(`⚡ 反射神経テスト: ${ms}ms！${label}`, { game:'reflex', score: Math.max(0, 1000 - ms) })} style={primaryBtn}>結果をシェア</button></div></>}
    </div>
  );
}

function NumberGame({ onShare, onBack, items }) {
  const [target] = useState(() => Math.floor(Math.random() * 100) + 1);
  const [guess, setGuess] = useState('');
  const [hint, setHint] = useState('');
  const [tries, setTries] = useState(0);
  const [won, setWon] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const hasHint = !!items?.hint;

  const useHint = () => {
    if (hintUsed) return;
    const range = target <= 25 ? '1〜25' : target <= 50 ? '26〜50' : target <= 75 ? '51〜75' : '76〜100';
    setHint(`💡 ヒント：答えは ${range} の範囲やで！`);
    setHintUsed(true);
  };

  const check = () => {
    const g = parseInt(guess); if (isNaN(g) || g < 1 || g > 100) return;
    const t = tries + 1; setTries(t);
    if (g === target) setWon(true);
    else { setHint(g < target ? '📈 もっと大きい！' : '📉 もっと小さい！'); setGuess(''); }
  };
  const score = Math.max(0, 1000 - tries * 100);
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🔢 数字当てゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>1〜100 / {tries}回目</div>
      {!won ? <>
        {hint && <div style={{ fontSize:15, fontWeight:600, marginBottom:10, color: hintUsed && hint.includes('ヒント') ? '#f39c12' : 'var(--text)' }}>{hint}</div>}
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input type="number" min="1" max="100" value={guess} onChange={e => setGuess(e.target.value)} onKeyDown={e => e.key==='Enter'&&check()} placeholder="1〜100" className="form-input" style={{ flex:1, marginBottom:0, textAlign:'center', fontSize:18 }} autoFocus />
          <button onClick={check} style={{ ...primaryBtn, padding:'0 20px' }}>→</button>
        </div>
        {hasHint && !hintUsed && <button onClick={useHint} style={{ fontSize:12, color:'#f39c12', background:'none', border:'1px solid #f39c12', borderRadius:8, padding:'4px 10px', cursor:'pointer', marginBottom:8 }}>💡 ヒントを使う</button>}
      </> : <>
        <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
        <div style={{ fontSize:24, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>正解！ {target}</div>
        <div style={{ color:'var(--text2)', marginBottom:16 }}>{tries}回でクリア！スコア {score}</div>
        <button onClick={() => onShare(`🔢 数字当てゲーム: ${tries}回で正解！スコア ${score}`, { game:'number', score })} style={primaryBtn}>結果をシェア</button>
      </>}
    </div>
  );
}

const CARD_EMOJIS = ['🍎','🍕','🎮','🐱','⚽','🌸','🎵','🔥','💎','🚀','🌈','🦁'];
function MemoryGame({ onShare, onBack, items }) {
  const size = 8;
  const revealTime = items?.slowcard ? 1400 : 900;
  const [cards, setCards] = useState(() => shuffle([...CARD_EMOJIS.slice(0,size), ...CARD_EMOJIS.slice(0,size)].map((e,i) => ({ id:i, emoji:e, flipped:false, matched:false }))));
  const [selected, setSelected] = useState([]);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  const flip = (card) => {
    if (card.flipped || card.matched || selected.length === 2) return;
    const next = [...selected, card];
    const newCards = cards.map(c => c.id === card.id ? { ...c, flipped:true } : c);
    setCards(newCards); setSelected(next);
    if (next.length === 2) {
      setMoves(m => m+1);
      if (next[0].emoji === next[1].emoji) {
        setTimeout(() => { setCards(cs => { const u = cs.map(c => next.some(s=>s.id===c.id)?{...c,matched:true}:c); if(u.every(c=>c.matched)) setDone(true); return u; }); setSelected([]); }, 400);
      } else {
        setTimeout(() => { setCards(cs => cs.map(c => next.some(s=>s.id===c.id)?{...c,flipped:false}:c)); setSelected([]); }, revealTime);
      }
    }
  };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🧠 記憶力ゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{moves}手 / 残り{cards.filter(c=>!c.matched).length/2}ペア {items?.slowcard && '🐢スローモード'}</div>
      {!done ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
          {cards.map(card => (
            <div key={card.id} onClick={() => flip(card)} style={{ height:56, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, cursor:'pointer', userSelect:'none', background: card.matched ? '#e8f5e9' : card.flipped ? 'var(--surface2)' : 'var(--primary)', transition:'all 0.2s' }}>
              {card.flipped || card.matched ? card.emoji : ''}
            </div>
          ))}
        </div>
      ) : <>
        <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
        <div style={{ fontSize:20, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>クリア！</div>
        <div style={{ color:'var(--text2)', marginBottom:16 }}>{moves}手でクリア！</div>
        <button onClick={() => onShare(`🧠 記憶力ゲーム: ${moves}手でクリア！`, { game:'memory', score: Math.max(0, 1000 - moves * 20) })} style={primaryBtn}>結果をシェア</button>
      </>}
    </div>
  );
}

const TYPING_SENTENCES = ['WakkaChatで楽しくチャット！','おはようございます！今日もよろしく！','今日のランチは何食べる？','プログラミングって楽しいよね！','スマホとPCでどこでも繋がれる！'];
function TypingGame({ onShare, onBack }) {
  const [idx] = useState(() => Math.floor(Math.random() * TYPING_SENTENCES.length));
  const target = TYPING_SENTENCES[idx];
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(null);
  const timer = useRef(null);
  const start = () => { setStarted(true); setInput(''); setDone(false); setElapsed(0); startTime.current = Date.now(); timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current)/1000)), 100); };
  const onChange = (v) => { setInput(v); if (v === target) { clearInterval(timer.current); const sec = ((Date.now()-startTime.current)/1000).toFixed(1); setElapsed(parseFloat(sec)); setDone(true); } };
  const wpm = done ? Math.round((target.length/5)/(elapsed/60)) : 0;
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:12 }}>⌨️ タイピングゲーム</div>
      {!started ? (<><div style={{ padding:14, background:'var(--surface2)', borderRadius:12, fontSize:14, marginBottom:16, lineHeight:1.6 }}>「{target}」</div><button onClick={start} style={primaryBtn}>スタート</button></>) : !done ? (
        <><div style={{ padding:12, background:'var(--surface2)', borderRadius:12, fontSize:14, marginBottom:8, lineHeight:1.6 }}>{target.split('').map((ch,i) => <span key={i} style={{ color: i<input.length?(input[i]===ch?'#06c755':'#ff3b30'):'var(--text)' }}>{ch}</span>)}</div><div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>{elapsed}秒</div><input value={input} onChange={e => onChange(e.target.value)} className="form-input" placeholder="ここに入力..." autoFocus style={{ marginBottom:0 }} /></>
      ) : (<><div style={{ fontSize:40, marginBottom:6 }}>🏆</div><div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{elapsed}秒！</div><div style={{ color:'var(--text2)', marginBottom:16 }}>約{wpm} WPM</div><button onClick={() => onShare(`⌨️ タイピングゲーム: ${elapsed}秒！${wpm}WPM`, { game:'type', score: wpm*10 })} style={primaryBtn}>結果をシェア</button></>)}
    </div>
  );
}

const COLORS = [{ name:'赤', color:'#e74c3c' }, { name:'青', color:'#3498db' }, { name:'緑', color:'#2ecc71' }, { name:'黄', color:'#f1c40f' }, { name:'紫', color:'#9b59b6' }, { name:'橙', color:'#e67e22' }];
function ColorGame({ onShare, onBack }) {
  const [q, setQ] = useState(() => genQ());
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState(null);
  function genQ() { const correct=COLORS[Math.floor(Math.random()*COLORS.length)]; const shown=COLORS[Math.floor(Math.random()*COLORS.length)]; const opts=shuffle([correct,...COLORS.filter(c=>c.name!==correct.name).slice(0,3)]); return { correct, shown, opts }; }
  const answer = (c) => { const ok=c.name===q.correct.name; setFlash(ok?'correct':'wrong'); setScore(s=>ok?s+1:s); setTotal(t=>t+1); setTimeout(()=>{ setFlash(null); setQ(genQ()); },600); };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🎨 色当てゲーム</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{score}/{total} 正解</div>
      <div style={{ fontSize:13, marginBottom:8 }}>この文字の「色」はどれ？</div>
      <div style={{ fontSize:52, fontWeight:900, color: q.shown.color, marginBottom:20, background: flash?(flash==='correct'?'#e8f5e9':'#fde8e8'):'var(--surface2)', borderRadius:16, padding:'16px 0', transition:'background 0.2s' }}>{q.correct.name}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>{q.opts.map(c => <button key={c.name} onClick={() => answer(c)} style={{ padding:14, borderRadius:14, border:'2px solid var(--border)', background:c.color, color:'white', fontWeight:800, fontSize:16, cursor:'pointer' }}>{c.name}</button>)}</div>
      {total >= 10 && <div style={{ marginTop:12 }}><button onClick={() => onShare(`🎨 色当てゲーム: ${score}/${total}問正解！`, { game:'color', score:score*100 })} style={primaryBtn}>結果をシェア</button></div>}
    </div>
  );
}

function MathGame({ onShare, onBack, items }) {
  const baseTime = items?.timeext ? 45 : 30;
  const [q, setQ] = useState(() => genMath());
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState(null);
  const [timeLeft, setTimeLeft] = useState(baseTime);
  const [over, setOver] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => { timerRef.current = setInterval(() => { setTimeLeft(t => { if(t<=1){ clearInterval(timerRef.current); setOver(true); return 0; } return t-1; }); }, 1000); return () => clearInterval(timerRef.current); }, []);
  function genMath() { const ops=['+','-','×']; const op=ops[Math.floor(Math.random()*ops.length)]; const a=Math.floor(Math.random()*12)+1,b=Math.floor(Math.random()*12)+1; const ans=op==='+'?a+b:op==='-'?a-b:a*b; return { expr:`${a} ${op} ${b}`, ans }; }
  const submit = () => { const ok=parseInt(input)===q.ans; setFlash(ok?'correct':'wrong'); setScore(s=>ok?s+1:s); setTotal(t=>t+1); setInput(''); setTimeout(()=>{ setFlash(null); setQ(genMath()); },400); };
  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>← 戻る</button>
      <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🔣 暗算チャレンジ {items?.timeext && <span style={{ fontSize:12, color:'#f39c12' }}>⏰+15秒</span>}</div>
      {!over ? (<>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}><span style={{ fontSize:13, color:'var(--text2)' }}>{score}/{total} 正解</span><span style={{ fontSize:13, fontWeight:700, color: timeLeft<10?'#e74c3c':'var(--text)' }}>⏱ {timeLeft}秒</span></div>
        <div style={{ fontSize:44, fontWeight:900, color: flash?(flash==='correct'?'#06c755':'#e74c3c'):'var(--text)', background:'var(--surface2)', borderRadius:16, padding:'20px 0', marginBottom:16, transition:'color 0.2s' }}>{q.expr} = ?</div>
        <div style={{ display:'flex', gap:8 }}><input type="number" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} className="form-input" style={{ flex:1, marginBottom:0, textAlign:'center', fontSize:20 }} autoFocus /><button onClick={submit} style={{ ...primaryBtn, padding:'0 20px' }}>→</button></div>
      </>) : (<>
        <div style={{ fontSize:40, marginBottom:6 }}>🏆</div>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{score}問正解！</div>
        <div style={{ color:'var(--text2)', marginBottom:16 }}>{baseTime}秒で{total}問中{score}問正解</div>
        <button onClick={() => onShare(`🔣 暗算チャレンジ: ${baseTime}秒で${score}問正解！`, { game:'math', score:score*100 })} style={primaryBtn}>結果をシェア</button>
      </>)}
    </div>
  );
}

// ---- メインコンポーネント ----
export default function MiniGame({ onSendResult, onClose, socket, currentUser, selectedRoom }) {
  const [screen, setScreen] = useState('menu'); // menu | bet | game | shop
  const [game, setGame] = useState(null);
  const [bet, setBet] = useState(BET_OPTIONS[0]);
  const [myCoins, setMyCoins] = useState(0);
  const [ownedItems, setOwnedItems] = useState({});
  const [coinToast, setCoinToast] = useState(null);
  const [shopMsg, setShopMsg] = useState('');

  useEffect(() => {
    axios.get('/api/users/me/coins').then(r => setMyCoins(r.data.coins || 0)).catch(() => {});
    const saved = localStorage.getItem('wakkachat_game_items');
    if (saved) try { setOwnedItems(JSON.parse(saved)); } catch {}
  }, []);

  const saveItems = (items) => {
    setOwnedItems(items);
    localStorage.setItem('wakkachat_game_items', JSON.stringify(items));
  };

  const buyItem = async (item) => {
    if (myCoins < item.price) { setShopMsg('コインが足りないで！'); return; }
    try {
      // コインを消費（ギフト送信の逆のAPIを使う）
      await axios.post('/api/game/buy-item', { itemId: item.id, price: item.price });
      setMyCoins(c => c - item.price);
      const newItems = { ...ownedItems, [item.id]: true };
      saveItems(newItems);
      setShopMsg(`${item.emoji} ${item.name}を購入したで！`);
    } catch {
      setShopMsg('購入に失敗したで…');
    }
  };

  const startGame = useCallback(async () => {
    if (bet.coins > 0) {
      if (myCoins < bet.coins) { alert('コインが足りないで！'); return; }
      // 賭けコインを一時的に引く
      try {
        await axios.post('/api/game/bet', { coins: bet.coins });
        setMyCoins(c => c - bet.coins);
      } catch { alert('コインの処理に失敗したで'); return; }
    }
    setScreen('game');
  }, [bet, myCoins]);

  const share = useCallback(async (text, scoreData) => {
    if (scoreData?.game && typeof scoreData.score === 'number') {
      try {
        const res = await axios.post('/api/game/score', { ...scoreData, bet: bet.coins, multiplier: bet.multiplier });
        const earned = res.data?.coinsEarned || 0;
        const total = earned + (bet.coins * bet.multiplier);
        if (earned > 0 || bet.coins > 0) {
          setMyCoins(c => c + Math.floor(total));
          setCoinToast({ coins: Math.floor(total), score: scoreData.score, bet: bet.coins });
          setTimeout(() => { setCoinToast(null); onSendResult(text); onClose(); }, 2000);
          return;
        }
      } catch {}
    }
    onSendResult(text);
    onClose();
  }, [bet, onSendResult, onClose]);

  const gameProps = { onShare: share, onBack: () => setScreen('bet'), items: ownedItems };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }} onClick={screen === 'menu' ? onClose : undefined}>
      {/* コイン獲得トースト */}
      {coinToast && (
        <div style={{ position:'absolute', top:60, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#f7b731,#f9ca24)', color:'#333', borderRadius:20, padding:'14px 28px', zIndex:10, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize:32, marginBottom:4 }}>🪙</div>
          <div style={{ fontWeight:800, fontSize:22 }}>+{coinToast.coins} コイン！</div>
          {coinToast.bet > 0 && <div style={{ fontSize:12, opacity:0.8 }}>賭け {coinToast.bet}コイン × {bet.multiplier}倍</div>}
          <div style={{ fontSize:12, opacity:0.8 }}>スコア: {coinToast.score}pts</div>
        </div>
      )}

      <div style={{ background:'var(--surface)', borderRadius:24, padding:24, width:'92%', maxWidth:380, textAlign:'center', maxHeight:'88vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>

        {/* ===== メニュー ===== */}
        {screen === 'menu' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ fontWeight:800, fontSize:18 }}>🎮 ミニゲーム</div>
              <div style={{ fontSize:13, color:'#f7b731', fontWeight:700 }}>💰 {myCoins}コイン</div>
            </div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>ゲームで遊んでコインを稼ごう！</div>

            {/* ショップ・統計ボタン */}
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <button onClick={() => setScreen('shop')} style={{ flex:1, padding:'8px', borderRadius:12, background:'linear-gradient(135deg,#f7b731,#f9ca24)', color:'#333', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>🛒 ショップ</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {GAMES.map(g => (
                <button key={g.id} onClick={() => { setGame(g.id); setScreen('bet'); }} style={{ padding:'14px 16px', borderRadius:16, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)', fontWeight:700, fontSize:14, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:10 }}>
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
        )}

        {/* ===== 賭けコイン選択 ===== */}
        {screen === 'bet' && (
          <>
            <button onClick={() => setScreen('menu')} style={backBtnStyle}>← ゲーム選択に戻る</button>
            <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>💰 コインを賭ける</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>勝てば賭けた分が倍になるで！<br/>残高: <span style={{ color:'#f7b731', fontWeight:700 }}>{myCoins}コイン</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {BET_OPTIONS.map(b => (
                <button key={b.coins} onClick={() => setBet(b)} style={{
                  padding:'14px 16px', borderRadius:14, textAlign:'left',
                  background: bet.coins === b.coins ? 'var(--primary)' : 'var(--surface2)',
                  color: bet.coins === b.coins ? 'white' : 'var(--text)',
                  border: `2px solid ${bet.coins === b.coins ? 'var(--primary)' : 'var(--border)'}`,
                  cursor: b.coins > myCoins ? 'not-allowed' : 'pointer',
                  opacity: b.coins > myCoins ? 0.4 : 1,
                  display:'flex', justifyContent:'space-between', alignItems:'center'
                }} disabled={b.coins > myCoins}>
                  <span style={{ fontWeight:700 }}>{b.emoji} {b.label}</span>
                  <span style={{ fontSize:13, opacity:0.85 }}>×{b.multiplier}倍リターン</span>
                </button>
              ))}
            </div>
            <button onClick={startGame} style={{ ...primaryBtn, width:'100%', padding:14, fontSize:15 }}>
              🎮 ゲームスタート！
            </button>
          </>
        )}

        {/* ===== ゲーム画面 ===== */}
        {screen === 'game' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{GAMES.find(g=>g.id===game)?.emoji} {GAMES.find(g=>g.id===game)?.name}</span>
              <span style={{ color:'#f7b731', fontWeight:700 }}>賭け: {bet.coins}コイン ×{bet.multiplier}</span>
            </div>
            {game === 'reflex' && <ReflexGame {...gameProps} />}
            {game === 'number' && <NumberGame {...gameProps} />}
            {game === 'memory' && <MemoryGame {...gameProps} />}
            {game === 'type'   && <TypingGame {...gameProps} />}
            {game === 'color'  && <ColorGame  {...gameProps} />}
            {game === 'math'   && <MathGame   {...gameProps} />}
          </>
        )}

        {/* ===== ショップ ===== */}
        {screen === 'shop' && (
          <>
            <button onClick={() => { setScreen('menu'); setShopMsg(''); }} style={backBtnStyle}>← 戻る</button>
            <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>🛒 ゲームショップ</div>
            <div style={{ fontSize:13, color:'#f7b731', fontWeight:700, marginBottom:12 }}>💰 残高: {myCoins}コイン</div>
            {shopMsg && <div style={{ fontSize:13, padding:'8px 12px', borderRadius:8, background: shopMsg.includes('失敗')||shopMsg.includes('足りない') ? '#fde8e8' : '#e8f5e9', color: shopMsg.includes('失敗')||shopMsg.includes('足りない') ? '#c0392b' : '#27ae60', marginBottom:12 }}>{shopMsg}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {SHOP_ITEMS.map(item => (
                <div key={item.id} style={{ padding:'14px', borderRadius:14, background:'var(--surface2)', border:`2px solid ${ownedItems[item.id] ? 'var(--primary)' : 'var(--border)'}`, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>{item.emoji}</span>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{item.name}</div>
                    <div style={{ fontSize:11, color:'var(--text2)' }}>{item.desc}</div>
                  </div>
                  {ownedItems[item.id]
                    ? <div style={{ fontSize:12, color:'var(--primary)', fontWeight:700 }}>✓ 所持中</div>
                    : <button onClick={() => buyItem(item)} disabled={myCoins < item.price} style={{ padding:'8px 14px', borderRadius:10, background: myCoins < item.price ? 'var(--border)' : '#f7b731', color: myCoins < item.price ? 'var(--text2)' : '#333', border:'none', fontWeight:700, fontSize:13, cursor: myCoins < item.price ? 'not-allowed' : 'pointer' }}>{item.price}🪙</button>
                  }
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
