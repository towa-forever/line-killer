import React, { useEffect, useRef, useState } from 'react';

export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidateBuffer = useRef([]); // remoteDescription設定前のICE候補をバッファ
  const [status, setStatus] = useState(isCaller ? 'ringing' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;

    const initPC = (stream) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // 無料TURNサーバー（NAT越えのため）
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
        ],
        iceCandidatePoolSize: 10,
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
          setTimeout(onEnd, 2000);
        }
      };
      return pc;
    };

    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = initPC(stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:start', { roomId, offer, to: targetUserId });
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました');
      }
    };

    const answerCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = initPC(stream);
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        // バッファに溜まったICE candidateを処理
        while (iceCandidateBuffer.current.length > 0) {
          const buffered = iceCandidateBuffer.current.shift();
          try { await pc.addIceCandidate(new RTCIceCandidate(buffered)); } catch(e) {}
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { answer, to: targetUserId });
        setStatus('active');
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました');
      }
    };

    socket.on('call:answered', async ({ answer }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        // バッファに溜まったICE candidateを処理
        while (iceCandidateBuffer.current.length > 0) {
          const buffered = iceCandidateBuffer.current.shift();
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(buffered)); } catch(e) {}
        }
        setStatus('active');
      }
    });

    socket.on('call:ice', async ({ candidate }) => {
      try {
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          // バッファに溜まったICE candidateを処理
          while (iceCandidateBuffer.current.length > 0) {
            const buffered = iceCandidateBuffer.current.shift();
            await pcRef.current.addIceCandidate(new RTCIceCandidate(buffered));
          }
        } else {
          // remoteDescriptionがまだなければバッファに積む
          iceCandidateBuffer.current.push(candidate);
        }
      } catch (e) {}
    });

    socket.on('call:ended', () => { setStatus('ended'); setTimeout(onEnd, 1500); });
    socket.on('call:rejected', () => { setStatus('rejected'); setTimeout(onEnd, 1500); });

    if (isCaller) startCall();
    else answerCall();

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      socket.off('call:answered');
      socket.off('call:ice');
      socket.off('call:ended');
      socket.off('call:rejected');
    };
  }, [socket]);

  const endCall = () => {
    socket?.emit('call:end', { roomId, to: targetUserId });
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    onEnd();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCamOff(!isCamOff);
  };

  const statusText = {
    connecting: '📞 接続中...',
    ringing: '📳 呼び出し中...',
    active: '',
    ended: '通話が終了しました',
    rejected: '通話が拒否されました',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:5000 }}>
      <div style={{ position:'relative', width:'100%', flex:1, background:'#111' }}>
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted style={{ position:'absolute', bottom:12, right:12, width:100, height:140, objectFit:'cover', borderRadius:10, border:'2px solid white' }} />
      </div>
      {statusText[status] && (
        <div style={{ color:'white', fontSize:18, fontWeight:'bold', padding:16, position:'absolute', top:20, background:'rgba(0,0,0,0.5)', borderRadius:10 }}>
          {statusText[status]}
        </div>
      )}
      {error && <div style={{ color:'#ff6b6b', fontSize:14, padding:'10px 20px', textAlign:'center', background:'rgba(0,0,0,0.5)', borderRadius:8, margin:10 }}>{error}</div>}
      {status !== 'ended' && status !== 'rejected' && (
        <div style={{ display:'flex', gap:20, padding:20, background:'rgba(0,0,0,0.5)' }}>
          <button onClick={toggleMute} style={{ width:60, height:60, borderRadius:'50%', background: isMuted ? 'rgba(255,100,100,0.4)' : 'rgba(255,255,255,0.2)', fontSize:24, border:'none', cursor:'pointer' }}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button onClick={endCall} style={{ width:60, height:60, borderRadius:'50%', background:'#e74c3c', fontSize:24, border:'none', cursor:'pointer' }}>📵</button>
          <button onClick={toggleCamera} style={{ width:60, height:60, borderRadius:'50%', background: isCamOff ? 'rgba(255,100,100,0.4)' : 'rgba(255,255,255,0.2)', fontSize:24, border:'none', cursor:'pointer' }}>
            {isCamOff ? '📷' : '📹'}
          </button>
        </div>
      )}
    </div>
  );
}
