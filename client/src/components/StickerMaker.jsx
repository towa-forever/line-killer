import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const BGCOLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9a3c','#00c9a7','#f72585','transparent'];

export default function StickerMaker({ onSend, onClose }) {
  const canvasRef = useRef(null);
  const [text, setText]       = useState('😊');
  const [fontSize, setFontSize] = useState(60);
  const [bgColor, setBgColor]  = useState('#ffd93d');
  const [fontColor] = useState('#333333');
  const [font]                  = useState('Arial');
  const [shape, setShape]      = useState('circle'); // circle|square|rounded
  const [sending, setSending]  = useState(false);

  useEffect(() => { drawSticker(); }, [text, fontSize, bgColor, fontColor, font, shape]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawSticker = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    ctx.clearRect(0, 0, W, H);

    // 背景
    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath(); ctx.arc(W/2, H/2, W/2-2, 0, Math.PI*2); ctx.clip();
    } else if (shape === 'rounded') {
      const r = 30;
      ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.arcTo(W,0,W,r,r);
      ctx.lineTo(W,H-r); ctx.arcTo(W,H,W-r,H,r); ctx.lineTo(r,H); ctx.arcTo(0,H,0,H-r,r);
      ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r); ctx.closePath(); ctx.clip();
    }
    if (bgColor !== 'transparent') { ctx.fillStyle = bgColor; ctx.fillRect(0,0,W,H); }
    ctx.restore();

    // テキスト
    ctx.font = `${fontSize}px ${font}`;
    ctx.fillStyle = fontColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W/2, H/2);
  };

  const handleSend = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSending(true);
    canvas.toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append('file', blob, 'sticker.png');
        formData.append('type', 'sticker');
        const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        onSend({ type: 'sticker', fileData: { url: res.data.url }, content: '🎨 自作スタンプ' });
        onClose();
      } catch (e) {
        // フォールバック: base64で直接送信
        try {
          const dataUrl = canvas.toDataURL('image/png');
          onSend({ type: 'sticker', fileData: { url: dataUrl }, content: '🎨 自作スタンプ' });
          onClose();
        } catch {
          setSending(false);
        }
      }
    }, 'image/png');
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:3000 }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:20, maxHeight:'90vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontWeight:800, fontSize:18 }}>🎨 スタンプ自作</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        {/* プレビュー */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <canvas ref={canvasRef} width={200} height={200}
            style={{ borderRadius: shape==='circle' ? '50%' : shape==='rounded' ? 20 : 0, border:'2px solid var(--border)' }} />
        </div>

        {/* テキスト入力 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>テキスト・絵文字</div>
          <input className="form-input" value={text} onChange={e => setText(e.target.value)}
            placeholder="😊 テキストや絵文字" maxLength={10} style={{ marginBottom:0, fontSize:20, textAlign:'center' }} />
        </div>

        {/* フォントサイズ */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>サイズ: {fontSize}px</div>
          <input type="range" min={20} max={100} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width:'100%' }} />
        </div>

        {/* 背景色 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>背景色</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {BGCOLORS.map(col => (
              <button key={col} onClick={() => setBgColor(col)}
                style={{ width:34, height:34, borderRadius:'50%', background: col==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : col,
                  border: bgColor===col ? '3px solid var(--text)' : '3px solid transparent', cursor:'pointer' }} />
            ))}
          </div>
        </div>

        {/* 形状 */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>形状</div>
          <div style={{ display:'flex', gap:8 }}>
            {[{id:'circle',label:'⭕ 丸'},{id:'rounded',label:'🟦 角丸'},{id:'square',label:'⬛ 四角'}].map(s => (
              <button key={s.id} onClick={() => setShape(s.id)}
                style={{ flex:1, padding:'8px 0', borderRadius:10, fontSize:13, border:'2px solid', cursor:'pointer',
                  borderColor: shape===s.id ? 'var(--primary)' : 'var(--border)',
                  background: shape===s.id ? 'var(--primary)' : 'var(--surface2)',
                  color: shape===s.id ? 'white' : 'var(--text)' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleSend} disabled={sending}>
          {sending ? '送信中...' : '📤 このスタンプを送る'}
        </button>
      </div>
    </div>
  );
}
