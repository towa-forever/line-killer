import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

// ===== 定数 =====
const BGCOLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9a3c','#00c9a7','#f72585','#ffffff','transparent'];
const FONT_COLORS = ['#333333','#ffffff','#ff3b30','#007aff','#34c759','#ff9500','#af52de','#ff2d55','#000000','#ffcc00'];
const FONTS = [
  { id: 'Arial', label: 'ゴシック' },
  { id: 'Georgia', label: 'セリフ' },
  { id: 'Courier New', label: '等幅' },
  { id: 'Comic Sans MS', label: 'ポップ' },
  { id: 'Impact', label: 'インパクト' },
  { id: 'Trebuchet MS', label: 'トレビシェ' },
];
const FRAMES = [
  { id: 'none', label: 'なし' },
  { id: 'circle', label: '丸' },
  { id: 'heart', label: 'ハート' },
  { id: 'star', label: '星' },
  { id: 'rounded', label: '角丸' },
];

const TAB_DRAW = 'draw';
const TAB_IMAGE = 'image';
const TAB_PUBLISH = 'publish';

const W = 300, H = 300;

// ===== ユーティリティ =====
function drawFrame(ctx, frame) {
  ctx.save();
  if (frame === 'circle') {
    ctx.beginPath(); ctx.arc(W/2, H/2, W/2-2, 0, Math.PI*2); ctx.clip();
  } else if (frame === 'rounded') {
    const r = 40;
    ctx.beginPath();
    ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.arcTo(W,0,W,r,r);
    ctx.lineTo(W,H-r); ctx.arcTo(W,H,W-r,H,r);
    ctx.lineTo(r,H); ctx.arcTo(0,H,0,H-r,r);
    ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r);
    ctx.closePath(); ctx.clip();
  } else if (frame === 'heart') {
    ctx.beginPath();
    ctx.moveTo(W/2, H*0.85);
    ctx.bezierCurveTo(W*0.1, H*0.6, W*0.0, H*0.3, W/2, H*0.25);
    ctx.bezierCurveTo(W*1.0, H*0.3, W*0.9, H*0.6, W/2, H*0.85);
    ctx.clip();
  } else if (frame === 'star') {
    const cx=W/2, cy=H/2, r1=W/2-2, r2=W/4;
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const r=i%2===0?r1:r2;
      const a=Math.PI/5*i-Math.PI/2;
      if(i===0) ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a));
      else ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));
    }
    ctx.closePath(); ctx.clip();
  }
  ctx.restore();
}

