import React, { useEffect, useRef, useState, useCallback } from 'react';

// ICEサーバー設定
let ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 5,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};
fetch('/api/ice-servers').then(r => r.json()).then(d => {
  if (d.iceServers) ICE_SERVERS = { ...ICE_SERVERS, iceServers: d.iceServers };
}).catch(() => {});

export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd, minimized, onToggleMinimize }) {
  // ---- refs（minimized切り替えでもDOMが変わらないように全部ref管理）----
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null); // ← 相手映像を保持し続ける
  const iceBuf          = useRef([]);
  const remoteDescSet   = useRef(false);
  const endedRef        = useRef(false);
  const restartTimer    = useRef(null);

  const [status,   setStatus]   = useState(isCaller ? 'ringing' : 'connecting');
  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error,    setError]    = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [iceState, setIceState] = useState('');
  const [callDuration, setCallDuration] = useState(0); // 通話時間（秒）
  const callStartTime  = useRef(null);  // 通話開始時刻
  const durationTimer  = useRef(null);  // 表示用タイマー
  const screenTrackRef = useRef(null);

  // ---- 通話終了 ----
  const safeEnd = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimeout(restartTimer.current);
    clearInterval(durationTimer.current);
    setStatus('ended');
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch (_) {}
    setTimeout(onEnd, 1000);
  }, [onEnd]);

  // ---- ICEバッファをフラッシュ ----
  const flushBuf = async (pc) => {
    const arr = [...iceBuf.current];
    iceBuf.current = [];
    for (const c of arr) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
  };

  // ---- メディア取得（高画質 + 高音質）----
  const getMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      });
      return stream;
    } catch {
      try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
        setError('マイク・カメラへのアクセスが拒否されました');
        return null;
      }
    }
  };

  // ---- PeerConnection初期化 ----
  const initPC = useCallback((stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // 相手の映像受信 ← ここが一番重要
    pc.ontrack = (e) => {
      const ms = e.streams?.[0] || (() => {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        remoteStreamRef.current.addTrack(e.track);
        return remoteStreamRef.current;
      })();
      remoteStreamRef.current = ms;
      // minimized中でもremoteVideoRefにセットし続ける
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = ms;
        remoteVideoRef.current.play().catch(() => {});
      }
      setStatus('active');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      setIceState(s);
      if (['connected', 'completed'].includes(s)) {
        setStatus('active');
        if (!callStartTime.current) {
          callStartTime.current = Date.now();
          durationTimer.current = setInterval(() => {
            setCallDuration(Math.floor((Date.now() - callStartTime.current) / 1000));
          }, 1000);
        }
      }
      if (s === 'failed') {
        // ICE再起動（再接続試行）
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
      if (s === 'connected') setStatus('active');
      if (s === 'failed') safeEnd();
    };

    // 帯域: 最初は低めにして素早く繋ぎ、安定後に高画質にアップ
    const applyBitrate = async (videoMax) => {
      try {
        for (const sender of pc.getSenders()) {
          if (!sender.track) continue;
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          if (sender.track.kind === 'video') {
            params.encodings[0].maxBitrate   = videoMax;
            params.encodings[0].maxFramerate = 60;
          } else {
            params.encodings[0].maxBitrate = 128_000; // 音声128kbps（高音質）
            params.encodings[0].priority   = 'high';  // 音声を映像より優先
          }
          await sender.setParameters(params).catch(() => {});
        }
      } catch (_) {}
    };
    pc.onsignalingstatechange = async () => {
      if (pc.signalingState !== 'stable') return;
      await applyBitrate(500_000);           // まず500kbpsで素早く繋ぐ
      setTimeout(() => applyBitrate(4_000_000), 4000); // 4秒後に4Mbps高画質へ
    };

    return pc;
  }, [socket, targetUserId, safeEnd]);

  // ---- メインuseEffect ----
  useEffect(() => {
    if (!socket) return;
    let mounted = true;

    const startCall = async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = initPC(stream);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('call:start', { roomId, offer: pc.localDescription, to: targetUserId });
    };

    const answerCall = async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = initPC(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      remoteDescSet.current = true;
      await flushBuf(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { answer: pc.localDescription, to: targetUserId });
    };

    socket.on('call:answered', async ({ answer }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSet.current = true;
        await flushBuf(pcRef.current);
      } catch (_) {}
    });

    socket.on('call:ice', async ({ candidate }) => {
      if (!candidate) return;
      if (remoteDescSet.current && pcRef.current) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
      } else {
        iceBuf.current.push(candidate);
      }
    });

    socket.on('call:ended',   safeEnd);
    socket.on('call:rejected', () => { setStatus('rejected'); setTimeout(onEnd, 1200); });

    if (isCaller) startCall(); else answerCall();

    return () => {
      mounted = false;
      socket.off('call:answered');
      socket.off('call:ice');
      socket.off('call:ended');
      socket.off('call:rejected');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- minimized切り替え時にsrcObjectを再セット ----
  useEffect(() => {
    // minimizedが変わってもDOMが再マウントされたらstreamを再セットする
    if (localVideoRef.current  && localStreamRef.current)  localVideoRef.current.srcObject  = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [minimized]);

  // ---- カメラ切替 ----
  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false });
      const nt = ns.getVideoTracks()[0];
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const audio = localStreamRef.current?.getAudioTracks() || [];
      localStreamRef.current = new MediaStream([nt, ...audio]);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
    } catch (_) {}
  };

  const endCall = () => {
    const duration = callStartTime.current
      ? Math.floor((Date.now() - callStartTime.current) / 1000)
      : 0;
    socket?.emit('call:end', { roomId, to: targetUserId, duration });
    clearInterval(durationTimer.current);
    safeEnd();
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
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        const ct = cs.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(ct);
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
        const audio = localStreamRef.current?.getAudioTracks() || [];
        localStreamRef.current = new MediaStream([ct, ...audio]);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      } catch (_) {}
      setIsScreenSharing(false);
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const st = ss.getVideoTracks()[0];
        screenTrackRef.current = st;
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(st);
        const audio = localStreamRef.current?.getAudioTracks() || [];
        if (localVideoRef.current) localVideoRef.current.srcObject = new MediaStream([st, ...audio]);
        st.onended = () => setIsScreenSharing(false);
        setIsScreenSharing(true);
      } catch (e) {
        if (e.name !== 'NotAllowedError') setError('画面共有を開始できませんでした');
      }
    }
  };

  const statusText = { connecting:'接続中…', ringing:'呼び出し中…', ended:'通話終了', rejected:'拒否されました' };
  const iceLabel   = { checking:'🔄 経路確認中', failed:'⚠️ 再接続中…', disconnected:'⚠️ 接続が不安定です' };

  // ---- 最小化表示 ----
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

  // ---- フル表示 ----
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

        {status === 'active' && (
          <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)',
            background:'rgba(0,0,0,0.65)', color:'white', fontSize:13, padding:'4px 14px',
            borderRadius:16, whiteSpace:'nowrap', fontWeight:600 }}>
            {iceLabel[iceState] || `📞 ${fmtDuration(callDuration)}`}
          </div>
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
          justifyContent:'center', alignItems:'center', background:'rgba(0,0,0,0.85)', flexWrap:'wrap' }}>
          <CallBtn onClick={toggleMute}   active={isMuted}   activeColor="#c0392b" label={isMuted ? 'ミュート中' : 'マイク'}>{isMuted ? '🔇' : '🎤'}</CallBtn>
          <CallBtn onClick={toggleCamera} active={isCamOff}  activeColor="#c0392b" label={isCamOff ? 'カメラオフ' : 'カメラ'}>{isCamOff ? '📷' : '📹'}</CallBtn>
          <CallBtn onClick={switchCamera} label="カメラ切替">🔄</CallBtn>
          <CallBtn onClick={toggleScreenShare} active={isScreenSharing} activeColor="#f39c12" label={isScreenSharing ? '共有中' : '画面共有'}>{isScreenSharing ? '🖥️' : '📺'}</CallBtn>
          <CallBtn onClick={onToggleMinimize} label="チャットへ">💬</CallBtn>
          <CallBtn onClick={endCall} activeColor="#e74c3c" active={true} size={64} label="終了">📵</CallBtn>
        </div>
      )}
    </div>
  );
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
        onMouseDown={e => e.currentTarget.style.transform='scale(0.92)'}
        onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
        onTouchStart={e => e.currentTarget.style.transform='scale(0.92)'}
        onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}
      >{children}</button>
      {label && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:10, whiteSpace:'nowrap' }}>{label}</span>}
    </div>
  );
}
