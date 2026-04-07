import React, { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
};

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

export default function VoiceCall({ socket, currentUser, targetUser, roomId, isIncoming, onClose, callId: initCallId, incomingOffer }) {
  const [status, setStatus]     = useState(isIncoming ? 'incoming' : 'calling');
  const [elapsed, setElapsed]   = useState(0);
  const [muted, setMuted]       = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const pcRef        = useRef(null);
  const localStream  = useRef(null);
  const remoteAudio  = useRef(null);
  const callIdRef    = useRef(initCallId || null);
  const callStartRef = useRef(null);
  const timerRef     = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  }, []);

  const startTimer = () => {
    callStartRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
  };

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    pc.onicecandidate = e => { if (e.candidate) socket.emit('voice:ice', { to: targetUser.id, candidate: e.candidate, callId: callIdRef.current }); };
    // リモート音声受信（発信側・着信側共通）
    pc.ontrack = e => {
      if (e.streams?.[0]) {
        const audio = remoteAudio.current || new Audio();
        remoteAudio.current = audio;
        audio.srcObject = e.streams[0];
        audio.volume = speakerOn ? 1 : 0;
        audio.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { setStatus('active'); startTimer(); }
      if (['disconnected','failed','closed'].includes(pc.connectionState)) onClose();
    };
    return pc;
  }, [socket, targetUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // 発信
  const startCall = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      callIdRef.current = uuidv4();
      socket.emit('voice:start', { to: targetUser.id, from: currentUser, offer, callId: callIdRef.current, roomId });
    } catch (e) { console.error(e); onClose(); }
  }, [createPC, socket, targetUser, currentUser, roomId, onClose]);

  useEffect(() => {
    if (!isIncoming) startCall();

    // 音声受信
    const handleAnswer = async ({ answer }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    };
    const handleIce = async ({ candidate }) => {
      if (!pcRef.current) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };
    const handleEnd = () => { cleanup(); onClose(); };

    socket.on('voice:answer', handleAnswer);
    socket.on('voice:ice', handleIce);
    socket.on('voice:end', handleEnd);
    socket.on('voice:reject', handleEnd);

    return () => {
      socket.off('voice:answer', handleAnswer);
      socket.off('voice:ice', handleIce);
      socket.off('voice:end', handleEnd);
      socket.off('voice:reject', handleEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 着信応答
  const acceptCall = async () => {
    setStatus('active');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = incomingOffer || window.__voiceOffer;
      if (!offer) { console.error('[VoiceCall] incomingOffer がありません'); onClose(); return; }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice:answer', { to: targetUser.id, answer, callId: callIdRef.current });
      startTimer();
    } catch (e) { console.error(e); onClose(); }
  };

  const rejectCall = () => {
    socket.emit('voice:reject', { to: targetUser.id, callId: callIdRef.current });
    cleanup(); onClose();
  };

  const endCall = useCallback(() => {
    const duration = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0;
    socket.emit('voice:end', { to: targetUser.id, callId: callIdRef.current, duration, roomId });
    cleanup(); onClose();
  }, [socket, targetUser, cleanup, onClose, roomId]);

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(t => { t.enabled = muted; });
      setMuted(m => !m);
    }
  };

  const avatarSrc = targetUser?.avatar;

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:9000, color:'white' }}>
      {/* 相手情報 */}
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{ width:90, height:90, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 16px', overflow:'hidden',
          boxShadow: status==='active' ? '0 0 0 4px #06c755, 0 0 20px #06c75566' : '0 0 0 4px rgba(255,255,255,0.3)' }}>
          {avatarSrc ? <img src={avatarSrc} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (targetUser?.displayName?.[0] || '?')}
        </div>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>{targetUser?.displayName || targetUser?.username}</div>
        <div style={{ fontSize:14, opacity:0.7 }}>
          {status === 'calling'  ? '📞 呼び出し中...' :
           status === 'incoming' ? '📞 着信中...' :
           status === 'active'   ? `🔊 ${fmtTime(elapsed)}` : ''}
        </div>
      </div>

      {/* ボタン */}
      {status === 'incoming' ? (
        <div style={{ display:'flex', gap:40 }}>
          <button onClick={rejectCall} style={{ width:70, height:70, borderRadius:'50%', background:'#e74c3c', border:'none', fontSize:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>📵</button>
          <button onClick={acceptCall} style={{ width:70, height:70, borderRadius:'50%', background:'#06c755', border:'none', fontSize:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>📞</button>
        </div>
      ) : (
        <div style={{ display:'flex', gap:24 }}>
          <button onClick={toggleMute}
            style={{ width:60, height:60, borderRadius:'50%', background: muted ? '#e74c3c' : 'rgba(255,255,255,0.2)', border:'none', fontSize:24, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {muted ? '🔇' : '🎤'}
          </button>
          <button onClick={endCall}
            style={{ width:70, height:70, borderRadius:'50%', background:'#e74c3c', border:'none', fontSize:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            📵
          </button>
          <button onClick={() => {
              const next = !speakerOn;
              setSpeakerOn(next);
              if (remoteAudio.current) remoteAudio.current.volume = next ? 1 : 0;
            }}
            style={{ width:60, height:60, borderRadius:'50%', background: speakerOn ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border:'none', fontSize:24, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {speakerOn ? '🔊' : '🔈'}
          </button>
        </div>
      )}
    </div>
  );
}
