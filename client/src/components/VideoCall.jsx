import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

export default function VideoCall({ currentUser, socket }) {
  const { roomId, targetUserId } = useParams();
  const [searchParams] = useSearchParams();
  const isCaller = searchParams.get('caller') !== 'false'; // デフォルトは発信側
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;
    let localStream = null;

    const initPC = (stream) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        setStatus('active');
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('ended');
          setTimeout(() => navigate(-1), 2000);
        }
      };
      return pc;
    };

    const startCall = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        const pc = initPC(localStream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:start', { roomId, offer, to: targetUserId });
        setStatus('ringing');
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました: ' + err.message);
      }
    };

    // 着信側（App.jsで承認済みでこのページに来た場合）
    const answerCall = async (offer, from) => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        const pc = initPC(localStream);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { answer, to: from });
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました: ' + err.message);
      }
    };

    socket.on('call:answered', async ({ answer }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setStatus('active');
      }
    });

    socket.on('call:ice', async ({ candidate }) => {
      try {
        if (pcRef.current && pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {}
    });

    socket.on('call:ended', () => {
      setStatus('ended');
      setTimeout(() => navigate(-1), 1500);
    });

    socket.on('call:rejected', () => {
      setStatus('rejected');
      setTimeout(() => navigate(-1), 1500);
    });

    if (isCaller) {
      startCall();
    } else {
      // 着信側: offerはlocationのstateから取得（App.jsから渡せないのでsocket経由で再取得できないため、
      // App.jsがVideoCallページに遷移する前にofferをwindow._incomingCallに保存する方式）
      const pendingStr = sessionStorage.getItem('_incomingCall');
      if (pendingStr) {
        sessionStorage.removeItem('_incomingCall');
        const pending = JSON.parse(pendingStr);
        answerCall(pending.offer, pending.from);
      } else {
        setError('着信データが見つかりません。');
      }
    }

    return () => {
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (pcRef.current) pcRef.current.close();
      socket.off('call:answered');
      socket.off('call:ice');
      socket.off('call:ended');
      socket.off('call:rejected');
    };
  }, [socket]);

  const endCall = () => {
    socket?.emit('call:end', { roomId, to: targetUserId });
    if (pcRef.current) pcRef.current.close();
    setStatus('ended');
    setTimeout(() => navigate(-1), 1500);
  };

  const toggleMute = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
      setIsCamOff(!isCamOff);
    }
  };

  const statusText = {
    connecting: '📞 接続中...',
    ringing: '📳 呼び出し中...',
    active: '',
    ended: '通話が終了しました',
    rejected: '通話が拒否されました',
  };

  return (
    <div className="videocall">
      <div className="video-container">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
        <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
      </div>
      {statusText[status] && <div className="call-status">{statusText[status]}</div>}
      {error && <div className="call-error">{error}</div>}
      {status !== 'ended' && status !== 'rejected' && (
        <div className="call-controls">
          <button className={`call-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button className="call-btn end" onClick={endCall}>📵</button>
          <button className={`call-btn ${isCamOff ? 'off' : ''}`} onClick={toggleCamera}>
            {isCamOff ? '📷' : '📹'}
          </button>
        </div>
      )}
      <style>{`
        .videocall { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 3000; }
        .video-container { position: relative; width: 100%; flex: 1; background: #111; }
        .remote-video { width: 100%; height: 100%; object-fit: cover; }
        .local-video { position: absolute; bottom: 12px; right: 12px; width: 100px; height: 140px; object-fit: cover; border-radius: 10px; border: 2px solid white; }
        .call-status { color: white; font-size: 18px; font-weight: bold; padding: 16px; position: absolute; top: 20px; background: rgba(0,0,0,0.5); border-radius: 10px; }
        .call-error { color: #ff6b6b; font-size: 14px; padding: 10px 20px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; margin: 10px; }
        .call-controls { display: flex; gap: 20px; padding: 20px; background: rgba(0,0,0,0.5); }
        .call-btn { width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.2); font-size: 24px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
        .call-btn.off { background: rgba(255,100,100,0.4); }
        .call-btn.end { background: #e74c3c; }
      `}</style>
    </div>
  );
}
