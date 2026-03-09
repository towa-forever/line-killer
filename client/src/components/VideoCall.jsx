import React, { useEffect, useRef, useState } from 'react';

// minimized=true: チャット画面右下に小さく表示
export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd, minimized, onToggleMinimize }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidateBuffer = useRef([]);
  const remoteStreamRef = useRef(new MediaStream());
  const [status, setStatus] = useState(isCaller ? 'ringing' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenTrackRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const ICE_SERVERS = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceCandidatePoolSize: 10,
    };

    const initPC = (stream) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        const rs = remoteStreamRef.current;
        if (e.streams?.[0]) {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        } else {
          e.track.onunmute = () => {
            rs.addTrack(e.track);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = rs;
          };
          rs.addTrack(e.track);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = rs;
        }
        setStatus('active');
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('active');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('ended'); setTimeout(onEnd, 1500);
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') setStatus('active');
      };
      return pc;
    };

    const flushBuffer = async (pc) => {
      while (iceCandidateBuffer.current.length > 0) {
        try { await pc.addIceCandidate(new RTCIceCandidate(iceCandidateBuffer.current.shift())); } catch(e) {}
      }
    };

    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = initPC(stream);
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('call:start', { roomId, offer, to: targetUserId });
      } catch (err) { setError('カメラ・マイクへのアクセスが拒否されました'); }
    };

    const answerCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = initPC(stream);
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        await flushBuffer(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { answer, to: targetUserId });
      } catch (err) { setError('カメラ・マイクへのアクセスが拒否されました'); }
    };

    socket.on('call:answered', async ({ answer }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await flushBuffer(pcRef.current);
      }
    });

    socket.on('call:ice', async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current?.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
      } else {
        iceCandidateBuffer.current.push(candidate);
      }
    });

    socket.on('call:ended', () => { setStatus('ended'); setTimeout(onEnd, 1200); });
    socket.on('call:rejected', () => { setStatus('rejected'); setTimeout(onEnd, 1200); });

    if (isCaller) startCall(); else answerCall();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      socket.off('call:answered'); socket.off('call:ice');
      socket.off('call:ended'); socket.off('call:rejected');
    };
  }, [socket]);

  const endCall = () => {
    socket?.emit('call:end', { roomId, to: targetUserId });
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
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
      // 画面共有を停止してカメラに戻す
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const camTrack = camStream.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
        // ローカルストリームのビデオトラックも差し替え
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
        if (localVideoRef.current) {
          const newStream = new MediaStream([camTrack, ...localStreamRef.current.getAudioTracks()]);
          localVideoRef.current.srcObject = newStream;
          localStreamRef.current = newStream;
        }
      } catch(e) {}
      setIsScreenSharing(false);
    } else {
      // 画面共有開始
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
        if (localVideoRef.current) {
          const newStream = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()]);
          localVideoRef.current.srcObject = newStream;
        }
        screenTrack.onended = () => toggleScreenShare(); // 共有停止ボタンで自動解除
        setIsScreenSharing(true);
      } catch(e) {
        if (e.name !== 'NotAllowedError') setError('画面共有を開始できませんでした');
      }
    }
  };

  const statusText = { connecting: '接続中…', ringing: '呼び出し中…', ended: '通話終了', rejected: '拒否されました' };

  // ========== ミニ表示（PiP風） ==========
  if (minimized) {
    return (
      <div style={{
        position: 'fixed', bottom: 80, right: 12, zIndex: 4000,
        width: 160, height: 200, borderRadius: 16,
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        background: '#111', cursor: 'pointer',
      }}>
        <video ref={remoteVideoRef} autoPlay playsInline webkit-playsinline="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position: 'absolute', bottom: 6, right: 6, width: 44, height: 60,
            objectFit: 'cover', borderRadius: 8, border: '1.5px solid white' }} />
        {/* 展開ボタン */}
        <button onClick={onToggleMinimize} style={{
          position: 'absolute', top: 6, left: 6,
          background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 8,
          color: 'white', fontSize: 14, padding: '3px 7px', cursor: 'pointer',
        }}>⛶</button>
        {/* 切るボタン */}
        <button onClick={endCall} style={{
          position: 'absolute', top: 6, right: 6,
          background: '#e74c3c', border: 'none', borderRadius: 8,
          color: 'white', fontSize: 14, padding: '3px 7px', cursor: 'pointer',
        }}>✕</button>
        {status !== 'active' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: 11,
            textAlign: 'center', padding: 4 }}>{statusText[status]}</div>
        )}
      </div>
    );
  }

  // ========== フル表示 ==========
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex',
      flexDirection: 'column', zIndex: 5000 }}>
      {/* 映像エリア */}
      <div style={{ position: 'relative', flex: 1, background: '#111' }}>
        <video ref={remoteVideoRef} autoPlay playsInline webkit-playsinline="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onLoadedMetadata={e => e.target.play().catch(() => {})} />
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position: 'absolute', bottom: 14, right: 14, width: 90, height: 130,
            objectFit: 'cover', borderRadius: 12, border: '2px solid white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }} />
        {status !== 'active' && (
          <div style={{ position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', color: 'white', fontSize: 18,
            fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '12px 24px',
            borderRadius: 24, whiteSpace: 'nowrap' }}>
            {statusText[status] || ''}
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', top: 20, left: 16, right: 16,
            color: '#ff6b6b', background: 'rgba(0,0,0,0.7)', borderRadius: 10,
            padding: '8px 14px', fontSize: 13, textAlign: 'center' }}>{error}</div>
        )}
      </div>

      {/* コントロール */}
      {status !== 'ended' && status !== 'rejected' && (
        <div style={{ display: 'flex', gap: 20, padding: '16px 24px',
          paddingBottom: `calc(16px + env(safe-area-inset-bottom))`,
          justifyContent: 'center', alignItems: 'center',
          background: 'rgba(0,0,0,0.85)' }}>
          {/* ミュート */}
          <button onClick={toggleMute} style={btnStyle(isMuted ? '#c0392b' : 'rgba(255,255,255,0.2)')}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          {/* カメラ */}
          <button onClick={toggleCamera} style={btnStyle(isCamOff ? '#c0392b' : 'rgba(255,255,255,0.2)')}>
            {isCamOff ? '📷' : '📹'}
          </button>
          {/* 画面共有 */}
          <button onClick={toggleScreenShare} style={btnStyle(isScreenSharing ? '#f39c12' : 'rgba(255,255,255,0.2)', 48)}>
            {isScreenSharing ? '🖥️' : '📺'}
          </button>
          {/* チャットに戻る（ミニ化） */}
          <button onClick={onToggleMinimize} style={btnStyle('rgba(255,255,255,0.2)', 48)}>
            💬
          </button>
          {/* 通話終了 */}
          <button onClick={endCall} style={btnStyle('#e74c3c', 64)}>
            📵
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle = (bg, size = 56) => ({
  width: size, height: size, borderRadius: '50%',
  background: bg, fontSize: size >= 60 ? 26 : 22,
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, transition: 'transform 0.1s',
});
