import React, { useRef, useEffect, useState, useCallback } from 'react';

// 共有ホワイトボード
// socket events: whiteboard:draw, whiteboard:clear, whiteboard:sync
export default function SharedWhiteboard({ socket, roomId, onClose }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'line' | 'rect'
  const [color, setColor] = useState('#222222');
  const [lineWidth, setLineWidth] = useState(3);
  const [participants, setParticipants] = useState(1);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawLine = useCallback((ctx, x0, y0, x1, y1, col, width, isEraser) => {
    ctx.save();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }, []);

  // ソケットで他ユーザーの描画を受信
  useEffect(() => {
    if (!socket) return;

    const handleDraw = ({ x0, y0, x1, y1, color: c, lineWidth: lw, eraser }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      drawLine(ctx, x0, y0, x1, y1, c, lw, eraser);
    };

    const handleClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleSync = ({ imageData }) => {
      if (!imageData) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = imageData;
    };

    const handleParticipants = ({ count }) => setParticipants(count);

    socket.on('whiteboard:draw', handleDraw);
    socket.on('whiteboard:clear', handleClear);
    socket.on('whiteboard:sync', handleSync);
    socket.on('whiteboard:participants', handleParticipants);

    // 参加時に既存の描画を要求
    socket.emit('whiteboard:join', { roomId });

    return () => {
      socket.off('whiteboard:draw', handleDraw);
      socket.off('whiteboard:clear', handleClear);
      socket.off('whiteboard:sync', handleSync);
      socket.off('whiteboard:participants', handleParticipants);
      socket.emit('whiteboard:leave', { roomId });
    };
  }, [socket, roomId, drawLine]);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    const { x: x0, y: y0 } = lastPos.current;
    const { x: x1, y: y1 } = pos;
    const isEraser = tool === 'eraser';
    const col = isEraser ? '#ffffff' : color;
    const lw = isEraser ? lineWidth * 4 : lineWidth;

    drawLine(ctx, x0, y0, x1, y1, col, lw, isEraser);

    // 他ユーザーに送信
    socket?.emit('whiteboard:draw', { roomId, x0, y0, x1, y1, color: col, lineWidth: lw, eraser: isEraser });

    lastPos.current = pos;
  }, [tool, color, lineWidth, socket, roomId, drawLine]);

  const stopDraw = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket?.emit('whiteboard:clear', { roomId });
  }, [socket, roomId]);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [roomId]);

  const COLORS = ['#222222', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, padding: 16,
        width: 'min(95vw, 900px)', maxHeight: '95vh',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            🎨 共有ホワイトボード
            <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>
              👥 {participants}人が参加中
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
        </div>

        {/* ツールバー */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* ツール選択 */}
          {[{ id: 'pen', label: '✏️ ペン' }, { id: 'eraser', label: '🧹 消しゴム' }].map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              style={{
                padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                background: tool === t.id ? 'var(--primary)' : 'var(--bg2)',
                color: tool === t.id ? '#fff' : 'var(--text)',
                fontWeight: tool === t.id ? 700 : 400,
              }}
            >{t.label}</button>
          ))}

          <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px' }} />

          {/* 色選択 */}
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              style={{
                width: 24, height: 24, borderRadius: '50%', border: color === c ? '3px solid var(--primary)' : '2px solid var(--border)',
                background: c, cursor: 'pointer', flexShrink: 0,
                boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 4px var(--primary)' : 'none',
              }}
            />
          ))}

          <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px' }} />

          {/* 線の太さ */}
          <input
            type="range" min={1} max={20} value={lineWidth}
            onChange={e => setLineWidth(Number(e.target.value))}
            style={{ width: 80 }}
            title="線の太さ"
          />
          <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 20 }}>{lineWidth}px</span>

          <div style={{ flex: 1 }} />

          {/* 操作ボタン */}
          <button onClick={handleSave} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 13 }}>
            💾 保存
          </button>
          <button onClick={handleClear} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
            🗑️ クリア
          </button>
        </div>

        {/* キャンバス */}
        <canvas
          ref={canvasRef}
          width={1200}
          height={700}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '60vh',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: '#ffffff',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}
