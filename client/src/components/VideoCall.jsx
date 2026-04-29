import React, { useEffect, useRef, useState, useCallback } from 'react';

// ICEサーバー（STUN複数 + TURN複数で確実に繋ぐ）
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const TURN_SERVERS = [
  { urls: 'turn:openrelay.metered.ca:80',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
];

function makePC() {
  return new RTCPeerConnection({
    iceServers: [...STUN_SERVERS, ...TURN_SERVERS],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
  });
}

function preferVP8(sdp) {
  const lines = sdp.split('\n');
  const mIdx = lines.findIndex(l => l.startsWith('m=video'));
  if (mIdx < 0) return sdp;
  const pts = [];
  lines.forEach(l => { const m = l.match(/^a=rtpmap:(\d+) VP8/i); if (m) pts.push(m[1]); });
  if (!pts.length) return sdp;
  const parts = lines[mIdx].split(' ');
  const rest = parts.slice(3).filter(p => !pts.includes(p));
  lines[mIdx] = [...parts.slice(0, 3), ...pts, ...rest].join(' ');
  return lines.join('\n');
}

function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
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
        onTouchStart={e => e.currentTarget.style.transform='scale(0.9)'}
        onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}
      >{children}</button>
      {label && <span style={{ color:'rgba(255,255,255,0.75)', fontSize:10, whiteSpace:'nowrap' }}>{label}</span>}
    </div>
  );
}

