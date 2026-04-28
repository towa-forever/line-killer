import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function GroupVideoCall({ socket, currentUser, roomId, members, roomName, onEnd, minimized, onToggleMinimize }) {
  const pcsRef = useRef({});
  const iceBufRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const iceConfigRef = useRef({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80',            username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turns:openrelay.metered.ca:443',          username: 'openrelayproject', credential: 'openrelayproject' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
  });
  const [remoteStreams, setRemoteStreams] = useState({});
  const [status, setStatus] = useState('joining');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user'=内カメ / 'environment'=外カメ
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const screenTrackRef = useRef(null);
  const isCreator = currentUser?.id === members[0]; // 最初のメンバーがホスト

  // 動的ICEサーバー取得（マウント時のみ）
  useEffect(() => {
    fetch('/api/ice-servers').then(r => r.json()).then(data => {
      if (data.iceServers) {
        iceConfigRef.current = { ...iceConfigRef.current, iceServers: data.iceServers };
      }
    }).catch(() => {});
  }, []);

  const addRemoteStream = useCallback((userId, userName, stream) => {
    setRemoteStreams(prev => ({ ...prev, [userId]: { stream, name: userName } }));
  }, []);

  const removeRemoteStream = useCallback((userId) => {
    setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
  }, []);

  const createPC = useCallback((targetId, targetName, localStream, isInitiator) => {
    if (pcsRef.current[targetId]) return pcsRef.current[targetId];
    const pc = new RTCPeerConnection(iceConfigRef.current);
    pcsRef.current[targetId] = pc;
    iceBufRef.current[targetId] = [];

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      addRemoteStream(targetId, targetName, remoteStream);
    };

    pc.onicecandidate = e => {
      if (e.candidate) socket?.emit('gcall:ice', { candidate: e.candidate, to: targetId, roomId });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (_) {}
      }
      if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') removeRemoteStream(targetId);
        }, 5000);
      }
    };

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => socket?.emit('gcall:offer', { offer: pc.localDescription, to: targetId, roomId, fromName: currentUser?.username }))
        .catch(e => console.error('gcall offer error:', e));
    }
    return pc;
  }, [socket, roomId, currentUser?.username, addRemoteStream, removeRemoteStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // カメラ取得（切り替え対応）
  const getLocalStream = useCallback(async (facing = 'user') => {
    // 既存ストリームを止める
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    // 既存PeerConnectionのビデオトラックを差し替え
    Object.values(pcsRef.current).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(stream.getVideoTracks()[0]).catch(() => {});
    });
    return stream;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await getLocalStream(facingMode);
        if (!mounted || !stream) return;
        setStatus('active');
        socket?.emit('gcall:join', { roomId, name: currentUser?.username });
      } catch(e) {
        setError('カメラ/マイクの取得に失敗したで: ' + e.message);
      }
    })();

    socket?.on('gcall:peer_joined', ({ userId, name }) => {
      if (!localStreamRef.current) return;
      createPC(userId, name, localStreamRef.current, true);
    });

    socket?.on('gcall:offer', async ({ offer, from, fromName }) => {
      if (!localStreamRef.current) return;
      const pc = createPC(from, fromName, localStreamRef.current, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('gcall:answer', { answer: pc.localDescription, to: from, roomId });
      // バッファしたICEを適用
      (iceBufRef.current[from] || []).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
      iceBufRef.current[from] = [];
    });

    socket?.on('gcall:answer', async ({ answer, from }) => {
      const pc = pcsRef.current[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
    });

    socket?.on('gcall:ice', ({ candidate, from }) => {
      const pc = pcsRef.current[from];
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        if (!iceBufRef.current[from]) iceBufRef.current[from] = [];
        iceBufRef.current[from].push(candidate);
      }
    });

    socket?.on('gcall:peer_left', ({ userId }) => {
      pcsRef.current[userId]?.close();
      delete pcsRef.current[userId];
      removeRemoteStream(userId);
    });

    // 全員強制終話（主催者が gcall:end_all したとき）
    socket?.on('gcall:ended', () => {
      setStatus('ended');
      setTimeout(onEnd, 1000);
    });

    return () => {
      mounted = false;
      socket?.off('gcall:peer_joined'); socket?.off('gcall:offer');
      socket?.off('gcall:answer'); socket?.off('gcall:ice');
      socket?.off('gcall:peer_left'); socket?.off('gcall:ended');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自分だけ退出
  const leaveCall = useCallback(() => {
    socket?.emit('gcall:end', { roomId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(pcsRef.current).forEach(pc => pc.close());
    onEnd();
  }, []);

  // 全員終話（ホストのみ）
  const endCallAll = useCallback(() => {
    socket?.emit('gcall:end_all', { roomId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(pcsRef.current).forEach(pc => pc.close());
    onEnd();
  }, []);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(c => !c);
  }, []);

  // カメラ切り替え（内カメ⇔外カメ）
  const switchCamera = useCallback(async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    try {
      await getLocalStream(newFacing);
    } catch(e) {
      setError('カメラ切り替えに失敗したで');
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenTrackRef.current?.stop();
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      Object.values(pcsRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack).catch(() => {});
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screen.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        Object.values(pcsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        screenTrack.onended = () => { setIsScreenSharing(false); };
        setIsScreenSharing(true);
      } catch(e) {}
    }
  };

  const allStreams = [
    { userId: 'local', name: currentUser?.username + '（自分）', isLocal: true },
    ...Object.entries(remoteStreams).map(([id, { stream, name }]) => ({ userId: id, name, stream, isLocal: false })),
  ];
  const count = allStreams.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;

  const miniBtn = (bg) => ({
    width: 32, height: 32, borderRadius: '50%', background: bg,
    border: 'none', color: 'white', fontSize: 14, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  });

  const Btn = ({ onClick, bg, size = 48, children, active }) => (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%',
      background: active ? '#fff' : bg, border: 'none',
      color: active ? bg : 'white', fontSize: size * 0.4,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>{children}</button>
  );

  if (minimized) return (
    <div style={{ position: 'fixed', bottom: 80, right: 12, background: '#1a1a2a', borderRadius: 16, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 1000 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: '#333' }}>
        <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div>
        <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{roomName}</div>
        <div style={{ color: '#aaa', fontSize: 11 }}>{count}人通話中</div>
      </div>
      <button onClick={onToggleMinimize} style={miniBtn('#444')}>⤢</button>
      <button onClick={leaveCall} style={miniBtn('#e74c3c')}>✕</button>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d1a', display: 'flex', flexDirection: 'column', zIndex: 500 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.5)', gap: 10 }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 15, flex: 1 }}>{roomName}</span>
        <span style={{ color: '#aaa', fontSize: 12 }}>{count}人</span>
        <button onClick={onToggleMinimize} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}>⤡</button>
      </div>

      {error && <div style={{ background: '#e74c3c', color: 'white', padding: '8px 14px', fontSize: 13 }}>{error}</div>}

      {/* ビデオグリッド */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3, padding: 3, overflow: 'hidden' }}>
        {allStreams.map(({ userId, name, stream, isLocal }) => (
          <div key={userId} style={{ position: 'relative', background: '#1a1a2a', borderRadius: 10, overflow: 'hidden' }}>
            {isLocal
              ? <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
              : <RemoteVideo stream={stream} />
            }
            <div style={{ position: 'absolute', bottom: 6, left: 8, color: 'white', fontSize: 11, fontWeight: 700, background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 10 }}>
              {name}
            </div>
            {isLocal && isCamOff && (
              <div style={{ position: 'absolute', inset: 0, background: '#1a1a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>📵</div>
            )}
          </div>
        ))}
      </div>

      {/* コントロール */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: '16px 0 calc(16px + env(safe-area-inset-bottom))', background: 'rgba(0,0,0,0.5)' }}>
        <Btn onClick={toggleMute} bg={isMuted ? '#555' : '#333'} active={isMuted}>{isMuted ? '🔇' : '🎙️'}</Btn>
        <Btn onClick={toggleCamera} bg={isCamOff ? '#555' : '#333'} active={isCamOff}>{isCamOff ? '📵' : '📷'}</Btn>

        {/* カメラ切り替えボタン（内/外カメ） */}
        <Btn onClick={switchCamera} bg='#333'>{facingMode === 'user' ? '🔄' : '🤳'}</Btn>

        <Btn onClick={toggleScreenShare} bg={isScreenSharing ? '#f39c12' : '#333'} active={isScreenSharing}>🖥️</Btn>

        {/* 退出ボタン（長押しで全員終話メニュー） */}
        <div style={{ position: 'relative' }}>
          <Btn onClick={() => setShowLeaveMenu(m => !m)} bg='#e74c3c' size={64}>📵</Btn>
          {showLeaveMenu && (
            <div style={{ position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2a', borderRadius: 14, padding: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 160, zIndex: 10 }}>
              <button onClick={leaveCall} style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', borderRadius: 10, textAlign: 'left' }}>
                🚪 自分だけ退出
              </button>
              {isCreator && (
                <button onClick={endCallAll} style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: '#e74c3c', fontSize: 14, cursor: 'pointer', borderRadius: 10, textAlign: 'left' }}>
                  📵 全員終話
                </button>
              )}
              <button onClick={() => setShowLeaveMenu(false)} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', textAlign: 'center' }}>
                キャンセル
              </button>
            </div>
          )}
        </div>
      </div>

      {status === 'ended' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>
          通話が終了したで
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
