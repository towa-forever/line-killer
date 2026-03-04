import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import Friends from './components/Friends';
import Timeline from './components/Timeline';
import StampShop from './components/StampShop';
import Album from './components/Album';
import Profile from './components/Profile';
import VideoCall from './components/VideoCall';
import GroupSettings from './components/GroupSettings';
import CreateRoom from './components/CreateRoom';
import './App.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://nexus.ap-1.evennode.com';

axios.defaults.baseURL = SERVER_URL;

function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin
        ? { username, password }
        : { username, password, displayName: displayName || username };
      const res = await axios.post(endpoint, payload);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('userId', res.data.user._id);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || '接続エラー');
    } finally {
      setLoading(false);
    }
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
          {!isLogin && (
            <input type="text" placeholder="表示名" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} className="auth-input" />
          )}
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

function ChatScreen({ socket, currentUser, darkMode }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [myStamps, setMyStamps] = useState([]);
  const [showStampPanel, setShowStampPanel] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await axios.get('/api/rooms');
      setRooms(res.data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchMyStamps = useCallback(async () => {
    try {
      const res = await axios.get('/api/stamps/my');
      setMyStamps(res.data);
    } catch (err) {}
  }, []);

  useEffect(() => { fetchRooms(); fetchMyStamps(); }, [fetchRooms, fetchMyStamps]);

  useEffect(() => {
    if (!socket) return;
    socket.on('message:new', (msg) => {
      if (msg.roomId === selectedRoom?._id) setMessages((prev) => [...prev, msg]);
      setRooms((prev) =>
        prev.map((r) => r._id === msg.roomId ? { ...r, lastMessage: msg, updatedAt: msg.createdAt } : r)
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      );
    });
    socket.on('online:update', (users) => setOnlineUsers(users));
    socket.on('typing:start', ({ userId, roomId, displayName }) => {
      if (roomId === selectedRoom?._id && userId !== currentUser._id)
        setTypingUsers((prev) => prev.includes(displayName) ? prev : [...prev, displayName]);
    });
    socket.on('typing:stop', ({ displayName }) => {
      setTypingUsers((prev) => prev.filter((n) => n !== displayName));
    });
    return () => {
      socket.off('message:new'); socket.off('online:update');
      socket.off('typing:start'); socket.off('typing:stop');
    };
  }, [socket, selectedRoom, currentUser._id]);

  useEffect(() => {
    if (!selectedRoom) return;
    (async () => {
      try {
        const res = await axios.get(`/api/rooms/${selectedRoom._id}/messages`);
        setMessages(res.data);
        if (socket) socket.emit('room:join', selectedRoom._id);
      } catch (err) { console.error(err); }
    })();
  }, [selectedRoom, socket]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom) return;
    try {
      await axios.post(`/api/rooms/${selectedRoom._id}/messages`, { content: inputText, type: 'text' });
      setInputText('');
      socket?.emit('typing:stop', { roomId: selectedRoom._id, displayName: currentUser.displayName });
    } catch (err) { console.error(err); }
  };

  const handleSendStamp = async (stampId) => {
    if (!selectedRoom) return;
    try {
      await axios.post(`/api/rooms/${selectedRoom._id}/messages`, { content: stampId, type: 'stamp' });
      setShowStampPanel(false);
    } catch (err) {}
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedRoom) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', selectedRoom._id);
    try {
      await axios.post(`/api/rooms/${selectedRoom._id}/messages/file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (err) { console.error(err); }
    e.target.value = '';
  };

  const handleTyping = (e) => {
    setInputText(e.target.value);
    if (!socket || !selectedRoom) return;
    socket.emit('typing:start', { roomId: selectedRoom._id, displayName: currentUser.displayName });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { roomId: selectedRoom._id, displayName: currentUser.displayName });
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const isOnline = (userId) => onlineUsers.includes(userId);

  const renderMessage = (msg) => {
    const isMine = msg.sender?._id === currentUser._id || msg.sender === currentUser._id;
    const senderName = msg.sender?.displayName || '';
    const time = new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    let content;
    if (msg.type === 'stamp') {
      const stamp = myStamps.find((s) => s._id === msg.content);
      content = stamp ? <img src={`${SERVER_URL}${stamp.imageUrl}`} alt="stamp" className="chat-stamp" /> : <span>🎫</span>;
    } else if (msg.type === 'file' || msg.type === 'image') {
      const isImage = msg.fileType?.startsWith('image/') || msg.type === 'image';
      content = isImage
        ? <img src={`${SERVER_URL}${msg.fileUrl}`} alt="img" className="chat-image" />
        : <a href={`${SERVER_URL}${msg.fileUrl}`} target="_blank" rel="noreferrer" className="chat-file-link">📎 {msg.fileName || 'ファイル'}</a>;
    } else {
      content = <span>{msg.content}</span>;
    }
    return (
      <div key={msg._id} className={`message ${isMine ? 'mine' : 'theirs'}`}>
        {!isMine && <div className="message-avatar">{senderName?.[0] || '?'}</div>}
        <div className="message-body">
          {!isMine && <div className="message-sender">{senderName}</div>}
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
            const otherMembers = room.members?.filter((m) => m._id !== currentUser._id) || [];
            const roomName = room.name || otherMembers.map((m) => m.displayName).join(', ') || '不明';
            const lastMsg = room.lastMessage;
            const unread = room.unreadCount || 0;
            const online = otherMembers.some((m) => isOnline(m._id));
            return (
              <div key={room._id} className={`room-item ${selectedRoom?._id === room._id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}>
                <div className="room-avatar">
                  {room.isGroup ? '👥' : roomName[0] || '?'}
                  {online && <span className="online-dot" />}
                </div>
                <div className="room-info">
                  <div className="room-name">{roomName}</div>
                  <div className="room-last-msg">
                    {lastMsg?.type === 'stamp' ? '[スタンプ]' : lastMsg?.type === 'file' ? '[ファイル]' : lastMsg?.content?.slice(0, 30) || ''}
                  </div>
                </div>
                {unread > 0 && <div className="unread-badge">{unread}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {selectedRoom ? (
        <div className="message-area">
          <div className="chat-header">
            <button className="icon-btn back-btn" onClick={() => setSelectedRoom(null)}>←</button>
            <div className="chat-header-name">
              {selectedRoom.name || selectedRoom.members?.find((m) => m._id !== currentUser._id)?.displayName || 'トーク'}
            </div>
          </div>
          <div className="messages-container">
            {messages.map(renderMessage)}
            {typingUsers.length > 0 && <div className="typing-indicator">{typingUsers.join(', ')} が入力中...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">
            {showStampPanel && (
              <div className="stamp-panel">
                {myStamps.map((s) => (
                  <img key={s._id} src={`${SERVER_URL}${s.imageUrl}`} alt="stamp"
                    className="stamp-thumbnail" onClick={() => handleSendStamp(s._id)} />
                ))}
                {myStamps.length === 0 && <span className="no-stamps">スタンプなし</span>}
              </div>
            )}
            <div className="input-row">
              <button className="icon-btn" onClick={() => setShowStampPanel(!showStampPanel)}>🎫</button>
              <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>📎</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              <textarea className="message-input" value={inputText} onChange={handleTyping}
                onKeyDown={handleKeyDown} placeholder="メッセージを入力..." rows={1} />
              <button className="send-btn" onClick={handleSend} disabled={!inputText.trim()}>送信</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="no-room-selected"><div>💬</div><p>トークを選択してください</p></div>
      )}

      {showCreateRoom && (
        <CreateRoom currentUser={currentUser} onClose={() => setShowCreateRoom(false)}
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
  const [notifications, setNotifications] = useState({ friends: 0, chat: 0 });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/auth/me')
        .then((res) => setCurrentUser(res.data))
        .catch(() => { localStorage.removeItem('token'); localStorage.removeItem('userId'); });
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const token = localStorage.getItem('token');
    const s = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    s.on('connect', () => s.emit('user:online', currentUser._id));
    s.on('friend:request', (data) => {
      showToast(`${data.fromName} から友達申請が届きました`);
      setNotifications((prev) => ({ ...prev, friends: prev.friends + 1 }));
    });
    s.on('friend:accepted', (data) => showToast(`${data.name} と友達になりました！`, 'success'));
    setSocket(s);
    return () => s.disconnect();
  }, [currentUser, showToast]);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('userId');
    delete axios.defaults.headers.common['Authorization'];
    if (socket) socket.disconnect();
    setSocket(null); setCurrentUser(null);
  };

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

  const renderTab = () => {
    switch (activeTab) {
      case 'chat': return <ChatScreen socket={socket} currentUser={currentUser} darkMode={darkMode} />;
      case 'friends': return <Friends currentUser={currentUser} socket={socket} onClearNotif={() => setNotifications((p) => ({ ...p, friends: 0 }))} />;
      case 'timeline': return <Timeline currentUser={currentUser} />;
      case 'stampshop': return <StampShop currentUser={currentUser} />;
      case 'album': return <Album currentUser={currentUser} />;
      case 'profile': return <Profile currentUser={currentUser} onUpdate={setCurrentUser} onLogout={handleLogout} darkMode={darkMode} onToggleDark={() => setDarkMode(!darkMode)} />;
      default: return null;
    }
  };

  return (
    <Router>
      <div className={`app ${darkMode ? 'dark' : ''}`}>
        <header className="app-header">
          <span className="app-title">💬 LINE Killer</span>
          <div className="header-actions">
            <span className="online-status">🟢 {currentUser.displayName}</span>
            <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>{darkMode ? '☀️' : '🌙'}</button>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/videocall/:roomId" element={<VideoCall currentUser={currentUser} socket={socket} />} />
            <Route path="*" element={renderTab()} />
          </Routes>
        </main>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} notifications={notifications} />
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      </div>
    </Router>
  );
}
