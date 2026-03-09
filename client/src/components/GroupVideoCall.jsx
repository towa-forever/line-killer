import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * グループビデオ通話（メッシュ型WebRTC）
 * props:
 *   socket, currentUser, roomId, members (全メンバーID配列), roomName
 *   onEnd, minimized, onToggleMinimize
 */
export default function GroupVideoCall({ socket, currentUser, roomId, members, roomName, onEnd, minimized, onToggleMinimize }) {
  // peerConnections: { [userId]: RTCPeerConnection }
  const pcsRef = useRef({});
  const iceBufRef = useRef({}); // { [userId]: candidate[] }
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  // remoteStreams: { [userId]: { stream, name } }
  const [remoteStreams, setRemoteStreams] = useState({});
  const [status, setStatus] = useState('joining'); // joining | active | ended
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');

  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
    iceCandidatePoolSize: 10,
  };

  const addRemoteStream = useCallback((userId, userName, stream) => {
    setRemoteStreams(prev => ({ ...prev, [userId]: { stream, name: userName } }));
  }, []);

  const removeRemoteStream = useCallback((userId) => {
    setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
  }, []);

  const createPC = useCallback((targetId, targetName, localStream, isInitiator) => {
    if (pcsRef.current[targetId]) return pcsRef.current[targetId];
    const pc = new RTCPeerConnection(ICE);
    pcsRef.current[targetId] = pc;
    iceBufRef.current[targetId] = [];

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const remoteStream = new MediaStream();
    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        addRemoteStream(targetId, targetName, e.streams[0]);
      } else {
        e.track.onunmute = () => {
          remoteStream.addTrack(e.track);
          addRemoteStream(targetId, targetName, remoteStream);
        };
        remoteStream.addTrack(e.track);
        addRemoteStream(targetId, targetName, remoteStream);
      }
      setStatus('active');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('gcall:ice', { candidate: e.candidate, to: targetId, roomId });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removeRemoteStream(targetId);
        pc.close();
        delete pcsRef.current[targetId];
      }
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          socket.emit('gcall:offer', { offer, to: targetId, roomId, fromName: currentUser.username });
        } catch (e) {}
      };
    }

    return pc;
  }, [socket, currentUser, roomId, addRemoteStream, removeRemoteStream]);

  useEffect(() => {
    if (!socket) return;
    let localStream;

    const init = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = localStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

        // 入室通知→既存メンバー全員とのPCを自分が発起
        socket.emit('gcall:join', { roomId, name: currentUser.username });

      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました');
      }
    };

    // 新しいメンバーが入ってきた → こちらからofferを送る
    socket.on('gcall:peer_joined', async ({ userId, name }) => {
      if (userId === currentUser.id || !localStreamRef.current) return;
      createPC(userId, name, localStreamRef.current, true);
    });

    // offerを受け取った → answerを返す
    socket.on('gcall:offer', async ({ offer, from, fromName }) => {
      if (!localStreamRef.current) return;
      const pc = createPC(from, fromName, localStreamRef.current, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      // バッファしたICEを処理
      for (const c of (iceBufRef.current[from] || [])) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
      }
      iceBufRef.current[from] = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('gcall:answer', { answer, to: from, roomId });
    });

    // answerを受け取った
    socket.on('gcall:answer', async ({ answer, from }) => {
      const pc = pcsRef.current[from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of (iceBufRef.current[from] || [])) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
        }
        iceBufRef.current[from] = [];
        setStatus('active');
      }
    });

    // ICE candidate
    socket.on('gcall:ice', async ({ candidate, from }) => {
      const pc = pcsRef.current[from];
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
      } else {
        if (!iceBufRef.current[from]) iceBufRef.current[from] = [];
        iceBufRef.current[from].push(candidate);
      }
    });

    // 誰かが退出
    socket.on('gcall:peer_left', ({ userId }) => {
      if (pcsRef.current[userId]) {
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }
      removeRemoteStream(userId);
    });

    // 通話終了（ホストが終了）
    socket.on('gcall:ended', () => { setStatus('ended'); setTimeout(onEnd, 1200); });

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      Object.values(pcsRef.current).forEach(pc => pc.close());
      pcsRef.current = {};
      socket.emit('gcall:leave', { roomId });
      socket.off('gcall:peer_joined');
      socket.off('gcall:offer');
      socket.off('gcall:answer');
      socket.off('gcall:ice');
      socket.off('gcall:peer_left');
      socket.off('gcall:ended');
    };
  }, [socket]);

  const endCall = () => {
    socket?.emit('gcall:end', { roomId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(pcsRef.current).forEach(pc => pc.close());
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

  const allVideos = Object.entries(remoteStreams); // [[userId, {stream, name}]]
  const totalCount = allVideos.length + 1; // +自分

  // グリッドのカラム数
  const cols = totalCount <= 1 ? 1 : totalCount <= 2 ? 2 : totalCount <= 4 ? 2 : 3;

  // ========== ミニ表示 ==========
  if (minimized) {
    const firstRemote = allVideos[0];
    return (
      <div style={{
        position: 'fixed', bottom: 80, right: 12, zIndex: 4000,
        width: 160, height: 200, borderRadius: 16,
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        background: '#111',
      }}>
        {firstRemote ? (
          <RemoteVideo stream={firstRemote[1].stream} name={firstRemote[1].name} style={{ width:'100%', height:'100%' }} />
        ) : (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#aaa', fontSize:13 }}>
            {status === 'joining' ? '参加中…' : '待機中'}
          </div>
        )}
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position:'absolute', bottom:6, right:6, width:44, height:60,
            objectFit:'cover', borderRadius:8, border:'1.5px solid white' }} />
        <button onClick={onToggleMinimize} style={miniBtn('rgba(0,0,0,0.6)', 6, 'left')}>⛶</button>
        <button onClick={endCall} style={miniBtn('#e74c3c', 6, 'right')}>✕</button>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.6)',
          color:'white', fontSize:11, padding:'3px 6px', textAlign:'center' }}>
          {roomName} · {allVideos.length + 1}人
        </div>
      </div>
    );
  }

  // ========== フル表示 ==========
  return (
    <div style={{ position:'fixed', inset:0, background:'#0a0a0a', display:'flex',
      flexDirection:'column', zIndex:5000 }}>
      {/* ヘッダー */}
      <div style={{ background:'rgba(0,0,0,0.8)', padding:'10px 16px',
        paddingTop:`calc(10px + env(safe-area-inset-top))`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        color:'white', flexShrink:0 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>📹 {roomName}</div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>{totalCount}人が参加中</div>
        </div>
        <div style={{ fontSize:12, color: status === 'active' ? '#06c755' : '#f39c12',
          fontWeight:600 }}>
          {status === 'joining' ? '⏳ 接続中' : status === 'active' ? '● 通話中' : '通話終了'}
        </div>
      </div>

      {/* ビデオグリッド */}
      <div style={{
        flex:1, display:'grid', padding:6, gap:4,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        background:'#0a0a0a', overflow:'hidden',
      }}>
        {/* 自分 */}
        <div style={videoTileStyle()}>
          <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
            style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          <div style={nameLabelStyle()}>あなた {isMuted ? '🔇' : ''}</div>
        </div>
        {/* リモート */}
        {allVideos.map(([uid, { stream, name }]) => (
          <div key={uid} style={videoTileStyle()}>
            <RemoteVideo stream={stream} name={name} style={{ width:'100%', height:'100%' }} />
            <div style={nameLabelStyle()}>{name}</div>
          </div>
        ))}
        {/* 待機中の空タイル */}
        {status === 'joining' && allVideos.length === 0 && (
          <div style={{ ...videoTileStyle(), display:'flex', alignItems:'center', justifyContent:'center',
            color:'#666', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:32 }}>⏳</div>
            <div style={{ fontSize:13 }}>他のメンバーを待っています…</div>
          </div>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div style={{ color:'#ff6b6b', background:'rgba(0,0,0,0.8)', padding:'8px 16px',
          fontSize:13, textAlign:'center', flexShrink:0 }}>{error}</div>
      )}

      {/* コントロールバー */}
      <div style={{ display:'flex', gap:16, padding:'14px 24px',
        paddingBottom:`calc(14px + env(safe-area-inset-bottom))`,
        justifyContent:'center', alignItems:'center',
        background:'rgba(0,0,0,0.9)', flexShrink:0 }}>
        <Btn onClick={toggleMute} bg={isMuted ? '#c0392b' : 'rgba(255,255,255,0.15)'}>
          {isMuted ? '🔇' : '🎤'}
        </Btn>
        <Btn onClick={toggleCamera} bg={isCamOff ? '#c0392b' : 'rgba(255,255,255,0.15)'}>
          {isCamOff ? '📷' : '📹'}
        </Btn>
        <Btn onClick={onToggleMinimize} bg='rgba(255,255,255,0.15)' size={48}>💬</Btn>
        <Btn onClick={endCall} bg='#e74c3c' size={64}>📵</Btn>
      </div>
    </div>
  );
}

// RemoteVideoコンポーネント（streamをrefで設定）
function RemoteVideo({ stream, name, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video ref={ref} autoPlay playsInline webkit-playsinline="true"
      style={{ objectFit:'cover', ...style }}
      onLoadedMetadata={e => e.target.play().catch(()=>{})} />
  );
}

function Btn({ onClick, bg, size = 56, children }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius:'50%', background: bg,
      fontSize: size >= 60 ? 26 : 22, border:'none', cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    }}>{children}</button>
  );
}

const videoTileStyle = () => ({
  position:'relative', background:'#1a1a1a',
  borderRadius:12, overflow:'hidden',
  minHeight: 120,
});

const nameLabelStyle = () => ({
  position:'absolute', bottom:6, left:8,
  color:'white', fontSize:12, fontWeight:600,
  background:'rgba(0,0,0,0.55)', padding:'2px 8px',
  borderRadius:10,
});

const miniBtn = (bg, top, side) => ({
  position:'absolute', top, [side]: 6,
  background: bg, border:'none', borderRadius:7,
  color:'white', fontSize:13, padding:'3px 7px', cursor:'pointer',
});
