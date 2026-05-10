import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

const BGCOLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9a3c','#00c9a7','#f72585','transparent'];
const FONT_COLORS = ['#333333','#ffffff','#ff3b30','#007aff','#34c759','#ff9500','#af52de','#ff2d55'];
const FONTS = [
  { id: 'Arial', label: 'ゴシック' },
  { id: 'Georgia', label: 'セリフ' },
  { id: '"Courier New"', label: '等幅' },
  { id: '"Comic Sans MS"', label: 'ポップ' },
];

export default function StickerMaker({ onSend, onClose }) {
  const canvasRef = useRef(null);
  const [text, setText]           = useState('😊');
  const [fontSize, setFontSize]   = useState(60);
  const [bgColor, setBgColor]     = useState('#ffd93d');
  const [fontColor, setFontColor] = useState('#333333');
  const [font, setFont]           = useState('Arial');
  const [shape, setShape]         = useState('circle');
  const [shadow, setShadow]       = useState(false);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState('');

  // 依存配列を全stateに正しく指定 → stateが変わるたびに再生成
  const drawSticker = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(W/2, H/2, W/2-2, 0, Math.PI*2);
      ctx.clip();
    } else if (shape === 'rounded') {
      const r = 30;
      ctx.beginPath();
      ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.arcTo(W,0,W,r,r);
      ctx.lineTo(W,H-r); ctx.arcTo(W,H,W-r,H,r);
      ctx.lineTo(r,H); ctx.arcTo(0,H,0,H-r,r);
      ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r);
      ctx.closePath(); ctx.clip();
    }
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.fillStyle = fontColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = text.split('\n');
    const lineH = fontSize * 1.2;
    const totalH = lineH * lines.length;
    lines.forEach((line, i) => {
      const y = H/2 - totalH/2 + lineH*i + lineH/2;
      ctx.fillText(line, W/2, y);
    });

    ctx.shadowColor = 'transparent';
  }, [text, fontSize, bgColor, fontColor, font, shape, shadow]);

  useEffect(() => { drawSticker(); }, [drawSticker]);

  const handleSend = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!text.trim()) { setError('テキストを入力してな'); return; }
    setSending(true); setError('');
    canvas.toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append('file', blob, 'sticker.png');
        const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        onSend({ type: 'sticker', fileData: { url: res.data.url }, content: '🎨 自作スタンプ' });
        onClose();
      } catch {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          onSend({ type: 'sticker', fileData: { url: dataUrl }, content: '🎨 自作スタンプ' });
          onClose();
        } catch {
          setError('送信に失敗したで。もう一回試してな');
          setSending(false);
        }
      }
    }, 'image/png');
  }, [text, onSend, onClose]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:3000 }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:20, maxHeight:'92dvh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontWeight:800, fontSize:18 }}>🎨 スタンプ自作</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        {/* プレビュー */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <canvas ref={canvasRef} width={200} height={200}
            style={{
              borderRadius: shape==='circle' ? '50%' : shape==='rounded' ? 20 : 0,
              border: '2px solid var(--border)',
              background: bgColor==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : 'transparent',
            }} />
        </div>

        {/* テキスト */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>テキスト・絵文字（改行OK）</div>
          <textarea className="form-input" value={text} onChange={e => setText(e.target.value)}
            placeholder="😊 テキストや絵文字" maxLength={20} rows={2}
            style={{ marginBottom:0, fontSize:20, textAlign:'center', resize:'none' }} />
        </div>

        {/* フォントサイズ */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>文字サイズ: {fontSize}px</div>
          <input type="range" min={16} max={100} value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))} style={{ width:'100%' }} />
        </div>

        {/* 背景色 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>背景色</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {BGCOLORS.map(col => (
              <button key={col} onClick={() => setBgColor(col)}
                style={{
                  width:34, height:34, borderRadius:'50%', cursor:'pointer',
                  background: col==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : col,
                  border: bgColor===col ? '3px solid var(--text)' : '3px solid transparent',
                  outline: bgColor===col ? '2px solid var(--primary)' : 'none',
                }} />
            ))}
          </div>
        </div>

        {/* 文字色 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>文字色</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {FONT_COLORS.map(col => (
              <button key={col} onClick={() => setFontColor(col)}
                style={{
                  width:34, height:34, borderRadius:'50%', cursor:'pointer', background: col,
                  border: fontColor===col ? '3px solid var(--primary)' : '3px solid var(--border)',
                }} />
            ))}
          </div>
        </div>

        {/* フォント */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>フォント</div>
          <div style={{ display:'flex', gap:8 }}>
            {FONTS.map(f => (
              <button key={f.id} onClick={() => setFont(f.id)}
                style={{
                  flex:1, padding:'7px 4px', borderRadius:10, fontSize:12, cursor:'pointer',
                  border: '2px solid', fontFamily: f.id,
                  borderColor: font===f.id ? 'var(--primary)' : 'var(--border)',
                  background: font===f.id ? 'var(--primary)' : 'var(--surface2)',
                  color: font===f.id ? 'white' : 'var(--text)',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 形状 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>形状</div>
          <div style={{ display:'flex', gap:8 }}>
            {[{id:'circle',label:'⭕ 丸'},{id:'rounded',label:'🟦 角丸'},{id:'square',label:'⬛ 四角'}].map(s => (
              <button key={s.id} onClick={() => setShape(s.id)}
                style={{
                  flex:1, padding:'8px 0', borderRadius:10, fontSize:13, cursor:'pointer', border:'2px solid',
                  borderColor: shape===s.id ? 'var(--primary)' : 'var(--border)',
                  background: shape===s.id ? 'var(--primary)' : 'var(--surface2)',
                  color: shape===s.id ? 'white' : 'var(--text)',
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 影 */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" checked={shadow} onChange={e => setShadow(e.target.checked)}
              style={{ width:16, height:16, cursor:'pointer' }} />
            影をつける
          </label>
        </div>

        {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:10 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleSend} disabled={sending || !text.trim()}>
          {sending ? '送信中...' : '📤 このスタンプを送る'}
        </button>
      </div>
    </div>
  );
}
