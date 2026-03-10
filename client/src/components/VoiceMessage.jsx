import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

// 録音して音声メッセージを送るコンポーネント
export default function VoiceMessage({ roomId, currentUser, socket, onSent, onCancel }) {
  const [state, setState] = useState('idle'); // idle | recording | preview | sending
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    mediaRecorderRef.current?.stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setState('preview');
      };
      mr.start();
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => {
        if (d >= 59) {
          clearInterval(timerRef.current);
          cancelAnimationFrame(animRef.current);
          mediaRecorderRef.current?.stop();
          return 60;
        }
        return d + 1;
      }), 1000);
      drawWave();
    } catch(e) { alert('マイクのアクセスが必要やで'); }
  };

  const drawWave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
    const draw = () => {
      analyserRef.current.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#06c755';
      const bw = canvas.width / buf.length;
      buf.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        ctx.fillRect(i * bw, canvas.height - h, bw - 1, h);
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    mediaRecorderRef.current?.stop();
  };

  const send = async () => {
    if (!audioBlob) return;
    setState('sending');
    try {
      const form = new FormData();
      form.append('file', audioBlob, `voice_${Date.now()}.webm`);
      const res = await axios.post('/api/upload', form);
      socket?.emit('message:send', {
        roomId, senderId: currentUser.id, senderName: currentUser.display_name || currentUser.username,
        content: `🎤 音声メッセージ (${duration}秒)`,
        type: 'voice', fileData: { url: res.data.url, name: 'voice', duration },
      });
      onSent?.();
    } catch(e) { setState('preview'); alert('送信に失敗したで'); }
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid var(--primary)', borderRadius:20, padding:'12px 16px', margin:'4px 0', display:'flex', flexDirection:'column', gap:10 }}>
      {state === 'idle' && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, color:'var(--text2)' }}>🎤 音声メッセージを録音</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onCancel} style={{ padding:'6px 12px', borderRadius:12, border:'none', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', fontSize:13 }}>キャンセル</button>
            <button onClick={startRecording} style={{ padding:'6px 14px', borderRadius:12, border:'none', background:'var(--primary)', color:'white', cursor:'pointer', fontSize:13, fontWeight:700 }}>● 録音開始</button>
          </div>
        </div>
      )}
      {state === 'recording' && (
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ color:'#ff3b30', fontWeight:700, fontSize:14 }}>● {fmt(duration)}</span>
          <canvas ref={canvasRef} width={160} height={36} style={{ flex:1, borderRadius:8 }} />
          <button onClick={stopRecording} style={{ padding:'6px 14px', borderRadius:12, border:'none', background:'#ff3b30', color:'white', cursor:'pointer', fontSize:13, fontWeight:700 }}>■ 停止</button>
        </div>
      )}
      {state === 'preview' && (
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <audio src={audioUrl} controls style={{ flex:1, height:36 }} />
          <span style={{ fontSize:12, color:'var(--text2)', whiteSpace:'nowrap' }}>{fmt(duration)}</span>
          <button onClick={() => setState('idle')} style={{ padding:'6px 10px', borderRadius:10, border:'none', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', fontSize:13 }}>🗑️</button>
          <button onClick={send} style={{ padding:'6px 14px', borderRadius:12, border:'none', background:'var(--primary)', color:'white', cursor:'pointer', fontSize:13, fontWeight:700 }}>送信</button>
        </div>
      )}
      {state === 'sending' && <div style={{ textAlign:'center', color:'var(--text2)', fontSize:13 }}>送信中...</div>}
    </div>
  );
}

// 音声メッセージの再生バブル
export function VoiceMessageBubble({ msg, isMine }) {
  const url = msg.fileData?.url || msg.file_data?.url;
  const dur = msg.fileData?.duration || msg.file_data?.duration || 0;
  const SERVER = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
  const src = url?.startsWith('http') ? url : SERVER + url;
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:180 }}>
      <span style={{ fontSize:18 }}>🎤</span>
      <audio src={src} controls style={{ flex:1, height:32 }} />
      <span style={{ fontSize:11, color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--text2)' }}>{fmt(dur)}</span>
    </div>
  );
}
