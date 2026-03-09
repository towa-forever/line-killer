import React, { useEffect, useRef, useState } from 'react';

export default function VideoCall({ currentUser, socket, roomId, targetUserId, isCaller, incomingOffer, onEnd }) {
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

      // トラック追加
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 相手のトラックを受け取る（streamsが空の場合も対応）
      pc.ontrack = (e) => {
        const remoteStream = remoteStreamRef.current;
        if (e.streams && e.streams[0]) {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        } else {
          e.track.onunmute = () => {
            remoteStream.addTrack(e.track);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
          };
          remoteStream.addTrack(e.track);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        }
        setStatus('active');
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('call:ice', { candidate: e.candidate, to: targetUserId });
      };

      pc.onconnectionstatechange = () => {
        console.log('connectionState:', pc.connectionState);
        if (pc.connectionState === 'connected') setStatus('active');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('ended');
          setTimeout(onEnd, 2000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('iceConnectionState:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStatus('active');
        }
      };

      return pc;
    };

    const flushBuffer = async (pc) => {
      while (iceCandidateBuffer.current.length > 0) {
        const c = iceCandidateBuffer.current.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
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
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました: ' + err.message);
      }
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
        // setStatus('active') はontrack/onconnectionstatechangeに任せる
      } catch (err) {
        setError('カメラ・マイクへのアクセスが拒否されました: ' + err.message);
      }
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
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex', flexDirection:'column', zIndex:5000 }}>
      <div style={{ position:'relative', flex:1, background:'#111' }}>
        <video ref={remoteVideoRef} autoPlay playsInline webkit-playsinline="true"
          style={{ width:'100%', height:'100%', objectFit:'cover' }}
          onLoadedMetadata={(e) => e.target.play().catch(()=>{})} />
        <video ref={localVideoRef} autoPlay playsInline muted webkit-playsinline="true"
          style={{ position:'absolute', bottom:12, right:12, width:100, height:140, objectFit:'cover', borderRadius:10, border:'2px solid white' }} />
        {statusText[status] && (
          <div style={{ position:'absolute', top:20, left:'50%', transform:'translateX(-50%)', color:'white', fontSize:16, fontWeight:'bold', padding:'8px 16px', background:'rgba(0,0,0,0.6)', borderRadius:20, whiteSpace:'nowrap' }}>
            {statusText[status]}
          </div>
        )}
      </div>
      {error && <div style={{ color:'#ff6b6b', fontSize:13, padding:'8px 16px', textAlign:'center', background:'rgba(0,0,0,0.8)' }}>{error}</div>}
      {status !== 'ended' && status !== 'rejected' && (
        <div style={{ display:'flex', gap:20, padding:20, justifyContent:'center', background:'rgba(0,0,0,0.8)' }}>
          <button onClick={toggleMute} style={{ width:60, height:60, borderRadius:'50%', background: isMuted ? '#c0392b' : 'rgba(255,255,255,0.2)', fontSize:24, border:'none', cursor:'pointer' }}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button onClick={endCall} style={{ width:60, height:60, borderRadius:'50%', background:'#e74c3c', fontSize:24, border:'none', cursor:'pointer' }}>📵</button>
          <button onClick={toggleCamera} style={{ width:60, height:60, borderRadius:'50%', background: isCamOff ? '#c0392b' : 'rgba(255,255,255,0.2)', fontSize:24, border:'none', cursor:'pointer' }}>
            {isCamOff ? '📷' : '📹'}
          </button>
        </div>
      )}
    </div>
  );
}
