import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import ErrorBoundary from "./components/ErrorBoundary";
import VideoCall from "./components/VideoCall";
import './App.css';

// 遅延読み込み（初回ロード高速化）
const Friends = lazy(() => import('./components/Friends'));
const Timeline = lazy(() => import('./components/Timeline'));
const StampShop = lazy(() => import('./components/StampShop'));
const Album = lazy(() => import('./components/Album'));
const Profile = lazy(() => import('./components/Profile'));

const CreateRoom = lazy(() => import('./components/CreateRoom'));
const Note = lazy(() => import('./components/Note'));

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
axios.defaults.baseURL = SERVER_URL;
// アプリ起動時に即座にトークンをセット
const _token = localStorage.getItem('token');
if (_token) axios.defaults.headers.common['Authorization'] = `Bearer ${_token}`;

function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await axios.post(isLogin ? '/api/auth/login' : '/api/auth/register', { username, password });
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onLogin(res.data.user);
    } catch (err) { setError(err.response?.data?.error || '接続エラー'); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">💬</span>
          <h1>LINE Killer</h1>
          <p>LINEを超えるチャットアプリ</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="ユーザーID" value={username}
            onChange={(e) => setUsername(e.target.value)} required className="auth-input" />
          <input type="password" placeholder="パスワード" value={password}
            onChange={(e) => setPassword(e.target.value)} required className="auth-input" />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? '...' : isLogin ? 'ログイン' : '登録'}
          </button>
        </form>
        <button className="auth-toggle" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'アカウント作成' : 'ログインへ戻る'}
        </button>
      </div>
    </div>
  );
}

function RoomNameEditor({ room, onClose }) {
  const [name, setName] = React.useState(room.name || '');
  const [saving, setSaving] = React.useState(false);
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await axios.patch(`/api/rooms/${room.id}/name`, { name }); onClose(); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:6 }}>グループ名</div>
      <div style={{ display:'flex', gap:8 }}>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="グループ名" style={{ margin:0, flex:1 }} />
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ whiteSpace:'nowrap' }}>
          {saving ? '...' : '変更'}
        </button>
      </div>
    </div>
  );
}

