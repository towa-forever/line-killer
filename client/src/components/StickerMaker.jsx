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

const TAB_DRAW = 'draw';
const TAB_IMAGE = 'image';
const TAB_PUBLISH = 'publish';

export default function StickerMaker({ onSend, onClose, mode }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState(mode === 'publish' ? TAB_PUBLISH : TAB_DRAW);

  // 描画タブ
  const [text, setText]           = useState('😊');
  const [fontSize, setFontSize]   = useState(60);
  const [bgColor, setBgColor]     = useState('#ffd93d');
  const [fontColor, setFontColor] = useState('#333333');
  const [font, setFont]           = useState('Arial');
  const [shape, setShape]         = useState('circle');
  const [shadow, setShadow]       = useState(false);

  // 画像タブ
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');

  // 出品タブ
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishPrice, setPublishPrice] = useState('0');
  const [publishStamps, setPublishStamps] = useState([{ emoji: '😊', label: '' }]);
  const [publishing, setPublishing] = useState(false);
  const [publishDone, setPublishDone] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const drawSticker = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath(); ctx.arc(W/2, H/2, W/2-2, 0, Math.PI*2); ctx.clip();
    } else if (shape === 'rounded') {
      const r = 30;
      ctx.beginPath();
      ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.arcTo(W,0,W,r,r);
      ctx.lineTo(W,H-r); ctx.arcTo(W,H,W-r,H,r);
      ctx.lineTo(r,H); ctx.arcTo(0,H,0,H-r,r);
      ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r);
      ctx.closePath(); ctx.clip();
    }
    if (bgColor !== 'transparent') { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    if (shadow) { ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=6; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2; }
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.fillStyle = fontColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    const lineH = fontSize * 1.2;
    const totalH = lineH * lines.length;
    lines.forEach((line, i) => { ctx.fillText(line, W/2, H/2 - totalH/2 + lineH*i + lineH/2); });
    ctx.shadowColor = 'transparent';
  }, [text, fontSize, bgColor, fontColor, font, shape, shadow]);

  useEffect(() => { if (tab === TAB_DRAW) drawSticker(); }, [drawSticker, tab]);

  // 画像ファイル選択
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('画像ファイルを選んでや'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('10MB以下の画像を選んでや'); return; }
    setError('');
    setUploadedImage(file);
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
  };

  // 送信（描画）
  const handleSendDraw = useCallback(async () => {
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
        } catch { setError('送信に失敗したで。もう一回試してな'); setSending(false); }
      }
    }, 'image/png');
  }, [text, onSend, onClose]);

  // 送信（画像）
  const handleSendImage = async () => {
    if (!uploadedImage) { setError('画像を選んでや'); return; }
    setSending(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadedImage, uploadedImage.name);
      const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSend({ type: 'sticker', fileData: { url: res.data.url }, content: '🎨 画像スタンプ' });
      onClose();
    } catch { setError('送信に失敗したで。もう一回試してな'); setSending(false); }
  };

  // 出品
  const handlePublish = async () => {
    if (!publishTitle.trim()) { setError('タイトルを入力してな'); return; }
    if (publishStamps.length === 0) { setError('スタンプを最低1個追加してな'); return; }
    setPublishing(true); setError('');
    try {
      const formData = new FormData();
      formData.append('title', publishTitle.trim());
      formData.append('description', publishDesc.trim());
      formData.append('price', publishPrice);
      formData.append('stamps', JSON.stringify(publishStamps));
      formData.append('tags', JSON.stringify([]));
      await axios.post('/api/stamp-market/publish', formData);
      setPublishDone(true);
    } catch (e) {
      setError(e.response?.data?.error || '出品に失敗したで');
    } finally { setPublishing(false); }
  };

  const tabStyle = (t) => ({
    flex:1, padding:'10px 0', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
    borderBottom: tab===t ? '2.5px solid var(--primary)' : '2.5px solid transparent',
    background: 'none', color: tab===t ? 'var(--primary)' : 'var(--text2)',
  });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:3000 }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:20, maxHeight:'92dvh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:18 }}>🎨 スタンプ</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        {/* タブ */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:16 }}>
          <button style={tabStyle(TAB_DRAW)} onClick={() => setTab(TAB_DRAW)}>✏️ 描く</button>
          <button style={tabStyle(TAB_IMAGE)} onClick={() => setTab(TAB_IMAGE)}>🖼️ 画像</button>
          <button style={tabStyle(TAB_PUBLISH)} onClick={() => setTab(TAB_PUBLISH)}>🛒 出品</button>
        </div>

        {/* ===== 描画タブ ===== */}
        {tab === TAB_DRAW && (<>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <canvas ref={canvasRef} width={200} height={200}
              style={{
                borderRadius: shape==='circle' ? '50%' : shape==='rounded' ? 20 : 0,
                border: '2px solid var(--border)',
                background: bgColor==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : 'transparent',
              }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>テキスト・絵文字（改行OK）</div>
            <textarea className="form-input" value={text} onChange={e => setText(e.target.value)}
              placeholder="😊 テキストや絵文字" maxLength={20} rows={2}
              style={{ marginBottom:0, fontSize:20, textAlign:'center', resize:'none' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>文字サイズ: {fontSize}px</div>
            <input type="range" min={16} max={100} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width:'100%' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>背景色</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {BGCOLORS.map(col => (
                <button key={col} onClick={() => setBgColor(col)} style={{
                  width:34, height:34, borderRadius:'50%', cursor:'pointer',
                  background: col==='transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,white 0% 50%) 0 0/16px 16px' : col,
                  border: bgColor===col ? '3px solid var(--text)' : '3px solid transparent',
                  outline: bgColor===col ? '2px solid var(--primary)' : 'none',
                }} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>文字色</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {FONT_COLORS.map(col => (
                <button key={col} onClick={() => setFontColor(col)} style={{
                  width:34, height:34, borderRadius:'50%', cursor:'pointer', background: col,
                  border: fontColor===col ? '3px solid var(--primary)' : '3px solid var(--border)',
                }} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>フォント</div>
            <div style={{ display:'flex', gap:8 }}>
              {FONTS.map(f => (
                <button key={f.id} onClick={() => setFont(f.id)} style={{
                  flex:1, padding:'7px 4px', borderRadius:10, fontSize:12, cursor:'pointer', border:'2px solid', fontFamily: f.id,
                  borderColor: font===f.id ? 'var(--primary)' : 'var(--border)',
                  background: font===f.id ? 'var(--primary)' : 'var(--surface2)',
                  color: font===f.id ? 'white' : 'var(--text)',
                }}>{f.label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>形状</div>
            <div style={{ display:'flex', gap:8 }}>
              {[{id:'circle',label:'⭕ 丸'},{id:'rounded',label:'🟦 角丸'},{id:'square',label:'⬛ 四角'}].map(s => (
                <button key={s.id} onClick={() => setShape(s.id)} style={{
                  flex:1, padding:'8px 0', borderRadius:10, fontSize:13, cursor:'pointer', border:'2px solid',
                  borderColor: shape===s.id ? 'var(--primary)' : 'var(--border)',
                  background: shape===s.id ? 'var(--primary)' : 'var(--surface2)',
                  color: shape===s.id ? 'white' : 'var(--text)',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
              <input type="checkbox" checked={shadow} onChange={e => setShadow(e.target.checked)} style={{ width:16, height:16 }} />
              影をつける
            </label>
          </div>
          {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:10 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleSendDraw} disabled={sending || !text.trim()}>
            {sending ? '送信中...' : '📤 このスタンプを送る'}
          </button>
        </>)}

        {/* ===== 画像タブ ===== */}
        {tab === TAB_IMAGE && (<>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            {uploadedImageUrl
              ? <img src={uploadedImageUrl} alt="preview" style={{ width:200, height:200, objectFit:'contain', borderRadius:16, border:'2px solid var(--border)' }} />
              : <div style={{ width:200, height:200, margin:'0 auto', borderRadius:16, border:'2px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text2)', fontSize:14, cursor:'pointer' }}
                  onClick={() => fileInputRef.current?.click()}>
                  🖼️<br/>画像を選ぶ
                </div>
            }
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
          <button onClick={() => fileInputRef.current?.click()} style={{
            width:'100%', padding:'12px', borderRadius:12, border:'2px dashed var(--border)',
            background:'var(--surface2)', color:'var(--text)', fontSize:14, cursor:'pointer', marginBottom:12,
          }}>
            📁 {uploadedImage ? '別の画像を選ぶ' : '画像を選ぶ（PNG・JPG・GIF等）'}
          </button>
          {uploadedImage && <div style={{ fontSize:12, color:'var(--text2)', textAlign:'center', marginBottom:12 }}>{uploadedImage.name}</div>}
          {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:10 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleSendImage} disabled={sending || !uploadedImage}>
            {sending ? '送信中...' : '📤 この画像をスタンプとして送る'}
          </button>
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
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>
              スタンプを出品してコインを稼ごう！売上の80%がクリエイターに還元されるで。
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>タイトル *</div>
              <input className="form-input" value={publishTitle} onChange={e => setPublishTitle(e.target.value)}
                placeholder="例：もちもちうさぎスタンプ" maxLength={30} style={{ marginBottom:0 }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>説明</div>
              <textarea className="form-input" value={publishDesc} onChange={e => setPublishDesc(e.target.value)}
                placeholder="スタンプの説明を書いてな" rows={2} style={{ marginBottom:0, resize:'none' }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>価格（コイン）</div>
              <input className="form-input" type="number" min={0} max={9999} value={publishPrice}
                onChange={e => setPublishPrice(e.target.value)} style={{ marginBottom:0 }} />
              <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>0で無料配布</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>スタンプ絵文字 *</div>
              {publishStamps.map((s, i) => (
                <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <input className="form-input" value={s.emoji} onChange={e => {
                    const arr = [...publishStamps]; arr[i] = { ...arr[i], emoji: e.target.value };
                    setPublishStamps(arr);
                  }} placeholder="😊" style={{ marginBottom:0, width:60, textAlign:'center', fontSize:20 }} />
                  <input className="form-input" value={s.label} onChange={e => {
                    const arr = [...publishStamps]; arr[i] = { ...arr[i], label: e.target.value };
                    setPublishStamps(arr);
                  }} placeholder="ラベル（任意）" style={{ marginBottom:0, flex:1 }} />
                  {publishStamps.length > 1 && (
                    <button onClick={() => setPublishStamps(publishStamps.filter((_,j) => j!==i))}
                      style={{ background:'none', border:'none', color:'var(--danger)', fontSize:20, cursor:'pointer' }}>✕</button>
                  )}
                </div>
              ))}
              {publishStamps.length < 20 && (
                <button onClick={() => setPublishStamps([...publishStamps, { emoji:'😊', label:'' }])}
                  style={{ width:'100%', padding:'8px', borderRadius:10, border:'2px dashed var(--border)',
                    background:'none', color:'var(--text2)', cursor:'pointer', fontSize:13 }}>
                  ＋ スタンプを追加
                </button>
              )}
            </div>
            {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginBottom:10 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={handlePublish} disabled={publishing || !publishTitle.trim()}>
              {publishing ? '出品中...' : '🛒 出品する'}
            </button>
          </>)}
        </>)}

      </div>
    </div>
  );
}
 
