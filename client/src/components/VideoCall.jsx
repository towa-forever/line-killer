import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function VideoCall({ currentUser, socket }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');

  const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

  useEffect(() => {
    if (!isHttps) { setError('ビデオ通話はHTTPS環境が必要です。'); return; }
    if (!socket) return;
    let localStream = null;

    const startCall = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pcRef.current = pc;
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        pc.ontrack = (e) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
          setStatus('active');
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('webrtc:ice', { roomId, candidate: e.candidate });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', { roomId, offer });

        socket.on('webrtc:answer', async ({ answer }) => {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });
        socket.on('webrtc:offer', async ({ offer: remoteOffer }) => {
          await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', { roomId, answer });
        });
        socket.on('webrtc:ice', async ({ candidate }) => {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        });
        socket.on('call:ended', () => endCall());
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました: ' + err.message);
      }
    };

    startCall();
    return () => {
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (pcRef.current) pcRef.current.close();
      socket.off('webrtc:answer'); socket.off('webrtc:offer');
      socket.off('webrtc:ice'); socket.off('call:ended');
    };
  // eslint-disable-next-line
  }, []);

  const endCall = () => {
    socket?.emit('call:end', { roomId });
    if (pcRef.current) pcRef.current.close();
    setStatus('ended');
    setTimeout(() => navigate(-1), 1500);
  };

  const toggleMute = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) { stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; }); setIsMuted(!isMuted); }
  };

  const toggleCamera = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) { stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; }); setIsCamOff(!isCamOff); }
  };

  if (!isHttps) {
    return (
      <div className="page">
        <div className="card" style={{ margin: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h3 style={{ marginBottom: 8 }}>HTTPS が必要です</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
            ビデオ通話機能はHTTPS環境でのみ使用できます。
          </p>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="videocall">
      <div className="video-container">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
        <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
      </div>
      {status === 'connecting' && <div className="call-status">📞 接続中...</div>}
      {status === 'ended' && <div className="call-status">通話が終了しました</div>}
      {error && <div className="call-error">{error}</div>}
      <div className="call-controls">
        <button className={`call-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute}>{isMuted ? '🔇' : '🎤'}</button>
        <button className="call-btn end" onClick={endCall}>📵</button>
        <button className={`call-btn ${isCamOff ? 'off' : ''}`} onClick={toggleCamera}>{isCamOff ? '📷' : '📹'}</button>
      </div>
      <style>{`
        .videocall { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 3000; }
        .video-container { position: relative; width: 100%; flex: 1; }
        .remote-video { width: 100%; height: 100%; object-fit: cover; }
        .local-video { position: absolute; bottom: 12px; right: 12px; width: 100px; height: 140px; object-fit: cover; border-radius: 10px; border: 2px solid white; }
        .call-status { color: white; font-size: 16px; padding: 10px; position: absolute; top: 20px; }
        .call-error { color: #ff6b6b; font-size: 14px; padding: 10px 20px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; }
        .call-controls { display: flex; gap: 20px; padding: 20px; background: rgba(0,0,0,0.5); }
        .call-btn { width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.2); font-size: 24px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
        .call-btn:hover { background: rgba(255,255,255,0.3); }
        .call-btn.off { background: rgba(255,100,100,0.4); }
        .call-btn.end { background: #e74c3c; }
      `}</style>
    </div>
  );
}
