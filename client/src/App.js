import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import Friends from './components/Friends';
import Timeline from './components/Timeline';
import StampShop from './components/StampShop';
import Album from './components/Album';
import Profile from './components/Profile';
import VideoCall from './components/VideoCall';
import ErrorBoundary from "./components/ErrorBoundary";
import CreateRoom from './components/CreateRoom';
import './App.css';

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

function ChatScreen({ socket, currentUser, allStampSets, acquiredStampIds, friendsList }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showStampPanel, setShowStampPanel] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
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
      if (msg.roomId === selectedRoom?.id) setMessages((prev) => [...prev, msg]);
      setRooms((prev) =>
        prev.map((r) => r.id === msg.roomId ? { ...r, lastMessage: msg } : r)
      );
    });
    socket.on('room:new', (room) => setRooms((prev) => [room, ...prev]));
    return () => { socket.off('message:receive'); socket.off('room:new'); };
  }, [socket, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) return;
    setMessages([]);
    (async () => {
      try {
        const res = await axios.get(`/api/rooms/${selectedRoom.id}/messages`);
        setMessages(res.data);
        if (socket) socket.emit('room:join', selectedRoom.id);
      } catch (err) { console.error(err); }
    })();
  }, [selectedRoom, socket]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom || !socket) return;
    socket.emit('message:send', { roomId: selectedRoom.id, content: inputText, type: 'text' });
    setInputText('');
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
      <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`}>
        {!isMine && <div className="message-avatar">{msg.senderName?.[0] || '?'}</div>}
        <div className="message-body">
          {!isMine && <div className="message-sender">{msg.senderName}</div>}
          <div className="message-bubble">{content}</div>
          <div className="message-time">{time}</div>
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
                <div className="room-avatar">{room.icon ? <img src={`${SERVER_URL}${room.icon}`} alt="" style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}} /> : (room.name?.[0] || '?')}</div>
                <div className="room-info">
                  <div className="room-name">{room.name}</div>
                  <div className="room-last-msg">
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
            <div className="chat-header-name">{selectedRoom.name}</div>
            <button className="icon-btn" onClick={() => { const other = selectedRoom.members?.find(m => m !== currentUser.id); if(other) window.location.href=`/videocall/${selectedRoom.id}/${other}`; }}>📞</button>
          </div>
          <div className="messages-container">
            {messages.map(renderMessage)}
            {typingUsers.length > 0 && <div className="typing-indicator">{typingUsers.join(', ')} が入力中...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">
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
    setSocket(s);
    return () => s.disconnect();
  }, [currentUser, showToast]);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const handleLogin = (user) => setCurrentUser(user);

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    if (socket) socket.disconnect();
    setSocket(null); setCurrentUser(null);
  };

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const renderTabs = () => (
    <>
      <div style={{ display: activeTab === 'chat' ? 'contents' : 'none' }}>
        <ChatScreen socket={socket} currentUser={currentUser} allStampSets={allStampSets} acquiredStampIds={acquiredStampIds} friendsList={friendsList} />
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
          <Routes>
            <Route path="/videocall/:roomId/:targetUserId" element={<VideoCall currentUser={currentUser} socket={socket} />} />
            <Route path="*" element={renderTabs()} />
          </Routes>
        </main>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} notifications={notifications} />
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      </div>
    </Router>
  );
}
