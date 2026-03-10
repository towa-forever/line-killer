import React, { useEffect, useRef, useState, useCallback } from 'react';

// 無料TURNサーバー（複数用意して冗長性を確保）
const ICE_SERVERS = {
  iceServers: [
    // Google STUN（信頼性高い）
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // Cloudflare STUN
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Metered.ca 無料TURN（複数ポート・プロトコル）
    { urls: 'turn:openrelay.metered.ca:80',            username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',           username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',          username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    // FreeTURN（バックアップ）
    { urls: 'turn:freestun.net:3479',  username: 'free', credential: 'free' },
    { urls: 'turns:freestun.net:5350', username: 'free', credential: 'free' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd, minimized, onToggleMinimize }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidateBuffer = useRef([]);
  const remoteDescSet = useRef(false);
  const [status, setStatus] = useState(isCaller ? 'ringing' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [iceState, setIceState] = useState('');
  const screenTrackRef = useRef(null);
  const endedRef = useRef(false);

  const safeEnd = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('ended');
    setTimeout(onEnd, 1200);
  }, [onEnd]);

  const flushBuffer = async (pc) => {
    const buf = [...iceCandidateBuffer.current];
    iceCandidateBuffer.current = [];
    for (const c of buf) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
  };

  const initPC = useCallback((stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    // トラックを追加
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      const srcObj = e.streams?.[0] ?? (() => {
        const ms = new MediaStream();
        ms.addTrack(e.track);
        return ms;
      })();
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = srcObj;
        remoteVideoRef.current.play().catch(() => {});
      }
      setStatus('active');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState);
      if (['connected', 'completed'].includes(pc.iceConnectionState)) {
        setStatus('active');
      }
      if (pc.iceConnectionState === 'failed') {
        // ICE再起動を試みる
        try { pc.restartIce(); } catch (_) {}
      }
      if (pc.iceConnectionState === 'disconnected') {
        // 5秒待って回復しなければ終了
        setTimeout(() => {
          if (pcRef.current?.iceConnectionState === 'disconnected') safeEnd();
        }, 5000);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('active');
      if (['failed', 'closed'].includes(pc.connectionState)) safeEnd();
    };

    return pc;
  }, [socket, targetUserId, safeEnd]);

  useEffect(() => {
    if (!socket) return;
    let mounted = true;

    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return null; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        return stream;
      } catch {
        // カメラなしでも音声だけで続行
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!mounted) { stream.getTracks().forEach(t => t.stop()); return null; }
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          return stream;
        } catch {
          if (mounted) setError('マイク・カメラへのアクセスが拒否されました');
          return null;
        }
      }
    };

    const startCall = async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      const pc = initPC(stream);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('call:start', { roomId, offer: pc.localDescription, to: targetUserId });
    };

    const answerCall = async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      const pc = initPC(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      remoteDescSet.current = true;
      await flushBuffer(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { answer: pc.localDescription, to: targetUserId });
    };

    // ===== シグナリングイベント =====
    socket.on('call:answered', async ({ answer }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSet.current = true;
        await flushBuffer(pcRef.current);
      } catch (_) {}
    });

    socket.on('call:ice', async ({ candidate }) => {
      if (!candidate) return;
      if (remoteDescSet.current && pcRef.current) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
      } else {
        iceCandidateBuffer.current.push(candidate);
      }
    });

    socket.on('call:ended', safeEnd);
    socket.on('call:rejected', () => { setStatus('rejected'); setTimeout(onEnd, 1200); });

    if (isCaller) startCall(); else answerCall();

    return () => {
      mounted = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} }
      socket.off('call:answered');
      socket.off('call:ice');
      socket.off('call:ended');
      socket.off('call:rejected');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const audio = localStreamRef.current?.getAudioTracks() || [];
      localStreamRef.current = new MediaStream([newTrack, ...audio]);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
    } catch (_) {}
  };

  const endCall = () => {
    socket?.emit('call:end', { roomId, to: targetUserId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch (_) {}
    onEnd();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(c => !c);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        const track = cam.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
        const audio = localStreamRef.current?.getAudioTracks() || [];
        localStreamRef.current = new MediaStream([track, ...audio]);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      } catch (_) {}
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = screen.getVideoTracks()[0];
        screenTrackRef.current = track;
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        const audio = localStreamRef.current?.getAudioTracks() || [];
        if (localVideoRef.current) localVideoRef.current.srcObject = new MediaStream([track, ...audio]);
        track.onended = () => { setIsScreenSharing(false); };
        setIsScreenSharing(true);
      } catch (e) {
        if (e.name !== 'NotAllowedError') setError('画面共有を開始できませんでした');
      }
    }
  };

  const statusText = { connecting: '接続中…', ringing: '呼び出し中…', ended: '通話終了', rejected: '拒否されました' };
  const iceLabel = { checking: '🔄 経路確認中', failed: '⚠️ 経路確立失敗', disconnected: '⚠️ 接続が切れました' };

  if (minimized) {
    return (
      <div style={{ position:'fixed', bottom:80, right:12, zIndex:4000, width:160, height:200,
        borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', background:'#111', cursor:'pointer' }}>
        <video ref={remoteVideoRef} autoPlay playsInline webkit-playsinline="true"
          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position:'absolute', bottom:6, right:6, width:44, height:60,
            objectFit:'cover', borderRadius:8, border:'1.5px solid white' }} />
        <button onClick={onToggleMinimize} style={{ position:'absolute', top:6, left:6,
          background:'rgba(0,0,0,0.5)', border:'none', borderRadius:8, color:'white', fontSize:14, padding:'3px 7px', cursor:'pointer' }}>⛶</button>
        <button onClick={endCall} style={{ position:'absolute', top:6, right:6,
          background:'#e74c3c', border:'none', borderRadius:8, color:'white', fontSize:14, padding:'3px 7px', cursor:'pointer' }}>✕</button>
        {status !== 'active' && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.7)',
            color:'white', fontSize:11, textAlign:'center', padding:4 }}>{statusText[status]}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', flexDirection:'column', zIndex:5000 }}>
      <div style={{ position:'relative', flex:1, background:'#111' }}>
        <video ref={remoteVideoRef} autoPlay playsInline webkit-playsinline="true"
          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position:'absolute', bottom:14, right:14, width:90, height:130,
            objectFit:'cover', borderRadius:12, border:'2px solid white', boxShadow:'0 2px 12px rgba(0,0,0,0.5)' }} />

        {status !== 'active' && (
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            color:'white', fontSize:18, fontWeight:700, background:'rgba(0,0,0,0.6)',
            padding:'12px 24px', borderRadius:24, whiteSpace:'nowrap', textAlign:'center' }}>
            {statusText[status] || ''}
            {status === 'ringing' && <div style={{ fontSize:13, marginTop:6, opacity:0.7 }}>相手が応答するのを待っています</div>}
          </div>
        )}

        {/* ICE接続状態ヒント */}
        {status === 'active' && iceLabel[iceState] && (
          <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)',
            background:'rgba(0,0,0,0.65)', color:'white', fontSize:12, padding:'4px 12px',
            borderRadius:16, whiteSpace:'nowrap' }}>{iceLabel[iceState]}</div>
        )}

        {error && (
          <div style={{ position:'absolute', top:20, left:16, right:16, color:'#ff6b6b',
            background:'rgba(0,0,0,0.75)', borderRadius:10, padding:'8px 14px', fontSize:13, textAlign:'center' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {status !== 'ended' && status !== 'rejected' && (
        <div style={{ display:'flex', gap:16, padding:'16px 20px',
          paddingBottom:`calc(20px + env(safe-area-inset-bottom))`,
          justifyContent:'center', alignItems:'center', background:'rgba(0,0,0,0.85)',
          flexWrap:'wrap' }}>
          <CallBtn onClick={toggleMute} active={isMuted} activeColor="#c0392b" label={isMuted ? 'ミュート中' : 'マイク'}>{isMuted ? '🔇' : '🎤'}</CallBtn>
          <CallBtn onClick={toggleCamera} active={isCamOff} activeColor="#c0392b" label={isCamOff ? 'カメラオフ' : 'カメラ'}>{isCamOff ? '📷' : '📹'}</CallBtn>
          <CallBtn onClick={switchCamera} label="カメラ切替">🔄</CallBtn>
          <CallBtn onClick={toggleScreenShare} active={isScreenSharing} activeColor="#f39c12" label={isScreenSharing ? '共有中' : '画面共有'}>{isScreenSharing ? '🖥️' : '📺'}</CallBtn>
          <CallBtn onClick={onToggleMinimize} label="チャットへ">💬</CallBtn>
          <CallBtn onClick={endCall} activeColor="#e74c3c" active={true} size={64} label="終了">📵</CallBtn>
        </div>
      )}
    </div>
  );
}

function CallBtn({ children, onClick, active, activeColor = 'rgba(255,255,255,0.25)', label, size = 56 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <button onClick={onClick} style={{
        width:size, height:size, borderRadius:'50%',
        background: active ? activeColor : 'rgba(255,255,255,0.15)',
        fontSize: size >= 60 ? 26 : 22, border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0, transition:'transform 0.1s, background 0.15s',
        WebkitTapHighlightColor:'transparent',
      }}
        onMouseDown={e => e.currentTarget.style.transform='scale(0.92)'}
        onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
        onTouchStart={e => e.currentTarget.style.transform='scale(0.92)'}
        onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}
      >{children}</button>
      {label && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:10, whiteSpace:'nowrap' }}>{label}</span>}
    </div>
  );
}