function ChatScreen({ socket, currentUser, allStampSets, acquiredStampIds, friendsList, onCall }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesCache = useRef({});
  const [inputText, setInputText] = useState('');
  const [showStampPanel, setShowStampPanel] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // 返信先メッセージ
  const [showSearch, setShowSearch] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(null); // { msgId, x, y }
  const [pinnedMessage, setPinnedMessage] = useState(null); // ピン留めメッセージ
  const [unreadCounts, setUnreadCounts] = useState({}); // { roomId: count }
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null); // 転送するメッセージ
  const roomIconInputRef = useRef(null);
  const [msgMenu, setMsgMenu] = useState(null); // { msg, x, y } 長押しメニュー
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const myStampSets = allStampSets.filter(s => acquiredStampIds.includes(s.id));

  const fetchRooms = useCallback(async () => {
    try { const res = await axios.get('/api/rooms'); setRooms(res.data); }
    catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    if (!socket) return;
    socket.on('message:receive', (msg) => {
      if (msg.roomId === selectedRoom?.id) {
        setMessages((prev) => [...prev, msg]);
        // 受信したメッセージを即既読にする
        if (msg.senderId !== currentUser.id) {
          socket.emit('message:read', { messageId: msg.id, roomId: msg.roomId });
        }
      } else if (msg.senderId !== currentUser.id) {
        // 別のルームのメッセージは未読カウントを増やす
        setUnreadCounts((prev) => ({ ...prev, [msg.roomId]: (prev[msg.roomId] || 0) + 1 }));
      }
      setRooms((prev) =>
        prev.map((r) => r.id === msg.roomId ? { ...r, lastMessage: msg } : r)
      );
    });
    socket.on('message:read_update', ({ messageId, readBy }) => {
      setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, read_by: readBy } : m));
      // キャッシュも更新
      Object.keys(messagesCache.current).forEach(roomId => {
        messagesCache.current[roomId] = messagesCache.current[roomId]?.map(
          m => m.id === messageId ? { ...m, read_by: readBy } : m
        );
      });
    });
    socket.on('message:reacted', ({ messageId, reactions }) => {
      setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    });
    socket.on('room:pinned', ({ roomId, messageId }) => {
      if (roomId !== selectedRoom?.id) return;
      if (!messageId) { setPinnedMessage(null); return; }
      setMessages((prev) => {
        const msg = prev.find(m => m.id === messageId);
        if (msg) setPinnedMessage(msg);
        return prev;
      });
    });
    socket.on('room:new', (room) => setRooms((prev) => [room, ...prev]));
    socket.on('room:updated', ({ roomId, name, icon }) => {
      setRooms((prev) => prev.map(r => r.id === roomId ? { ...r, ...(name && { name }), ...(icon && { icon }) } : r));
      setSelectedRoom((prev) => prev?.id === roomId ? { ...prev, ...(name && { name }), ...(icon && { icon }) } : prev);
    });
    return () => { socket.off('message:receive'); socket.off('message:read_update'); socket.off('message:reacted'); socket.off('room:new'); socket.off('room:updated'); };
  }, [socket, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) return;
    // キャッシュがあれば即表示
    if (messagesCache.current[selectedRoom.id]) {
      setMessages(messagesCache.current[selectedRoom.id]);
    } else {
      setMessages([]);
    }
    (async () => {
      try {
        const res = await axios.get(`/api/rooms/${selectedRoom.id}/messages`);
        messagesCache.current[selectedRoom.id] = res.data;
        setMessages(res.data);
        // ピン留め状態を復元
        if (selectedRoom.pinned_message_id) {
          const pinned = res.data.find(m => m.id === selectedRoom.pinned_message_id);
          setPinnedMessage(pinned || null);
        } else {
          setPinnedMessage(null);
        }
        // ルームを開いたら未読をリセット
        setUnreadCounts((prev) => ({ ...prev, [selectedRoom.id]: 0 }));
        if (socket) {
          socket.emit('room:join', selectedRoom.id);
          // 未読メッセージを既読にする
          res.data.forEach(msg => {
            if (msg.senderId !== currentUser.id && !msg.read_by?.includes(currentUser.id)) {
              socket.emit('message:read', { messageId: msg.id, roomId: selectedRoom.id });
            }
          });
        }
      } catch (err) { console.error(err); }
    })();
  }, [selectedRoom, socket]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom || !socket) return;
    socket.emit('message:send', { roomId: selectedRoom.id, content: inputText, type: 'text', replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderName: replyTo.senderName } : null });
    setInputText('');
    setReplyTo(null);
  };

  const handleSendStamp = (stampSet, stamp) => {
    if (!selectedRoom || !socket) return;
    socket.emit('message:send', {
      roomId: selectedRoom.id,
      content: stamp.emoji,
      type: 'stamp',
      stampLabel: stamp.label
    });
    setShowStampPanel(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedRoom) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      socket?.emit('message:send', {
        roomId: selectedRoom.id,
        content: res.data.filename || 'ファイル',
        type: res.data.isImage ? 'image' : 'file',
        fileData: res.data
      });
    } catch (err) { console.error(err); }
    e.target.value = '';
  };

  const handleTyping = (e) => {
    setInputText(e.target.value);
    if (!socket || !selectedRoom) return;
    socket.emit('typing:start', { roomId: selectedRoom.id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('typing:stop', { roomId: selectedRoom.id }), 2000);
  };

  const renderMessage = (msg) => {
    const isMine = msg.senderId === currentUser.id;
    const time = new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const readByOthers = msg.read_by?.some(id => id !== currentUser.id);
    let content;
    if (msg.type === 'stamp') {
      content = <span style={{ fontSize: 36 }}>{msg.content}</span>;
    } else if (msg.type === 'image' && msg.fileData?.url) {
      content = <img src={`${SERVER_URL}${msg.fileData.url}`} alt="img" className="chat-image" />;
    } else if (msg.type === 'file' && msg.fileData?.url) {
      content = <a href={`${SERVER_URL}${msg.fileData.url}`} target="_blank" rel="noreferrer" className="chat-file-link">📎 {msg.content}</a>;
    } else {
      content = <span>{msg.content}</span>;
    }
    return (
      <div key={msg.id} id={`msg-${msg.id}`} className={`message ${isMine ? 'mine' : 'theirs'}`}
        onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ msg, x: e.clientX, y: e.clientY }); }}>
        {!isMine && <div className="message-avatar">{msg.senderAvatar ? <img src={`${SERVER_URL}${msg.senderAvatar}`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} /> : (msg.senderName?.[0] || '?')}</div>}
        <div className="message-body">
          {!isMine && <div className="message-sender">{msg.senderName}</div>}
          {msg.forwarded && (
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>📤 転送されたメッセージ</div>
          )}
          {msg.replyTo && (
            <div className="reply-preview">
              <span className="reply-name">{msg.replyTo.senderName}</span>
              <span className="reply-content">{msg.replyTo.content?.slice(0, 40)}{msg.replyTo.content?.length > 40 ? '...' : ''}</span>
            </div>
          )}
          <div className="message-bubble"
            onDoubleClick={(e) => setReactionPicker({ msgId: msg.id, x: e.clientX, y: e.clientY })}
            onContextMenu={(e) => { e.preventDefault(); setReactionPicker({ msgId: msg.id, x: e.clientX, y: e.clientY }); }}
          >{content}</div>
          {msg.reactions?.length > 0 && (
            <div className="reaction-row">
              {Object.entries(
                msg.reactions.reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || []); acc[r.emoji].push(r.user_id); return acc; }, {})
              ).map(([emoji, users]) => (
                <button key={emoji} className={`reaction-btn ${users.includes(currentUser.id) ? 'mine' : ''}`}
                  onClick={() => { socket.emit('message:react', { messageId: msg.id, roomId: selectedRoom.id, emoji }); }}>
                  {emoji} {users.length}
                </button>
              ))}
            </div>
          )}
          <div className="message-time">
            {isMine && readByOthers && <span style={{ fontSize: 11, color: '#06c755', marginRight: 4 }}>既読</span>}
            {time}
            <span className="reply-btn" onClick={() => setReplyTo(msg)}>↩</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-screen">
      <div className="room-list">
        <div className="room-list-header">
          <span>トーク</span>
          <button className="icon-btn" onClick={() => setShowCreateRoom(true)}>✏️</button>
        </div>
        <div className="room-items">
          {rooms.map((room) => {
            const lastMsg = room.lastMessage;
            return (
              <div key={room.id} className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}>
                <div style={{ position:'relative' }}>
                  <div className="room-avatar">{room.icon ? <img src={`${SERVER_URL}${room.icon}`} alt="" style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}} /> : (room.name?.[0] || '?')}</div>
                  {unreadCounts[room.id] > 0 && (
                    <span style={{
                      position:'absolute', top:-4, right:-4,
                      background:'#ff3b30', color:'white', borderRadius:'50%',
                      minWidth:18, height:18, fontSize:11, fontWeight:700,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:'0 4px', boxShadow:'0 1px 4px rgba(0,0,0,0.3)'
                    }}>{unreadCounts[room.id] > 99 ? '99+' : unreadCounts[room.id]}</span>
                  )}
                </div>
                <div className="room-info">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div className={`room-name ${unreadCounts[room.id] > 0 ? 'unread' : ''}`}>{room.name}</div>
                    {lastMsg?.createdAt && <div style={{ fontSize:11, color:'var(--text2)' }}>{new Date(lastMsg.createdAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</div>}
                  </div>
                  <div className={`room-last-msg ${unreadCounts[room.id] > 0 ? 'unread' : ''}`}>
                    {lastMsg?.type === 'stamp' ? '[スタンプ]' : lastMsg?.type === 'file' ? '[ファイル]' : lastMsg?.content?.slice(0, 30) || ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedRoom ? (
        <div className="message-area">
          <div className="chat-header">
            <button className="icon-btn back-btn" onClick={() => setSelectedRoom(null)}>←</button>
            <div className="chat-header-name" onClick={() => setShowRoomSettings(true)} style={{ cursor:'pointer' }}>
              {selectedRoom.name} <span style={{ fontSize:12, color:'var(--text2)' }}>⚙️</span>
            </div>
            <button className="icon-btn" onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); setSearchResults([]); }}>🔍</button>
            <button className="icon-btn" onClick={() => setShowNote(true)}>📝</button>
            <button className="icon-btn" onClick={() => { const other = selectedRoom.members?.find(m => m !== currentUser.id); if(other) onCall({ roomId: selectedRoom.id, targetUserId: other, isCaller: true, offer: null }); }}>📞</button>
          </div>
          {showNote && <Note room={selectedRoom} currentUser={currentUser} socket={socket} onClose={() => setShowNote(false)} />}
          {showRoomSettings && (
            <div className="modal-overlay" onClick={() => setShowRoomSettings(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">⚙️ トーク設定</div>
                {/* アイコン変更 */}
                <div style={{ textAlign:'center', marginBottom:16 }}>
                  <div style={{ position:'relative', display:'inline-block', cursor:'pointer' }}
                    onClick={() => roomIconInputRef.current?.click()}>
                    {selectedRoom.icon
                      ? <img src={`${SERVER_URL}${selectedRoom.icon}`} alt="" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--primary)' }} />
                      : <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--primary)', color:'white', fontSize:28, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}>{selectedRoom.name?.[0] || '?'}</div>
                    }
                    <div style={{ position:'absolute', bottom:0, right:0, width:24, height:24, borderRadius:'50%', background:'var(--primary)', color:'white', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>📷</div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:6 }}>タップでアイコン変更</div>
                  <input ref={roomIconInputRef} type="file" accept="image/*" style={{ display:'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append('icon', file);
                      try {
                        await axios.post(`/api/rooms/${selectedRoom.id}/icon`, formData, { headers: { 'Content-Type':'multipart/form-data' } });
                      } catch (err) { console.error(err); }
                      e.target.value = '';
                    }}
                  />
                </div>
                {/* グループ名変更 */}
                <RoomNameEditor room={selectedRoom} onClose={() => setShowRoomSettings(false)} />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowRoomSettings(false)}>閉じる</button>
                </div>
              </div>
            </div>
          )}
          {msgMenu && (
            <div style={{ position:'fixed', inset:0, zIndex:3000 }} onClick={() => setMsgMenu(null)}>
              <div style={{
                position:'fixed',
                left: Math.min(msgMenu.x, window.innerWidth - 160),
                top: Math.min(msgMenu.y, window.innerHeight - 160),
                background:'var(--surface)', borderRadius:12, overflow:'hidden',
                boxShadow:'0 4px 20px rgba(0,0,0,0.2)', minWidth:150, zIndex:3001
              }} onClick={(e) => e.stopPropagation()}>
                {[
                  { icon:'📌', label: pinnedMessage?.id === msgMenu.msg.id ? 'ピンを外す' : 'ピン留め', action: () => {
                    const newId = pinnedMessage?.id === msgMenu.msg.id ? null : msgMenu.msg.id;
                    axios.patch(`/api/rooms/${selectedRoom.id}/pin`, { messageId: newId });
                    setPinnedMessage(newId ? msgMenu.msg : null);
                  }},
                  { icon:'↩', label:'返信', action: () => setReplyTo(msgMenu.msg) },
                  { icon:'😊', label:'リアクション', action: () => setReactionPicker({ msgId: msgMenu.msg.id, x: msgMenu.x, y: msgMenu.y }) },
                  { icon:'📤', label:'転送', action: () => setForwardMsg(msgMenu.msg) },
                ].map(item => (
                  <button key={item.label} onClick={() => { item.action(); setMsgMenu(null); }} style={{
                    display:'flex', alignItems:'center', gap:10, width:'100%', padding:'12px 16px',
                    background:'none', border:'none', cursor:'pointer', fontSize:14, color:'var(--text)',
                    borderBottom:'1px solid var(--border)'
                  }}>
                    <span>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {forwardMsg && (
            <div className="modal-overlay" onClick={() => setForwardMsg(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">📤 転送先を選択</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8, padding:'0 4px',
                  background:'var(--surface2)', borderRadius:8, padding:'8px 10px' }}>
                  {forwardMsg.type === 'stamp' ? '[スタンプ]' : forwardMsg.content?.slice(0, 60)}
                </div>
                <div style={{ maxHeight:300, overflowY:'auto' }}>
                  {rooms.filter(r => r.id !== selectedRoom?.id).map(room => (
                    <div key={room.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 4px', cursor:'pointer', borderRadius:8 }}
                      onClick={async () => {
                        try {
                          await axios.post(`/api/rooms/${room.id}/forward`, {
                            content: forwardMsg.content,
                            type: forwardMsg.type,
                            fileData: forwardMsg.fileData || null,
                          });
                          setForwardMsg(null);
                        } catch(e) { console.error(e); }
                      }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background=''}
                    >
                      <div className="room-avatar" style={{ width:40, height:40, fontSize:16 }}>
                        {room.icon ? <img src={`${SERVER_URL}${room.icon}`} alt="" style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}} /> : (room.name?.[0] || '?')}
                      </div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{room.name}</div>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setForwardMsg(null)}>キャンセル</button>
                </div>
              </div>
            </div>
          )}
          {reactionPicker && (
            <div style={{ position:'fixed', inset:0, zIndex:3000 }} onClick={() => setReactionPicker(null)}>
              <div style={{
                position:'fixed',
                left: Math.min(reactionPicker.x, window.innerWidth - 220),
                top: Math.max(reactionPicker.y - 60, 10),
                background:'var(--surface)', borderRadius:24, padding:'8px 12px',
                boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', gap:6, zIndex:3001
              }} onClick={(e) => e.stopPropagation()}>
                {['❤️','👍','😂','😮','😢','🔥','👏','🎉'].map(emoji => (
                  <button key={emoji} onClick={() => {
                    socket.emit('message:react', { messageId: reactionPicker.msgId, roomId: selectedRoom.id, emoji });
                    setReactionPicker(null);
                  }} style={{ fontSize:24, background:'none', border:'none', cursor:'pointer', padding:'4px 2px', borderRadius:8, transition:'transform 0.1s' }}
                    onMouseEnter={e => e.target.style.transform='scale(1.3)'}
                    onMouseLeave={e => e.target.style.transform='scale(1)'}
                  >{emoji}</button>
                ))}
              </div>
            </div>
          )}
          {showSearch && (
            <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:2000, display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                <button onClick={() => setShowSearch(false)} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={async (e) => {
                    const q = e.target.value;
                    setSearchQuery(q);
                    if (!q.trim()) { setSearchResults([]); return; }
                    setSearchLoading(true);
                    try {
                      const res = await axios.get(`/api/rooms/${selectedRoom.id}/search?q=${encodeURIComponent(q)}`);
                      setSearchResults(res.data);
                    } catch {}
                    finally { setSearchLoading(false); }
                  }}
                  placeholder="メッセージを検索..."
                  style={{ flex:1, padding:'8px 12px', borderRadius:20, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:15, outline:'none' }}
                />
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:8 }}>
                {searchLoading && <div style={{ textAlign:'center', padding:20, color:'var(--text2)' }}>検索中...</div>}
                {!searchLoading && searchQuery && searchResults.length === 0 && (
                  <div style={{ textAlign:'center', padding:20, color:'var(--text2)' }}>「{searchQuery}」は見つかりませんでした</div>
                )}
                {searchResults.map((msg) => (
                  <div key={msg.id || msg._id} style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                    onClick={() => setShowSearch(false)}>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                      {msg.sender_name} · {new Date(msg.created_at).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </div>
                    <div style={{ fontSize:14, color:'var(--text)' }}>
                      {msg.content?.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === searchQuery.toLowerCase()
                          ? <mark key={i} style={{ background:'#ffeb3b', color:'#000', borderRadius:2 }}>{part}</mark>
                          : part
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pinnedMessage && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--surface)', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
              onClick={() => { const el = document.getElementById(`msg-${pinnedMessage.id}`); el?.scrollIntoView({ behavior:'smooth', block:'center' }); }}>
              <span style={{ fontSize:16 }}>📌</span>
              <div style={{ flex:1, overflow:'hidden' }}>
                <div style={{ fontSize:11, color:'var(--primary)', fontWeight:700 }}>ピン留め</div>
                <div style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{pinnedMessage.content}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); axios.patch(`/api/rooms/${selectedRoom.id}/pin`, { messageId: null }); setPinnedMessage(null); }}
                style={{ fontSize:16, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          )}
          <div className="messages-container">
            {messages.map(renderMessage)}
            {typingUsers.length > 0 && <div className="typing-indicator">{typingUsers.join(', ')} が入力中...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">
            {replyTo && (
              <div className="reply-bar">
                <div className="reply-bar-content">
                  <span className="reply-bar-name">↩ {replyTo.senderName}</span>
                  <span className="reply-bar-text">{replyTo.content?.slice(0, 50)}</span>
                </div>
                <button className="reply-bar-close" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            {showStampPanel && (
              <div className="stamp-panel">
                {myStampSets.length === 0
                  ? <span className="no-stamps">ショップでスタンプを追加しよう！</span>
                  : myStampSets.map((stampSet) => (
                    stampSet.stamps.map((stamp, i) => (
                      <span key={`${stampSet.id}-${i}`} style={{ fontSize: 32, cursor: 'pointer', padding: 4 }}
                        title={stamp.label}
                        onClick={() => handleSendStamp(stampSet, stamp)}>{stamp.emoji}</span>
                    ))
                  ))
                }
              </div>
            )}
            <div className="input-row">
              <button className="icon-btn" onClick={() => setShowStampPanel(!showStampPanel)}>🎫</button>
              <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>📎</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              <textarea className="message-input" value={inputText} onChange={handleTyping}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="メッセージを入力..." rows={1} />
              <button className="send-btn" onClick={handleSend} disabled={!inputText.trim()}>送信</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="no-room-selected"><div>💬</div><p>トークを選択してください</p></div>
      )}

      {showCreateRoom && (
        <CreateRoom currentUser={currentUser} friendsList={friendsList} onClose={() => setShowCreateRoom(false)}
          onCreated={(room) => { setRooms((prev) => [room, ...prev]); setSelectedRoom(room); setShowCreateRoom(false); }} />
      )}
    </div>
  );
}

function TabBar({ activeTab, setActiveTab, notifications }) {
  const tabs = [
    { id: 'chat', label: 'トーク', icon: '💬' },
    { id: 'friends', label: '友達', icon: '👥' },
    { id: 'timeline', label: 'タイムライン', icon: '📰' },
    { id: 'stampshop', label: 'ショップ', icon: '🎫' },
    { id: 'album', label: 'アルバム', icon: '📷' },
    { id: 'profile', label: 'プロフィール', icon: '👤' },
  ];
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}>
          <span className="tab-icon">{tab.icon}</span>
          {notifications?.[tab.id] > 0 && <span className="tab-badge">{notifications[tab.id]}</span>}
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [notifications, setNotifications] = useState({ friends: 0 });
  const [toast, setToast] = useState(null);
  const [allStampSets, setAllStampSets] = useState([]);
  const [acquiredStampIds, setAcquiredStampIds] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null); // { from, fromName, offer, roomId }
  const [activeCall, setActiveCall] = useState(null); // { roomId, targetUserId, isCaller, offer }

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/auth/me')
        .then((res) => setCurrentUser(res.data.user))
        .catch(() => { localStorage.removeItem('token'); });
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    axios.get('/api/stamps').then(res => setAllStampSets(res.data)).catch(() => {});
    axios.get('/api/stamps/mysets').then(res => setAcquiredStampIds(res.data.acquired || [])).catch(() => {});
    axios.get('/api/friends').then(res => setFriendsList(res.data)).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const token = localStorage.getItem('token');
    const s = io(SERVER_URL, { auth: { token }, transports: ['websocket', 'polling'], reconnection: true });
    s.on('friend:request', (data) => {
      showToast(`${data.from_name} から友達申請が届きました`);
      setNotifications((prev) => ({ ...prev, friends: prev.friends + 1 }));
    });
    s.on('friend:accepted', (data) => showToast(`${data.by_name} と友達になりました！`, 'success'));
    s.on('call:incoming', (data) => {
      setIncomingCall(data);
    });
    setSocket(s);
    return () => s.disconnect();
  }, [currentUser, showToast]);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Service Worker登録 & Push通知購読
  useEffect(() => {
    if (!currentUser || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registerPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const res = await axios.get('/api/push/vapid-key');
        const vapidKey = res.data.publicKey;
        // urlBase64ToUint8Array変換
        const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
        const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const key = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) key[i] = rawData.charCodeAt(i);
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await axios.post('/api/push/subscribe', sub);
      } catch (e) { console.error('Push登録失敗:', e); }
    };
    registerPush();
  }, [currentUser]);

  const handleLogin = (user) => setCurrentUser(user);

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    if (socket) socket.disconnect();
    setSocket(null); setCurrentUser(null);
  };

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const { from, roomId, offer } = incomingCall;
    setIncomingCall(null);
    setActiveCall({ roomId, targetUserId: from, isCaller: false, offer });
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;
    socket?.emit('call:reject', { to: incomingCall.from });
    setIncomingCall(null);
  };

  const renderTabs = () => (
    <>
      <div style={{ display: activeTab === 'chat' ? 'contents' : 'none' }}>
        <ChatScreen socket={socket} currentUser={currentUser} allStampSets={allStampSets} acquiredStampIds={acquiredStampIds} friendsList={friendsList} onCall={setActiveCall} />
      </div>
      <div style={{ display: activeTab === 'friends' ? 'contents' : 'none' }}>
        <Friends currentUser={currentUser} socket={socket} onClearNotif={() => setNotifications((p) => ({ ...p, friends: 0 }))} />
      </div>
      <div style={{ display: activeTab === 'timeline' ? 'contents' : 'none' }}>
        <Timeline currentUser={currentUser} />
      </div>
      <div style={{ display: activeTab === 'stampshop' ? 'contents' : 'none' }}>
        <ErrorBoundary><StampShop currentUser={currentUser} acquiredStampIds={acquiredStampIds} onAcquire={(id) => setAcquiredStampIds(prev => [...prev, id])} /></ErrorBoundary>
      </div>
      <div style={{ display: activeTab === 'album' ? 'contents' : 'none' }}>
        <Album currentUser={currentUser} />
      </div>
      <div style={{ display: activeTab === 'profile' ? 'contents' : 'none' }}>
        <Profile currentUser={currentUser} onUpdate={setCurrentUser} onLogout={handleLogout} darkMode={darkMode} onToggleDark={() => setDarkMode(!darkMode)} />
      </div>
    </>
  );

  return (
    <Router>
      <div className={`app ${darkMode ? 'dark' : ''}`}>
        <header className="app-header">
          <span className="app-title">💬 LINE Killer</span>
          <div className="header-actions">
            <span className="online-status">🟢 {currentUser.username}</span>
            <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>{darkMode ? '☀️' : '🌙'}</button>
          </div>
        </header>
        <main className="app-main">
          <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',fontSize:24}}>⏳</div>}>
            <Routes>
              <Route path="/videocall/:roomId/:targetUserId" element={<VideoCall currentUser={currentUser} socket={socket} />} />
              <Route path="*" element={renderTabs()} />
            </Routes>
          </Suspense>
        </main>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} notifications={notifications} />
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        {activeCall && (
          <VideoCall
            currentUser={currentUser}
            socket={socket}
            roomId={activeCall.roomId}
            targetUserId={activeCall.targetUserId}
            isCaller={activeCall.isCaller}
            incomingOffer={activeCall.offer}
            onEnd={() => setActiveCall(null)}
          />
        )}
        {incomingCall && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{
              background: '#1a1a2e', borderRadius: 20, padding: '32px 40px',
              textAlign: 'center', color: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 280
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📞</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>着信中</div>
              <div style={{ fontSize: 16, color: '#aaa', marginBottom: 24 }}>{incomingCall.fromName}</div>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                <button onClick={handleRejectCall} style={{
                  width: 64, height: 64, borderRadius: '50%', background: '#e74c3c',
                  fontSize: 28, border: 'none', cursor: 'pointer'
                }}>📵</button>
                <button onClick={handleAcceptCall} style={{
                  width: 64, height: 64, borderRadius: '50%', background: '#2ecc71',
                  fontSize: 28, border: 'none', cursor: 'pointer'
                }}>📞</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}