// ===== メインコンポーネント =====
export default function StickerMaker({ onSend, onClose, mode }) {
  const canvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  const [tab, setTab] = useState(mode === 'publish' ? TAB_PUBLISH : TAB_DRAW);

  // ===== 描くタブ =====
  const [text, setText] = useState('😊');
  const [fontSize, setFontSize] = useState(80);
  const [bgColor, setBgColor] = useState('#ffd93d');
  const [fontColor, setFontColor] = useState('#333333');
  const [font, setFont] = useState('Arial');
  const [frame, setFrame] = useState('circle');
  const [shadow, setShadow] = useState(false);
  const [strokeEnabled, setStrokeEnabled] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [drawMode, setDrawMode] = useState('text'); // 'text' | 'freehand'
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState('#333333');
  const [drawHistory, setDrawHistory] = useState([]);

  // ===== 画像タブ =====
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [imgObj, setImgObj] = useState(null);
  const [imgBrightness, setImgBrightness] = useState(100);
  const [imgContrast, setImgContrast] = useState(100);
  const [imgRotation, setImgRotation] = useState(0);
  const [imgScale, setImgScale] = useState(1);
  const [imgFrame, setImgFrame] = useState('none');
  const [imgText, setImgText] = useState('');
  const [imgTextColor, setImgTextColor] = useState('#ffffff');
  const [imgTextSize, setImgTextSize] = useState(32);
  const [imgEditMode, setImgEditMode] = useState('adjust'); // 'adjust'|'crop'|'text'

  // ===== 出品タブ =====
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishPrice, setPublishPrice] = useState('0');
  const [publishStamps, setPublishStamps] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [publishDone, setPublishDone] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // ===== 描画 =====
  const drawSticker = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawMode !== 'text') return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    drawFrame(ctx, frame);
    if (bgColor !== 'transparent') { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H); }
    ctx.restore();

    if (shadow) { ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=8; ctx.shadowOffsetX=3; ctx.shadowOffsetY=3; }
    ctx.font = `bold ${fontSize}px "${font}"`;
    ctx.fillStyle = fontColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (strokeEnabled) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = fontSize / 8;
      ctx.lineJoin = 'round';
    }

    const lines = text.split('\n');
    const lineH = fontSize * 1.25;
    const totalH = lineH * lines.length;
    lines.forEach((line, i) => {
      const y = H/2 - totalH/2 + lineH*i + lineH/2;
      if (strokeEnabled) ctx.strokeText(line, W/2, y);
      ctx.fillText(line, W/2, y);
    });
    ctx.shadowColor = 'transparent';
  }, [text, fontSize, bgColor, fontColor, font, frame, shadow, strokeEnabled, strokeColor, drawMode]);

  useEffect(() => { if (tab === TAB_DRAW) drawSticker(); }, [drawSticker, tab]);

  // 手書きモード
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e) => {
    if (drawMode !== 'freehand') return;
    e.preventDefault();
    isDrawing.current = true;
    const canvas = drawCanvasRef.current;
    lastPos.current = getPos(e, canvas);
  }, [drawMode]);

  const draw = useCallback((e) => {
    if (!isDrawing.current || drawMode !== 'freehand') return;
    e.preventDefault();
    const canvas = drawCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [drawMode, brushColor, brushSize]);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = drawCanvasRef.current;
    setDrawHistory(prev => [...prev, canvas.toDataURL()]);
  }, []);

  const undoDraw = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (drawHistory.length === 0) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const newHistory = [...drawHistory];
    newHistory.pop();
    setDrawHistory(newHistory);
    if (newHistory.length === 0) {
      ctx.clearRect(0, 0, W, H);
    } else {
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, 0); };
      img.src = newHistory[newHistory.length - 1];
    }
  };

  const clearDraw = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    setDrawHistory([]);
  };

  // ===== 画像描画 =====
  const drawImageCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.filter = `brightness(${imgBrightness}%) contrast(${imgContrast}%)`;
    ctx.translate(W/2, H/2);
    ctx.rotate((imgRotation * Math.PI) / 180);
    ctx.scale(imgScale, imgScale);

    drawFrame(ctx, imgFrame);

    const ratio = Math.min(W / imgObj.width, H / imgObj.height);
    const dw = imgObj.width * ratio;
    const dh = imgObj.height * ratio;
    ctx.drawImage(imgObj, -dw/2, -dh/2, dw, dh);
    ctx.restore();

    if (imgText) {
      ctx.font = `bold ${imgTextSize}px Arial`;
      ctx.fillStyle = imgTextColor;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeText(imgText, W/2, H - 10);
      ctx.fillText(imgText, W/2, H - 10);
    }
  }, [imgObj, imgBrightness, imgContrast, imgRotation, imgScale, imgFrame, imgText, imgTextColor, imgTextSize]);

  useEffect(() => { if (tab === TAB_IMAGE) drawImageCanvas(); }, [drawImageCanvas, tab]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('画像ファイルを選んでや'); return; }
    setError('');
    setUploadedImage(file);
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    const img = new Image();
    img.onload = () => setImgObj(img);
    img.src = url;
  };

  // ===== キャンバスをblobに変換 =====
  const getCanvasBlob = (canvas, overlayCanvas) => new Promise((resolve) => {
    if (overlayCanvas) {
      const merged = document.createElement('canvas');
      merged.width = W; merged.height = H;
      const ctx = merged.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      ctx.drawImage(overlayCanvas, 0, 0);
      merged.toBlob(resolve, 'image/png');
    } else {
      canvas.toBlob(resolve, 'image/png');
    }
  });

  // ===== 送信（描く） =====
  const handleSendDraw = async () => {
    const canvas = canvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!canvas) return;
    setSending(true); setError('');
    try {
      const blob = await getCanvasBlob(canvas, drawMode === 'freehand' ? drawCanvas : null);
      const formData = new FormData();
      formData.append('file', blob, 'sticker.png');
      const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSend({ type: 'sticker', fileData: { url: res.data.url }, content: '🎨 自作スタンプ' });
      onClose();
    } catch {
      try {
        const merged = document.createElement('canvas');
        merged.width = W; merged.height = H;
        const ctx = merged.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        if (drawMode === 'freehand' && drawCanvasRef.current) ctx.drawImage(drawCanvasRef.current, 0, 0);
        onSend({ type: 'sticker', fileData: { url: merged.toDataURL('image/png') }, content: '🎨 自作スタンプ' });
        onClose();
      } catch { setError('送信に失敗したで'); setSending(false); }
    }
  };

  // ===== 送信（画像） =====
  const handleSendImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) { setError('画像を選んでや'); return; }
    setSending(true); setError('');
    try {
      const blob = await getCanvasBlob(canvas, null);
      const formData = new FormData();
      formData.append('file', blob, 'sticker.png');
      const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSend({ type: 'sticker', fileData: { url: res.data.url }, content: '🎨 画像スタンプ' });
      onClose();
    } catch { setError('送信に失敗したで'); setSending(false); }
  };

  // ===== 出品用に追加 =====
  const addToPublish = async (sourceCanvas, overlayCanvas) => {
    try {
      const blob = await getCanvasBlob(sourceCanvas, overlayCanvas);
      const url = URL.createObjectURL(blob);
      setPublishStamps(prev => [...prev, { blob, url, label: '' }]);
      setTab(TAB_PUBLISH);
    } catch { setError('追加に失敗したで'); }
  };

  // ===== 出品 =====
  const handlePublish = async () => {
    if (!publishTitle.trim()) { setError('タイトルを入力してな'); return; }
    if (publishStamps.length === 0) { setError('スタンプを最低1個追加してな'); return; }
    setPublishing(true); setError('');
    try {
      const uploadedStamps = [];
      for (const s of publishStamps) {
        const formData = new FormData();
        formData.append('file', s.blob, 'stamp.png');
        const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        uploadedStamps.push({ emoji: res.data.url, label: s.label });
      }
      const formData = new FormData();
      formData.append('title', publishTitle.trim());
      formData.append('description', publishDesc.trim());
      formData.append('price', publishPrice);
      formData.append('stamps', JSON.stringify(uploadedStamps));
      formData.append('tags', JSON.stringify([]));
      await axios.post('/api/stamp-market/publish', formData);
      setPublishDone(true);
    } catch (e) {
      setError(e.response?.data?.error || '出品に失敗したで');
    } finally { setPublishing(false); }
  };

  // ===== スタイル =====
  const tabStyle = (t) => ({
    flex:1, padding:'10px 0', border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
    borderBottom: tab===t ? '2.5px solid var(--primary)' : '2.5px solid transparent',
    background: 'none', color: tab===t ? 'var(--primary)' : 'var(--text2)',
  });
  const btnSm = (active) => ({
    padding:'6px 10px', borderRadius:8, border:'2px solid',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    background: active ? 'var(--primary)' : 'var(--surface2)',
    color: active ? 'white' : 'var(--text)', cursor:'pointer', fontSize:12,
  });

  const canvasStyle = {
    width:'100%', maxWidth:W, height:'auto', display:'block', margin:'0 auto',
    border:'2px solid var(--border)', borderRadius:12,
    background: bgColor==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : 'transparent',
    touchAction:'none',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:3000 }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:500, padding:'16px 16px 32px', maxHeight:'95dvh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:18, color:'var(--text)' }}>🎨 スタンプメーカー</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        {/* タブ */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:14 }}>
          {mode !== 'publish' && <button style={tabStyle(TAB_DRAW)} onClick={() => setTab(TAB_DRAW)}>✏️ 描く</button>}
          {mode !== 'publish' && <button style={tabStyle(TAB_IMAGE)} onClick={() => setTab(TAB_IMAGE)}>🖼️ 画像</button>}
          <button style={tabStyle(TAB_PUBLISH)} onClick={() => setTab(TAB_PUBLISH)}>🛒 出品 {publishStamps.length > 0 && `(${publishStamps.length})`}</button>
        </div>

        {/* ===== 描くタブ ===== */}
        {tab === TAB_DRAW && (<>
          {/* モード切替 */}
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <button style={btnSm(drawMode==='text')} onClick={() => setDrawMode('text')}>Ａ テキスト</button>
            <button style={btnSm(drawMode==='freehand')} onClick={() => setDrawMode('freehand')}>✍️ 手書き</button>
          </div>

          {/* キャンバス */}
          <div style={{ position:'relative', marginBottom:12 }}>
            <canvas ref={canvasRef} width={W} height={H} style={canvasStyle} />
            {drawMode === 'freehand' && (
              <canvas ref={drawCanvasRef} width={W} height={H}
                style={{ ...canvasStyle, position:'absolute', top:0, left:0, background:'transparent', border:'none' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
            )}
          </div>

          {drawMode === 'freehand' && (
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <button onClick={undoDraw} style={btnSm(false)}>↩️ 戻す</button>
              <button onClick={clearDraw} style={btnSm(false)}>🗑️ 全消し</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'var(--text2)', marginBottom:3 }}>ブラシサイズ: {brushSize}</div>
                <input type="range" min={2} max={40} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
            </div>
          )}

          {drawMode === 'freehand' && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>ブラシ色</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FONT_COLORS.map(col => (
                  <button key={col} onClick={() => setBrushColor(col)} style={{
                    width:30, height:30, borderRadius:'50%', cursor:'pointer', background:col,
                    border: brushColor===col ? '3px solid var(--primary)' : '3px solid var(--border)',
                  }} />
                ))}
              </div>
            </div>
          )}

          {drawMode === 'text' && (<>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>テキスト・絵文字</div>
              <textarea className="form-input" value={text} onChange={e => setText(e.target.value)}
                placeholder="😊 テキストや絵文字" maxLength={30} rows={2}
                style={{ marginBottom:0, fontSize:18, textAlign:'center', resize:'none' }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>文字サイズ: {fontSize}px</div>
              <input type="range" min={16} max={140} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width:'100%' }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>フォント</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FONTS.map(f => (
                  <button key={f.id} onClick={() => setFont(f.id)} style={{
                    padding:'5px 8px', borderRadius:8, fontSize:11, cursor:'pointer', border:'2px solid',
                    fontFamily: f.id,
                    borderColor: font===f.id ? 'var(--primary)' : 'var(--border)',
                    background: font===f.id ? 'var(--primary)' : 'var(--surface2)',
                    color: font===f.id ? 'white' : 'var(--text)',
                  }}>{f.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>文字色</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FONT_COLORS.map(col => (
                  <button key={col} onClick={() => setFontColor(col)} style={{
                    width:30, height:30, borderRadius:'50%', cursor:'pointer', background:col,
                    border: fontColor===col ? '3px solid var(--primary)' : '3px solid var(--border)',
                  }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>背景色</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {BGCOLORS.map(col => (
                  <button key={col} onClick={() => setBgColor(col)} style={{
                    width:30, height:30, borderRadius:'50%', cursor:'pointer',
                    background: col==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : col,
                    border: bgColor===col ? '3px solid var(--primary)' : '3px solid transparent',
                    outline: bgColor===col ? '2px solid var(--primary)' : 'none',
                  }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>フレーム</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FRAMES.map(f => (
                  <button key={f.id} onClick={() => setFrame(f.id)} style={btnSm(frame===f.id)}>{f.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:12, marginBottom:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
                <input type="checkbox" checked={shadow} onChange={e => setShadow(e.target.checked)} />影
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
                <input type="checkbox" checked={strokeEnabled} onChange={e => setStrokeEnabled(e.target.checked)} />縁取り
              </label>
              {strokeEnabled && (
                <div style={{ display:'flex', gap:6 }}>
                  {['#ffffff','#000000','#ff0000','#ffff00'].map(col => (
                    <button key={col} onClick={() => setStrokeColor(col)} style={{
                      width:24, height:24, borderRadius:'50%', background:col, cursor:'pointer',
                      border: strokeColor===col ? '2px solid var(--primary)' : '2px solid var(--border)',
                    }} />
                  ))}
                </div>
              )}
            </div>
          </>)}

          {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:8 }}>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            {mode !== 'publish' && (
              <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSendDraw} disabled={sending}>
                {sending ? '送信中...' : '📤 送る'}
              </button>
            )}
            <button className="btn" style={{ flex:1, background:'var(--surface2)', color:'var(--text)', border:'2px solid var(--border)' }}
              onClick={() => addToPublish(canvasRef.current, drawMode==='freehand' ? drawCanvasRef.current : null)}>
              🛒 出品リストに追加
            </button>
          </div>
        </>)}

        {/* ===== 画像タブ ===== */}
        {tab === TAB_IMAGE && (<>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
          {!imgObj ? (
            <div style={{ textAlign:'center', padding:32, border:'2px dashed var(--border)', borderRadius:16, marginBottom:12, cursor:'pointer' }}
              onClick={() => fileInputRef.current?.click()}>
              <div style={{ fontSize:48 }}>🖼️</div>
              <div style={{ color:'var(--text2)', fontSize:14 }}>タップして画像を選ぶ</div>
              <div style={{ color:'var(--text2)', fontSize:12 }}>PNG・JPG・GIF・WebP対応</div>
            </div>
          ) : (
            <canvas ref={canvasRef} width={W} height={H} style={{ ...canvasStyle, marginBottom:12 }} />
          )}

          {imgObj && (<>
            {/* 編集モード切替 */}
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {['adjust','text'].map(m => (
                <button key={m} style={btnSm(imgEditMode===m)} onClick={() => setImgEditMode(m)}>
                  {m==='adjust' ? '🎛️ 調整' : '💬 テキスト'}
                </button>
              ))}
              <button onClick={() => fileInputRef.current?.click()} style={btnSm(false)}>📁 変更</button>
            </div>

            {imgEditMode === 'adjust' && (<>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>明るさ: {imgBrightness}%</div>
                <input type="range" min={0} max={200} value={imgBrightness} onChange={e => setImgBrightness(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>コントラスト: {imgContrast}%</div>
                <input type="range" min={0} max={200} value={imgContrast} onChange={e => setImgContrast(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>回転: {imgRotation}°</div>
                <input type="range" min={0} max={360} value={imgRotation} onChange={e => setImgRotation(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>サイズ: {Math.round(imgScale*100)}%</div>
                <input type="range" min={0.3} max={3} step={0.05} value={imgScale} onChange={e => setImgScale(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>フレーム</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {FRAMES.map(f => (
                    <button key={f.id} onClick={() => setImgFrame(f.id)} style={btnSm(imgFrame===f.id)}>{f.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => { setImgBrightness(100); setImgContrast(100); setImgRotation(0); setImgScale(1); }}
                style={{ ...btnSm(false), marginBottom:12 }}>🔄 リセット</button>
            </>)}

            {imgEditMode === 'text' && (<>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>テキスト</div>
                <input className="form-input" value={imgText} onChange={e => setImgText(e.target.value)}
                  placeholder="テキストを追加" style={{ marginBottom:0 }} />
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>文字サイズ: {imgTextSize}px</div>
                <input type="range" min={12} max={80} value={imgTextSize} onChange={e => setImgTextSize(Number(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>文字色</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {FONT_COLORS.map(col => (
                    <button key={col} onClick={() => setImgTextColor(col)} style={{
                      width:28, height:28, borderRadius:'50%', cursor:'pointer', background:col,
                      border: imgTextColor===col ? '3px solid var(--primary)' : '3px solid var(--border)',
                    }} />
                  ))}
                </div>
              </div>
            </>)}
          </>)}

          {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:8 }}>{error}</div>}
          {imgObj && (
            <div style={{ display:'flex', gap:8 }}>
              {mode !== 'publish' && (
                <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSendImage} disabled={sending}>
                  {sending ? '送信中...' : '📤 送る'}
                </button>
              )}
              <button className="btn" style={{ flex:1, background:'var(--surface2)', color:'var(--text)', border:'2px solid var(--border)' }}
                onClick={() => addToPublish(canvasRef.current, null)}>
                🛒 出品リストに追加
              </button>
            </div>
          )}
        </>)}

        {/* ===== 出品タブ ===== */}
        {tab === TAB_PUBLISH && (<>
          {publishDone ? (
            <div style={{ textAlign:'center', padding:32 }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
              <div style={{ fontWeight:800, fontSize:18, color:'var(--text)', marginBottom:8 }}>出品完了！</div>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>スタンプ販売所に掲載されたで！</div>
              <button className="btn btn-primary" onClick={onClose}>閉じる</button>
            </div>
          ) : (<>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>
              スタンプをセットにして出品しよ！売上の80%がクリエイターに還元されるで。
            </div>

            {/* スタンプリスト */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:700 }}>
                スタンプセット ({publishStamps.length}個)
              </div>
              {publishStamps.length === 0 ? (
                <div style={{ padding:16, border:'2px dashed var(--border)', borderRadius:12, textAlign:'center', color:'var(--text2)', fontSize:13 }}>
                  「描く」「画像」タブで作って「出品リストに追加」してや！
                </div>
              ) : (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                  {publishStamps.map((s, i) => (
                    <div key={i} style={{ position:'relative' }}>
                      <img src={s.url} alt="" style={{ width:64, height:64, objectFit:'cover', borderRadius:8, border:'2px solid var(--border)' }} />
                      <button onClick={() => setPublishStamps(prev => prev.filter((_,j) => j!==i))}
                        style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%',
                          background:'var(--danger)', border:'none', color:'white', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:'flex', gap:8 }}>
                <button style={btnSm(false)} onClick={() => setTab(TAB_DRAW)}>✏️ 描いて追加</button>
                <button style={btnSm(false)} onClick={() => setTab(TAB_IMAGE)}>🖼️ 画像から追加</button>
              </div>
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>タイトル *</div>
              <input className="form-input" value={publishTitle} onChange={e => setPublishTitle(e.target.value)}
                placeholder="例：もちもちうさぎスタンプ" maxLength={30} style={{ marginBottom:0 }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>説明</div>
              <textarea className="form-input" value={publishDesc} onChange={e => setPublishDesc(e.target.value)}
                placeholder="スタンプの説明を書いてな" rows={2} style={{ marginBottom:0, resize:'none' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>価格（コイン）</div>
              <input className="form-input" type="number" min={0} max={9999} value={publishPrice}
                onChange={e => setPublishPrice(e.target.value)} style={{ marginBottom:0 }} />
              <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>0で無料配布</div>
            </div>

            {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:8 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={handlePublish}
              disabled={publishing || !publishTitle.trim() || publishStamps.length === 0}>
              {publishing ? '出品中...' : `🛒 ${publishStamps.length}個のスタンプを出品する`}
            </button>
          </>)}
        </>)}
      </div>
    </div>
  );
}