export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd, minimized, onToggleMinimize }) {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceBufRef      = useRef([]);
  const remoteSetRef   = useRef(false);
  const endedRef       = useRef(false);
  const startTimeRef   = useRef(null);
  const durationTimer  = useRef(null);
  const restartTimer   = useRef(null);

  const [status,    setStatus]    = useState(isCaller ? 'ringing' : 'connecting');
  const [isMuted,   setIsMuted]   = useState(false);
  const [isCamOff,  setIsCamOff]  = useState(false);
  const [isScreen,  setIsScreen]  = useState(false);
  const [facing,    setFacing]    = useState('user');
  const [iceState,  setIceState]  = useState('');
  const [duration,  setDuration]  = useState(0);
  const [error,     setError]     = useState('');
  const screenTrack = useRef(null);

  // 通話終了
  const safeEnd = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimeout(restartTimer.current);
    clearInterval(durationTimer.current);
    setStatus('ended');
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch (_) {}
    setTimeout(onEnd, 800);
  }, [onEnd]);

  // ICEバッファをフラッシュ
  const flushIce = useCallback(async (pc) => {
    for (const c of iceBufRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
    iceBufRef.current = [];
  }, []);

  // メディア取得
  const getMedia = useCallback(async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      try { return await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); } catch {
        try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch {
          setError('カメラ・マイクへのアクセスが拒否されました');
          return null;
        }
      }
    }
  }, []);

  // PeerConnection作成
  const createPC = useCallback((stream) => {
    const pc = makePC();
    pcRef.current = pc;

    // ローカルトラック追加
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // リモートストリーム受信
    pc.ontrack = (e) => {
      const ms = e.streams?.[0];
      if (ms) {
        remoteStreamRef.current = ms;
      } else {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        remoteStreamRef.current.addTrack(e.track);
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
        remoteVideoRef.current.play().catch(() => {});
      }
      setStatus('active');
    };

    // ICE候補送信
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
      }
    };

    // ICE接続状態
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      setIceState(s);
      console.log('[ICE]', s);
      if (['connected', 'completed'].includes(s)) {
        setStatus('active');
        if (!startTimeRef.current) {
          startTimeRef.current = Date.now();
          durationTimer.current = setInterval(() => {
            setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }, 1000);
        }
      }
      if (s === 'failed') {
        console.log('[ICE] failed → restartIce');
        try { pc.restartIce(); } catch (_) {}
      }
      if (s === 'disconnected') {
        restartTimer.current = setTimeout(() => {
          if (pcRef.current?.iceConnectionState === 'disconnected') {
            try { pcRef.current.restartIce(); } catch (_) {}
          }
        }, 3000);
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log('[PC]', s);
      if (s === 'connected') setStatus('active');
      if (s === 'failed') {
        console.log('[PC] failed → safeEnd');
        safeEnd();
      }
    };

    return pc;
  }, [socket, targetUserId, safeEnd]);

  useEffect(() => {
    if (!socket) return;
    let mounted = true;

    // ---- 発信 ----
    const startCall = async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; }

      const pc = createPC(stream);

      const rawOffer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      const sdp = preferVP8(rawOffer.sdp);
      await pc.setLocalDescription({ type: rawOffer.type, sdp });
      console.log('[発信] offer送信 to:', targetUserId);
      socket.emit('call:start', { roomId, offer: pc.localDescription, to: targetUserId });
    };

    // ---- 着信応答 ----
    const answerCall = async () => {
      if (!incomingOffer) { console.error('[着信] incomingOfferがない'); safeEnd(); return; }
      const stream = await getMedia();
      if (!stream || !mounted) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; }

      const pc = createPC(stream);

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      remoteSetRef.current = true;
      await flushIce(pc);

      const rawAnswer = await pc.createAnswer();
      const sdp = preferVP8(rawAnswer.sdp);
      await pc.setLocalDescription({ type: rawAnswer.type, sdp });
      console.log('[着信] answer送信 to:', targetUserId);
      socket.emit('call:answer', { answer: pc.localDescription, to: targetUserId });
    }, []);

    // ---- answer受信（発信側） ----
    const onAnswered = async ({ answer }) => {
      console.log('[発信] answered受信, signalingState:', pcRef.current?.signalingState);
      if (!pcRef.current) return;
      if (pcRef.current.signalingState !== 'have-local-offer') return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        remoteSetRef.current = true;
        await flushIce(pcRef.current);
      } catch (e) { console.error('[answered]', e); }
    };

    // ---- ICE候補受信 ----
    const onIce = async ({ candidate }) => {
      if (!candidate || !pcRef.current) return;
      if (remoteSetRef.current) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn('[ICE add]', e); }
      } else {
        iceBufRef.current.push(candidate);
      }
    };

    const onEnded   = () => safeEnd();
    const onReject  = () => { setStatus('rejected'); setTimeout(onEnd, 1500); };

    socket.on('call:answered', onAnswered);
    socket.on('call:ice',      onIce);
    socket.on('call:ended',    onEnded);
    socket.on('call:rejected', onReject);

    if (isCaller) startCall(); else answerCall();

    return () => {
      mounted = false;
      socket.off('call:answered', onAnswered);
      socket.off('call:ice',      onIce);
      socket.off('call:ended',    onEnded);
      socket.off('call:rejected', onReject);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // minimized切り替え時にvideo要素を再セット
  useEffect(() => {
    if (localVideoRef.current  && localStreamRef.current)
      localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [minimized]);

  // カメラ切替
  const switchCamera = useCallback(async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false });
      const nt = ns.getVideoTracks()[0];
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const audio = localStreamRef.current?.getAudioTracks() || [];
      localStreamRef.current = new MediaStream([nt, ...audio]);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
    } catch (e) { console.error('[switchCamera]', e); }
  }, [facing]);

  const endCall = useCallback(() => {
    const dur = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
    socket?.emit('call:end', { roomId, to: targetUserId, duration: dur });
    clearInterval(durationTimer.current);
    safeEnd();
  }, []);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(c => !c);
  }, []);

  const toggleScreen = useCallback(async () => {
    if (isScreen) {
      screenTrack.current?.stop(); screenTrack.current = null;
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const ct = cs.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(ct);
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
        const audio = localStreamRef.current?.getAudioTracks() || [];
        localStreamRef.current = new MediaStream([ct, ...audio]);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      } catch (_) {}
      setIsScreen(false);
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const st = ss.getVideoTracks()[0];
        screenTrack.current = st;
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(st);
        const audio = localStreamRef.current?.getAudioTracks() || [];
        if (localVideoRef.current) localVideoRef.current.srcObject = new MediaStream([st, ...audio]);
        st.onended = () => setIsScreen(false);
        setIsScreen(true);
      } catch (e) { if (e.name !== 'NotAllowedError') setError('画面共有を開始できませんでした'); }
    }
  }, [isScreen, facing]);

  const iceLabel = { checking:'🔄 経路確認中', failed:'⚠️ 再接続中…', disconnected:'⚠️ 不安定' };
  const statusText = { connecting:'接続中…', ringing:'呼び出し中…', ended:'通話終了', rejected:'拒否されました' };

  // ---- 最小化 ----
  if (minimized) {
    return (
      <div style={{ position:'fixed', bottom:80, right:12, zIndex:4000, width:160, height:200,
        borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', background:'#111', cursor:'pointer' }}>
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position:'absolute', bottom:6, right:6, width:44, height:60,
            objectFit:'cover', borderRadius:8, border:'1.5px solid white' }} />
        <button onClick={onToggleMinimize}
          style={{ position:'absolute', top:6, left:6, background:'rgba(0,0,0,0.5)', border:'none', borderRadius:8, color:'white', fontSize:14, padding:'3px 7px', cursor:'pointer' }}>⛶</button>
        <button onClick={endCall}
          style={{ position:'absolute', top:6, right:6, background:'#e74c3c', border:'none', borderRadius:8, color:'white', fontSize:14, padding:'3px 7px', cursor:'pointer' }}>✕</button>
        {status !== 'active' && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.7)',
            color:'white', fontSize:11, textAlign:'center', padding:4 }}>{statusText[status]}</div>
        )}
      </div>
    );
  }

  // ---- フル表示 ----
  return (
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', flexDirection:'column', zIndex:5000 }}>
      <div style={{ position:'relative', flex:1, background:'#111' }}>
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position:'absolute', bottom:14, right:14, width:90, height:130,
            objectFit:'cover', borderRadius:12, border:'2px solid white', boxShadow:'0 2px 12px rgba(0,0,0,0.5)' }} />

        {status !== 'active' && (
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            color:'white', textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:12 }}>📞</div>
            <div style={{ fontSize:20, fontWeight:700, background:'rgba(0,0,0,0.6)', padding:'10px 24px', borderRadius:24 }}>
              {statusText[status] || ''}
            </div>
            {status === 'ringing' && <div style={{ fontSize:13, marginTop:8, opacity:0.7 }}>相手が応答するのを待っています</div>}
          </div>
        )}

        {status === 'active' && (
          <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)',
            background:'rgba(0,0,0,0.65)', color:'white', fontSize:13,
            padding:'4px 16px', borderRadius:16, fontWeight:600 }}>
            {iceLabel[iceState] || `📞 ${fmtDuration(duration)}`}
          </div>
        )}

        {error && (
          <div style={{ position:'absolute', top:20, left:16, right:16, color:'#ff6b6b',
            background:'rgba(0,0,0,0.8)', borderRadius:10, padding:'10px 14px', fontSize:13, textAlign:'center' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {status !== 'ended' && status !== 'rejected' && (
        <div style={{ display:'flex', gap:16, padding:'16px 20px',
          paddingBottom:'calc(20px + env(safe-area-inset-bottom))',
          justifyContent:'center', alignItems:'center',
          background:'rgba(0,0,0,0.85)', flexWrap:'wrap' }}>
          <CallBtn onClick={toggleMute}    active={isMuted}   activeColor="#c0392b" label={isMuted ? 'ミュート中' : 'マイク'}>{isMuted ? '🔇' : '🎤'}</CallBtn>
          <CallBtn onClick={toggleCamera}  active={isCamOff}  activeColor="#c0392b" label={isCamOff ? 'カメラオフ' : 'カメラ'}>{isCamOff ? '📷' : '📹'}</CallBtn>
          <CallBtn onClick={switchCamera}  label="カメラ切替">🔄</CallBtn>
          <CallBtn onClick={toggleScreen}  active={isScreen}  activeColor="#f39c12" label={isScreen ? '共有中' : '画面共有'}>{isScreen ? '🖥️' : '📺'}</CallBtn>
          <CallBtn onClick={onToggleMinimize} label="チャットへ">💬</CallBtn>
          <CallBtn onClick={endCall} active={true} activeColor="#e74c3c" size={64} label="終了">📵</CallBtn>
        </div>
      )}
    </div>
  );
}
