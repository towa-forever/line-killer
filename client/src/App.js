import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import ErrorBoundary from "./components/ErrorBoundary";
import VideoCall from "./components/VideoCall";
import { sounds } from "./utils/sounds";
import VoiceMessage, { VoiceMessageBubble } from './components/VoiceMessage';
import LocationShare, { LocationBubble } from './components/LocationShare';
import { SecretBubble } from './components/SecretMessage';
import { StoryBar } from './components/Story';
import './App.css';

// 遅延読み込み（初回ロード高速化）
const Friends = lazy(() => import('./components/Friends'));
const Timeline = lazy(() => import('./components/Timeline'));
const StampShop = lazy(() => import('./components/StampShop'));
const Album = lazy(() => import('./components/Album'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const EventCalendar = lazy(() => import('./components/EventCalendar'));
const MiniGame = lazy(() => import('./components/MiniGame'));
const VoiceCall = lazy(() => import('./components/VoiceCall'));
const SubAccounts = lazy(() => import('./components/SubAccounts'));
const ContactForm     = lazy(() => import('./components/ContactForm'));
// PasswordReset は AuthScreen 内で inline lazy import
const GiftModal       = lazy(() => import('./components/GiftModal'));
const ReadLater       = lazy(() => import('./components/ReadLater'));
const PinSetup        = lazy(() => import('./components/PinSetup').then(m => ({ default: m.PinSetup })));
const PinVerify       = lazy(() => import('./components/PinSetup').then(m => ({ default: m.PinVerify })));
const StickerMaker = lazy(() => import('./components/StickerMaker'));
const AIAssistant = lazy(() => import('./components/AIAssistant'));
const PollCard = lazy(() => import('./components/PollCard'));
const TaskPanel = lazy(() => import('./components/TaskPanel'));
const GroupVideoCall = lazy(() => import('./components/GroupVideoCall'));
const SecretMessage = lazy(() => import('./components/SecretMessage').then(m => ({ default: m.default })));
const ChatStats = lazy(() => import('./components/ChatStats'));
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
  const [showReset, setShowReset] = useState(false);

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

  if (showReset) {
    const PasswordResetInline = React.lazy(() => import('./components/PasswordReset'));
    return (
      <React.Suspense fallback={<div className="auth-screen"><div className="auth-card">読み込み中...</div></div>}>
        <PasswordResetInline onBack={() => setShowReset(false)} />
      </React.Suspense>
    );
  }

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
        {isLogin && (
          <button onClick={() => setShowReset(true)} style={{
            background:'none', border:'none', color:'var(--primary)', fontSize:13,
            cursor:'pointer', padding:'4px 0', marginTop:4, display:'block', width:'100%'
          }}>
            パスワードを忘れた方はこちら
          </button>
        )}
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

// アバターフレームコンポーネント
// AVATAR_FRAMES removed
function AvatarImg({ src, name, size = 40, frame = 'none' }) {
  const inner = src
    ? <img src={src} alt="" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', display:'block' }} />
    : <div style={{ width:size, height:size, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.4, fontWeight:700 }}>{name?.[0] || '?'}</div>;
  if (frame === 'none') return inner;
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      {inner}
      {frame === 'glow'
        ? <div className="avatar-frame-ring avatar-frame-glow" />
        : <div className={`avatar-frame-ring avatar-frame-${frame}`} style={{ padding:2, WebkitMask:'radial-gradient(circle at center, transparent calc(50% - 3px), black calc(50% - 3px))' }} />
      }
    </div>
  );
}

function ChatScreen({ socket, currentUser, allStampSets, acquiredStampIds, friendsList, onCall, setGroupCall, onlineUsers = new Set(), bookmarks = new Set(), setBookmarks, mutedRooms = new Set(), setMutedRooms, soundTheme = 'default', setShowSubAccounts, setVoiceCall, showToast, setShowGift }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesCache = useRef({});
  const hasMoreMessages = useRef({}); // ルームごとにまだ読めるか
  const loadingMoreRef = useRef(false); // 二重ロード防止
  const [inputText, setInputText] = useState('');
  const [showStampPanel, setShowStampPanel] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // 返信先メッセージ
  const [showSearch, setShowSearch] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(null); // { msgId, x, y }
  const [translating, setTranslating] = useState({}); // { msgId: translated text }
  const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥'];
  const [pinnedMessage, setPinnedMessage] = useState(null); // ピン留めメッセージ
  const [unreadCounts, setUnreadCounts] = useState({}); // { roomId: count }
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null); // 転送するメッセージ
  const roomIconInputRef = useRef(null);
  const longPressTimer = useRef(null);
  const [msgMenu, setMsgMenu] = useState(null); // { msg, x, y } 長押しメニュー
  const [editingMessage, setEditingMessage] = useState(null); // { id, content }
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showReadDetail, setShowReadDetail] = useState(null); // { msgId, readers: [] }
  const [showMediaList, setShowMediaList] = useState(false);
  const [showMemberMgr, setShowMemberMgr] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(null); // { id, name, avatar, status }
  const [, setReadByDetailMap] = useState({}); // msgId -> [{id,name,avatar}]
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkedMsgs, setBookmarkedMsgs] = useState([]);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceText, setAnnounceText] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [showEventCal, setShowEventCal] = useState(false);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesList, setFavoritesList] = useState([]);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showStickerMaker, setShowStickerMaker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onOk }
  const appConfirm = (message, onOk) => setConfirmDialog({ message, onOk });
  const [showInputMenu, setShowInputMenu] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [msgStyle, setMsgStyle] = useState(() => JSON.parse(localStorage.getItem('msgStyle') || '{"font":"default","color":""}'));
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ja');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [polls, setPolls] = useState({});
  const [chatBg, setChatBg] = useState(() => localStorage.getItem('chatBg') || 'default');
  const [editText, setEditText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]); // @補完候補
  const [showExport, setShowExport] = useState(false); // チャットエクスポート
  const [showScheduleList, setShowScheduleList] = useState(false); // スケジュール一覧
  const [scheduleList, setScheduleList] = useState([]); // スケジュール済みメッセージ
  const [searchSender, setSearchSender] = useState(''); // 検索：送信者フィルター
  const [searchDate, setSearchDate] = useState(''); // 検索：日付フィルター
  const [notifSettings, setNotifSettings] = useState(() => { // 通知設定
    try { return JSON.parse(localStorage.getItem('notifSettings') || '{}'); } catch { return {}; }
  });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const draftRef = useRef({}); // 下書き一時保存 { roomId: text }
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isAtBottomRef = useRef(true); // スクロール最下部にいるかどうか

  const myStampSets = allStampSets.filter(s => acquiredStampIds.includes(s.id));

  // マウント時にAPIから下書きを取得してdraftRefに入れる
  useEffect(() => {
    axios.get('/api/drafts').then(res => {
      const data = res.data || {};
      Object.assign(draftRef.current, data);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRooms = useCallback(async () => {
    try { const res = await axios.get('/api/rooms'); setRooms(res.data); }
    catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // タイピングタイムアウトのクリーンアップ
  useEffect(() => {
    const ref = typingTimeoutRef.current;
    return () => { if (ref) clearTimeout(ref); };
  }, []);

  // ヘッダーメニュー・入力メニューを画面外タップで閉じる
  useEffect(() => {
    if (!showHeaderMenu && !showInputMenu) return;
    const close = (e) => {
      if (!e.target.closest('.header-menu-dropdown') && !e.target.closest('.header-menu-btn')) setShowHeaderMenu(false);
      if (!e.target.closest('.input-menu-grid') && !e.target.closest('.plus-btn')) setShowInputMenu(false);
    };
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('touchstart', close); document.removeEventListener('mousedown', close); };
  }, [showHeaderMenu, showInputMenu]);

  // タブの未読バッジ
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((s, n) => s + n, 0);
    document.title = total > 0 ? `(${total}) LINE Killer` : 'LINE Killer';
  }, [unreadCounts]);

  useEffect(() => {
    if (!socket) return;
    socket.on('message:receive', (msg) => {
      if (msg.roomId === selectedRoom?.id) {
        setMessages((prev) => { const next = [...prev, msg]; return next.length > 500 ? next.slice(-500) : next; });
        if (msg.senderId !== currentUser.id) {
          socket.emit('message:read', { messageId: msg.id, roomId: msg.roomId });
          sounds.receive(soundTheme);
        }
      } else if (msg.senderId !== currentUser.id) {
        // 別のルームのメッセージは未読カウントを増やす
        setUnreadCounts((prev) => ({ ...prev, [msg.roomId]: (prev[msg.roomId] || 0) + 1 }));
      }
      setRooms((prev) =>
        prev.map((r) => r.id === msg.roomId ? { ...r, lastMessage: msg, lastActivity: msg.createdAt } : r)
          .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0))
      );
    });
    socket.on('message:read_update', ({ messageId, readBy, readByDetail }) => {
      if (readByDetail) setReadByDetailMap(prev => ({ ...prev, [messageId]: readByDetail }));
      setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, read_by: readBy } : m));
      Object.keys(messagesCache.current).forEach(roomId => {
        if (Array.isArray(messagesCache.current[roomId]))
          messagesCache.current[roomId] = messagesCache.current[roomId].map(
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
    socket.on('poll:updated', (poll) => {
      setPolls(prev => ({ ...prev, [poll.id]: poll }));
    });
    socket.on('room:announcement', ({ roomId, text, by }) => {
      if (roomId === selectedRoom?.id) {
        const sysMsg = { id: 'ann_' + Date.now(), type: 'announcement', content: text, senderId: by, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, sysMsg]);
      }
    });
    socket.on('message:edited', ({ messageId, content: newContent }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, edited: true } : m));
      if (messagesCache.current[selectedRoom?.id])
        messagesCache.current[selectedRoom.id] = messagesCache.current[selectedRoom.id].map(m => m.id === messageId ? { ...m, content: newContent, edited: true } : m);
    });
    socket.on('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, content: '' } : m));
      if (messagesCache.current[selectedRoom?.id])
        messagesCache.current[selectedRoom.id] = messagesCache.current[selectedRoom.id].map(m => m.id === messageId ? { ...m, deleted: true, content: '' } : m);
    });
    // タイピングインジケーター
    socket.on('typing:update', ({ username, isTyping }) => {
      setTypingUsers(prev =>
        isTyping ? (prev.includes(username) ? prev : [...prev, username])
                 : prev.filter(u => u !== username)
      );
    });
    return () => {
      socket.off('message:receive'); socket.off('message:read_update');
      socket.off('message:reacted'); socket.off('room:new'); socket.off('room:updated');
      socket.off('message:edited'); socket.off('message:deleted');
      socket.off('room:pinned'); socket.off('poll:updated');
      socket.off('room:announcement'); socket.off('typing:update');
    };
  }, [socket, selectedRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // ルーム切り替え時に状態をリセット
    // 前のルームの下書きを保存
    if (draftRef.current._prevRoom && inputText.trim()) {
      draftRef.current[draftRef.current._prevRoom] = inputText;
      // APIにも非同期で保存
      axios.put('/api/drafts/' + draftRef.current._prevRoom, { content: inputText }).catch(() => {});
    } else if (draftRef.current._prevRoom) {
      draftRef.current[draftRef.current._prevRoom] = '';
    }
    draftRef.current._prevRoom = selectedRoom?.id;
    // 新しいルームの下書きを復元
    const savedDraft = selectedRoom ? (draftRef.current[selectedRoom.id] || '') : '';
    setInputText(savedDraft);
    setReplyTo(null);
    setShowInputMenu(false);
    setShowHeaderMenu(false);
    setShowStampPanel(false);
    setShowVoice(false);
    setShowLocation(false);
    setShowSecret(false);
    setMentionSuggestions([]);
    if (!selectedRoom) return;
    messagesCache.current._current = selectedRoom.id; // 現在のルームを記録
    hasMoreMessages.current[selectedRoom.id] = true; // 過去メッセージがある可能性あり
    // キャッシュがあれば即表示
    if (messagesCache.current[selectedRoom.id]) {
      setMessages(messagesCache.current[selectedRoom.id]);
    } else {
      setMessages([]);
    }
    const currentRoomId = selectedRoom.id;
    (async () => {
      try {
        const res = await axios.get(`/api/rooms/${currentRoomId}/messages`);
        // ルームが切り替わってたら無視
        if (messagesCache.current._current !== currentRoomId) return;
        messagesCache.current[currentRoomId] = res.data;
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
        // 最下部へ即スクロール（ルーム切替時は必ず最新メッセージから）
        isAtBottomRef.current = true;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
        if (socket) {
          socket.emit('room:join', selectedRoom.id);
          res.data.forEach(msg => {
            if (msg.senderId !== currentUser.id && !msg.read_by?.includes(currentUser.id)) {
              socket.emit('message:read', { messageId: msg.id, roomId: selectedRoom.id });
            }
          });
        }
      } catch (err) { console.error(err); }
    })();
  }, [selectedRoom, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // メッセージが増えた時: 最下部にいれば自動スクロール
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // 'smooth'より速い
    }
  }, [messages]);

  // 過去メッセージを追加読み込み
  const loadMoreMessages = async () => {
    if (!selectedRoom || loadingMoreRef.current) return;
    if (hasMoreMessages.current[selectedRoom.id] === false) return;
    const oldest = messages[0];
    if (!oldest) return;
    loadingMoreRef.current = true;
    try {
      const res = await axios.get(`/api/rooms/${selectedRoom.id}/messages?limit=50&before=${encodeURIComponent(oldest.createdAt || oldest.created_at)}`);
      if (res.data.length === 0) {
        hasMoreMessages.current[selectedRoom.id] = false;
        return;
      }
      // 既存メッセージの前に追加
      setMessages(prev => {
        const existIds = new Set(prev.map(m => m.id));
        const newMsgs = res.data.filter(m => !existIds.has(m.id));
        return [...newMsgs, ...prev];
      });
    } catch (e) { console.error(e); }
    finally { loadingMoreRef.current = false; }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom || !socket) return;
    sounds.send(soundTheme);
    socket.emit('message:send', { roomId: selectedRoom.id, content: inputText, type: 'text', replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderName: replyTo.senderName } : null });
    setInputText('');
    setReplyTo(null);
    // textareaの高さをリセット
    const ta = document.querySelector('.message-input');
    if (ta) { ta.style.height = 'auto'; }
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
    const val = e.target.value;
    setInputText(val);
    // textareaの高さを自動調整
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    // @メンション補完
    const cursor = ta.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);
    if (atMatch && selectedRoom?.members?.length > 0) {
      const q = atMatch[1].toLowerCase();
      const members = selectedRoom.members.filter(m =>
        m.id !== currentUser.id &&
        (m.username?.toLowerCase().includes(q) || m.displayName?.toLowerCase().includes(q))
      ).slice(0, 5);
      setMentionSuggestions(members);
    } else {
      setMentionSuggestions([]);
    }
    if (!socket || !selectedRoom) return;
    socket.emit('typing:start', { roomId: selectedRoom.id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('typing:stop', { roomId: selectedRoom.id }), 2000);
  };

  const handleMentionSelect = (member) => {
    const ta = document.querySelector('.message-input');
    const cursor = ta?.selectionStart ?? inputText.length;
    const textBefore = inputText.slice(0, cursor);
    const replaced = textBefore.replace(/@(\S*)$/, `@${member.username || member.displayName} `);
    setInputText(replaced + inputText.slice(cursor));
    setMentionSuggestions([]);
    setTimeout(() => ta?.focus(), 0);
  };

  const renderMessage = (msg) => {
    const isMine = (msg.senderId || msg.sender_id) === currentUser.id;
    // 投票メッセージ
    if (msg.type === 'poll') {
      const pollId = msg.fileData?.pollId || msg.file_data?.pollId;
      const pollData = polls[pollId] || msg.poll;
      return (
        <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`} style={{ marginBottom:6 }}>
          {!isMine && <div className="message-avatar">{msg.senderName?.[0] || '?'}</div>}
          <div className="message-body">
            {!isMine && <div className="message-sender">{msg.senderName}</div>}
            <Suspense fallback={<div style={{fontSize:13,color:'var(--text2)'}}>📊...</div>}><PollCard pollId={pollId} initialPoll={pollData} currentUser={currentUser} /></Suspense>
          </div>
        </div>
      );
    }
    // 期限付きメッセージ
    if (msg.type === 'ephemeral') {
      const expiresAt = msg.expiresAt ? new Date(msg.expiresAt) : null;
      const remaining = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0;
      return (
        <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`} style={{ marginBottom:6 }}>
          {!isMine && <div className="message-avatar">{msg.senderName?.[0] || '?'}</div>}
          <div className="message-body">
            {!isMine && <div className="message-sender">{msg.senderName}</div>}
            <div className="message-bubble" style={{ border:'1.5px dashed var(--danger)', background:'rgba(255,59,48,0.07)', position:'relative' }}>
              <span style={{ fontSize:12, marginRight:6 }}>💨</span>{msg.content}
              {remaining > 0 && <div style={{ fontSize:10, color:'var(--danger)', marginTop:4 }}>{remaining}秒後に消えるで</div>}
            </div>
          </div>
        </div>
      );
    }
    // アナウンスはシステムメッセージとして表示
    if (msg.type === 'announcement') {
      return (
        <div key={msg.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', margin:'4px 0', background:'rgba(6,199,85,0.1)', borderRadius:10, border:'1px solid rgba(6,199,85,0.3)' }}>
          <span style={{ fontSize:16 }}>📢</span>
          <span style={{ fontSize:13, color:'var(--text)', flex:1 }}>{msg.content}</span>
        </div>
      );
    }
    const time = new Date(msg.createdAt || msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      // 削除済みメッセージ
    if (msg.deleted) {
      return (
        <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`} style={{ marginBottom: 2 }}>
          <div className="message-avatar" style={{ background: isMine ? 'var(--primary)' : 'var(--surface2)', opacity: 0.5, flexShrink: 0 }}>
            {msg.senderName?.[0] || '?'}
          </div>
          <div className="message-body">
            <div className="message-sender" style={{ color: 'var(--text2)', textAlign: isMine ? 'right' : 'left' }}>{msg.senderName}</div>
            <div className="message-bubble" style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', border: '1px dashed var(--border)' }}>
              🚫 送信取消しました
            </div>
          </div>
        </div>
      );
    }
    let content;
    if (msg.type === 'call_start' || msg.type === 'call_end') {
      const isStart = msg.type === 'call_start';
      return (
        <div key={msg.id} style={{ display:'flex', justifyContent:'center', margin:'8px 0' }}>
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            background: isStart ? 'rgba(6,199,85,0.12)' : 'rgba(100,100,100,0.12)',
            border: `1px solid ${isStart ? 'rgba(6,199,85,0.3)' : 'rgba(100,100,100,0.25)'}`,
            borderRadius:20, padding:'6px 14px', fontSize:13, color:'var(--text2)',
          }}>
            <span style={{ fontSize:16 }}>{isStart ? '📞' : '📵'}</span>
            <span>{msg.content}</span>
            <span style={{ fontSize:11, opacity:0.7 }}>
              {new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}
            </span>
          </div>
        </div>
      );
    } else if (msg.type === 'stamp') {
      content = <span style={{ fontSize: 36 }}>{msg.content}</span>;
    } else if (msg.type === 'image' && msg.fileData?.url) {
      const imgSrc = msg.fileData.url?.startsWith('http') ? msg.fileData.url : `${SERVER_URL}${msg.fileData.url}`;
      content = <img src={imgSrc} alt="img" className="chat-image" loading="lazy" />;
    } else if (msg.type === 'file' && msg.fileData?.url) {
      const fileUrl = msg.fileData.url?.startsWith('http') ? msg.fileData.url : `${SERVER_URL}${msg.fileData.url}`;
      const ext = (msg.fileData.url || '').split('.').pop().toLowerCase();
      const icons = { pdf:'📄', zip:'🗜️', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', mp4:'🎬', mov:'🎬', mp3:'🎵' };
      content = <a href={fileUrl} target="_blank" rel="noreferrer" className="chat-file-link" download style={{ display:'flex', alignItems:'center', gap:6 }}>{icons[ext]||'📎'} {msg.content}</a>;
    } else if (msg.type === 'voice') {
      content = <VoiceMessageBubble msg={msg} isMine={isMine} />;
    } else if (msg.type === 'location') {
      content = <LocationBubble msg={msg} isMine={isMine} />;
    } else if (msg.type === 'secret') {
      content = <SecretBubble msg={msg} isMine={isMine} />;
    } else {
      content = <span style={msgStyle.font !== 'default' ? { fontFamily: msgStyle.font } : {}}>{msg.content}</span>;
    }
    return (
      <div key={msg.id} id={`msg-${msg.id}`} className={`message ${isMine ? 'mine' : 'theirs'}`}
        onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ msg, x: e.clientX, y: e.clientY }); }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          longPressTimer.current = setTimeout(() => {
            setMsgMenu({ msg, x: touch.clientX, y: touch.clientY });
          }, 500);
        }}
        onTouchEnd={() => clearTimeout(longPressTimer.current)}
        onTouchMove={() => clearTimeout(longPressTimer.current)}>
        <div className="message-avatar" style={{ cursor:'pointer', flexShrink:0, background: isMine ? 'var(--primary)' : 'var(--surface2)' }}
          onClick={() => setShowUserProfile({ id: msg.senderId, name: msg.senderName, avatar: msg.senderAvatar })}>
          {msg.senderAvatar
            ? <img src={msg.senderAvatar.startsWith('http') ? msg.senderAvatar : `${SERVER_URL}${msg.senderAvatar}`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
            : <span style={{fontSize:15,fontWeight:700,color:isMine?'#fff':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>{msg.senderName?.[0] || '?'}</span>}
        </div>
        <div className="message-body">
          <div className="message-sender" style={{ color: isMine ? 'rgba(255,255,255,0.75)' : 'var(--text2)', textAlign: isMine ? 'right' : 'left' }}>{msg.senderName}</div>
          {msg.forwarded && (
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>📤 転送されたメッセージ</div>
          )}
          {msg.replyTo && (
            <div className="reply-preview">
              <span className="reply-name">{msg.replyTo.senderName}</span>
              <span className="reply-content">{msg.replyTo.content?.slice(0, 40)}{msg.replyTo.content?.length > 40 ? '...' : ''}</span>
            </div>
          )}
          <div style={{ position:'relative' }}>
            <div className="message-bubble">{content}
            {translating[msg.id] && (
              <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid rgba(0,0,0,0.1)', fontSize:12, color: translating[msg.id] === '翻訳中...' ? 'var(--text2)' : 'var(--text)', fontStyle:'italic' }}>
                🌐 {translating[msg.id]}
              </div>
            )}
            </div>
          </div>
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
            {isMine && (() => {
              const readCount = (msg.read_by || []).filter(id => id !== currentUser.id).length;
              if (readCount === 0) return <span style={{ fontSize:11, color:'var(--text2)', marginRight:4 }}>未読</span>;
              return (
                <span
                  style={{ fontSize:11, color:'#06c755', marginRight:4, fontWeight:600, cursor:'pointer' }}
                  onClick={() => {
                    // 既読した人の詳細を表示
                    const readers = (msg.read_by || []).filter(id => id !== currentUser.id).map(id => {
                      const member = selectedRoom?.memberDetails?.find(m => m.id === id);
                      return member?.displayName || member?.username || id;
                    });
                    showToast?.(`既読: ${readers.join('、') || readCount + '人'}`, 'info');
                  }}
                  title="タップで詳細表示"
                >
                  既読 {readCount > 1 ? readCount : ''}
                </span>
              );
            })()}
            {time}
            <span className="reply-btn" onClick={() => setReplyTo(msg)}>↩</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-screen">
      <div className={`room-list ${selectedRoom ? "hidden" : ""}`}>
        <div className="room-list-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          {/* アカウントアイコン（クリックでサブアカ切替） */}
          <button onClick={() => setShowSubAccounts(true)}
            style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:'2px 4px', borderRadius:10 }}>
            <AvatarImg
              src={currentUser?.avatar ? (currentUser.avatar.startsWith('http') ? currentUser.avatar : `${SERVER_URL}${currentUser.avatar}`) : null}
              name={currentUser?.displayName || currentUser?.username}
              size={34}
              frame={currentUser?.avatarFrame || 'none'}
            />
            <span style={{ color:'white', fontSize:18, fontWeight:800 }}>トーク</span>
          </button>
          <button className="icon-btn" onClick={() => setShowCreateRoom(true)} style={{ fontSize:22, color:'white' }}>✏️</button>
        </div>
        <StoryBar currentUser={currentUser} friendsList={friendsList} socket={socket} />
        <div className="room-items">
          {rooms.length === 0 && (
            <div className="room-empty">
              <div className="room-empty-icon">💬</div>
              <div className="room-empty-text">まだトークがないで！<br/>右上の ✏️ からトークを始めよう</div>
            </div>
          )}
          {rooms.map((room) => {
            const lastMsg = room.lastMessage;
            return (
              <div key={room.id} className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}>
                <div style={{ position:'relative' }}>
                  <AvatarImg src={room.icon ? `${SERVER_URL}${room.icon}` : null} name={room.name} size={40} frame="none" />
                  {/* オンラインドット */}
                  {room.members?.some(mid => mid !== currentUser.id && onlineUsers.has(mid)) && (
                    <span style={{
                      position:'absolute', bottom:0, right:0,
                      width:13, height:13, background:'#06c755',
                      border:'2px solid var(--surface)', borderRadius:'50%'
                    }} title="オンライン" />
                  )}
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
                    <div className={`room-name ${unreadCounts[room.id] > 0 ? 'unread' : ''}`}>
                      {room.name}
                      {mutedRooms.has(room.id) && <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>🔕</span>}
                    </div>
                    {room.members?.length === 2 && room.memberStatus && (
                      <div className="status-badge">{room.memberStatus}</div>
                    )}
                    {lastMsg?.createdAt && <div style={{ fontSize:11, color:'var(--text2)' }}>{new Date(lastMsg.createdAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</div>}
                  </div>
                  <div className={`room-last-msg ${unreadCounts[room.id] > 0 ? 'unread' : ''}`}>
                    {lastMsg?.type === 'stamp' ? '[スタンプ]' : lastMsg?.type === 'file' ? '[ファイル]' : lastMsg?.type === 'call_start' ? '📞 通話を開始しました' : lastMsg?.type === 'call_end' ? '📵 通話終了' : lastMsg?.content?.slice(0, 30) || ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`message-area ${selectedRoom ? "visible" : ""}`}>
        {selectedRoom && <>
          <div className="chat-header">
            <button className="icon-btn back-btn" onClick={() => setSelectedRoom(null)}>←</button>
            <div className="chat-header-name" onClick={() => setShowRoomSettings(true)} style={{ cursor:'pointer' }}>
              {selectedRoom.name} <span style={{ fontSize:12, color:'var(--text2)' }}>⚙️</span>
            </div>
            <button className="icon-btn" onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); setSearchResults([]); }}>🔍</button>
            <button className="call-icon-btn" onClick={() => {
              if (selectedRoom.members?.length > 2) {
                setGroupCall && setGroupCall({ roomId: selectedRoom.id, members: selectedRoom.members, roomName: selectedRoom.name });
              } else {
                const other = selectedRoom.members?.find(m => m !== currentUser.id);
                if(other) onCall({ roomId: selectedRoom.id, targetUserId: other, isCaller: true, offer: null });
              }
            }}>📞</button>
            <button className="icon-btn header-menu-btn" onClick={() => setShowHeaderMenu(v=>!v)} title="メニュー">⋯</button>
            {showHeaderMenu && (
              <div className="header-menu-dropdown" onClick={() => setShowHeaderMenu(false)}>
                {[
                  { icon:'📊', label:'チャット統計', action: () => setShowStats(true) },
                  { icon:'🔖', label:'ブックマーク', action: () => { axios.get('/api/bookmarks').then(r => { setBookmarkedMsgs(r.data); setShowBookmarks(true); }).catch(() => {}); } },
                  { icon: mutedRooms.has(selectedRoom.id)?'🔕':'🔔', label: mutedRooms.has(selectedRoom.id)?'ミュート解除':'ミュート', action: () => {
                    const isMuted = mutedRooms.has(selectedRoom.id);
                    if (isMuted) { axios.delete('/api/rooms/'+selectedRoom.id+'/mute'); setMutedRooms(prev=>{const n=new Set(prev);n.delete(selectedRoom.id);return n;}); }
                    else { axios.post('/api/rooms/'+selectedRoom.id+'/mute'); setMutedRooms(prev=>new Set([...prev,selectedRoom.id])); }
                  }},
                  { icon:'📝', label:'ノート', action: () => setShowNote(true) },
                  { icon:'🖼️', label:'画像・動画', action: () => setShowMediaList(true) },
                  { icon:'📅', label:'カレンダー', action: () => setShowEventCal(true) },
                  { icon:'✅', label:'タスク', action: () => setShowTaskPanel(true) },
                  { icon:'🎮', label:'ゲーム', action: () => setShowMiniGame(true) },
                  { icon:'🎨', label:'スタンプ自作', action: () => setShowStickerMaker(true) },
                  { icon:'📞', label:'音声通話', action: () => { const otherId = selectedRoom?.members?.find(m => m !== currentUser.id); setVoiceCall({ targetUser: otherId ? { id: otherId, displayName: selectedRoom.name } : null, isIncoming: false, roomId: selectedRoom?.id, callId: null }); } },
                  { icon:'🤖', label:'AIアシスタント', action: () => setShowAI(true) },
                  { icon:'🎨', label:'背景を変える', action: () => setShowBgPicker(true) },
                  { icon:'📤', label:'チャットをエクスポート', action: () => setShowExport(true) },
                  { icon:'⏰', label:'予約送信一覧', action: () => {
                    axios.get('/api/rooms/' + selectedRoom.id + '/schedules').then(r => { setScheduleList(r.data || []); setShowScheduleList(true); }).catch(() => setShowScheduleList(true));
                  }},
                  { icon:'🔔', label:'通知設定', action: () => setShowNotifSettings(true) },
                ].map(item => (
                  <button key={item.label} className="header-menu-item" onClick={item.action}>
                    <span className="header-menu-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {showNote && <Suspense fallback={null}><Note room={selectedRoom} currentUser={currentUser} socket={socket} onClose={() => setShowNote(false)} /></Suspense>}
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
            <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.4)' }} onClick={() => setMsgMenu(null)}>
              {/* リアクションバー */}
              <div style={{
                position:'fixed',
                bottom: 'calc(env(safe-area-inset-bottom) + 48px)',
                left:'50%', transform:'translateX(-50%)',
                display:'flex', gap:4, background:'var(--surface)',
                borderRadius:32, padding:'8px 12px',
                boxShadow:'0 4px 24px rgba(0,0,0,0.25)', zIndex:3002
              }} onClick={e => e.stopPropagation()}>
                {QUICK_REACTIONS.map(emoji => (
                  <button key={emoji} onClick={() => { socket.emit('message:react', { messageId: msgMenu.msg.id, roomId: selectedRoom.id, emoji }); setMsgMenu(null); }}
                    style={{ fontSize:26, padding:'4px 6px', border:'none', background:'none', cursor:'pointer', borderRadius:12, WebkitTapHighlightColor:'transparent' }}>{emoji}
                  </button>
                ))}
                <button onClick={async () => {
                  if (translating[msgMenu.msg.id]) { setTranslating(p => ({...p, [msgMenu.msg.id]: null})); setMsgMenu(null); return; }
                  setTranslating(p => ({...p, [msgMenu.msg.id]: '翻訳中...'}));
                  try {
                    const res = await axios.post('/api/translate', { text: msgMenu.msg.content, targetLang: '日本語' });
                    setTranslating(p => ({...p, [msgMenu.msg.id]: res.data.result}));
                  } catch { setTranslating(p => ({...p, [msgMenu.msg.id]: '翻訳失敗'})); }
                  setMsgMenu(null);
                }} style={{ fontSize:20, padding:'4px 6px', border:'none', background:'none', cursor:'pointer', borderRadius:12, color:'var(--text2)' }}>🌐</button>
              </div>
              {/* アクションリスト（ボトムシート） */}
              <div style={{
                position:'fixed', bottom:0, left:0, right:0,
                background:'var(--surface)',
                borderRadius:'20px 20px 0 0',
                overflow:'hidden', zIndex:3001,
                paddingBottom:'env(safe-area-inset-bottom)',
                boxShadow:'0 -4px 32px rgba(0,0,0,0.2)',
                animation:'slideUp 0.22s ease'
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
                  { icon:'⭐', label: favoritesList.some(f => f.message_id === msgMenu.msg.id) ? 'お気に入り解除' : 'お気に入り', action: () => {
                    axios.post('/api/favorites', { messageId: msgMenu.msg.id, roomId: selectedRoom.id, content: msgMenu.msg.content, senderName: msgMenu.msg.senderName })
                      .then(r => {
                        if (r.data.removed) setFavoritesList(prev => prev.filter(f => f.message_id !== msgMenu.msg.id));
                        else setFavoritesList(prev => [...prev, { message_id: msgMenu.msg.id, content: msgMenu.msg.content, sender_name: msgMenu.msg.senderName }]);
                      }).catch(() => {});
                  }},
                  { icon:'📋', label:'コピー', action: () => {
                    const text = msgMenu.msg.content || '';
                    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                    else { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
                  }},
                  { icon: bookmarks.has(msgMenu.msg.id) ? '🔖' : '📌', label: bookmarks.has(msgMenu.msg.id) ? 'ブックマーク解除' : 'ブックマーク', action: () => {
                    const isBm = bookmarks.has(msgMenu.msg.id);
                    if (isBm) {
                      axios.delete('/api/bookmarks/' + msgMenu.msg.id);
                      setBookmarks(prev => { const n = new Set(prev); n.delete(msgMenu.msg.id); return n; });
                    } else {
                      axios.post('/api/bookmarks/' + msgMenu.msg.id);
                      setBookmarks(prev => new Set([...prev, msgMenu.msg.id]));
                    }
                  }},
                  { icon:'📖', label:'後で読む', action: () => {
                    axios.post('/api/read-later/' + msgMenu.msg.id).catch(() => {});
                    showToast('後で読むに追加したで👍', 'success');
                  }},
                  ...(msgMenu.msg.senderId !== currentUser.id ? [
                    { icon:'🎁', label:'ギフトを贈る', action: () => setShowGift({ id: msgMenu.msg.senderId, username: msgMenu.msg.senderName }) },
                  ] : []),
                  ...(selectedRoom?.members?.length > 2 && msgMenu.msg.senderId === currentUser.id ? [
                    { icon:'📢', label:'アナウンス', action: () => { setAnnounceText(msgMenu.msg.content || ''); setShowAnnounce(true); } },
                  ] : []),
                  ...(msgMenu.msg.senderId === currentUser.id ? [
                    { icon:'↩️', label:'送信取消', danger: true, action: () => {
                      appConfirm('送信を取り消しますか？', () => socket.emit('message:delete', { roomId: selectedRoom.id, messageId: msgMenu.msg.id, recall: true }));
                    }},
                    { icon:'✏️', label:'編集', action: () => { setEditingMessage(msgMenu.msg); setEditText(msgMenu.msg.content || ''); } },
                    { icon:'🗑️', label:'削除', danger: true, action: () => {
                      appConfirm('このメッセージを削除しますか？', () => socket.emit('message:delete', { roomId: selectedRoom.id, messageId: msgMenu.msg.id }));
                    }},
                  ] : []),
                ].map(item => (
                  <button key={item.label} onClick={() => { item.action(); setMsgMenu(null); }} style={{
                    display:'flex', alignItems:'center', gap:12, width:'100%', padding:'15px 20px',
                    background:'none', border:'none', cursor:'pointer', fontSize:15, color: item.danger ? 'var(--danger)' : 'var(--text)',
                    borderBottom:'1px solid var(--border)', WebkitTapHighlightColor:'transparent'
                  }}>
                    <span style={{fontSize:20,width:28,textAlign:'center'}}>{item.icon}</span>
                    <span style={{fontWeight:500}}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* カスタム確認ダイアログ */}
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320, boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:20, textAlign:'center', lineHeight:1.6 }}>
              {confirmDialog.message}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)}
                style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
                キャンセル
              </button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }}
                style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {showEventCal && <Suspense fallback={null}><EventCalendar room={selectedRoom} currentUser={currentUser} socket={socket} onClose={() => setShowEventCal(false)} /></Suspense>}
      {/* スタンプ自作 */}
      {showStickerMaker && (
        <Suspense fallback={null}>
          <StickerMaker
            onSend={(data) => {
              if (socket && selectedRoom) {
                socket.emit('message:send', { roomId: selectedRoom.id, content: data.content, type: 'image', fileData: data.fileData });
              }
            }}
            onClose={() => setShowStickerMaker(false)}
          />
        </Suspense>
      )}
      {showMiniGame && <Suspense fallback={null}><MiniGame onSendResult={text => { socket.emit('message:send', { roomId: selectedRoom.id, content: text, type: 'text' }); sounds.send(soundTheme); }} onClose={() => setShowMiniGame(false)} /></Suspense>}
          {showFavorites && (
            <div className="modal-overlay" onClick={() => setShowFavorites(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflow:'auto' }}>
                <div className="modal-title">⭐ お気に入り</div>
                {favoritesList.length === 0
                  ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>お気に入りがまだないで！</div>
                  : favoritesList.map((f, i) => (
                    <div key={f.message_id || i} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>{f.sender_name}</div>
                      <div style={{ fontSize:14 }}>{f.content}</div>
                      <button style={{ fontSize:11, color:'var(--danger)', marginTop:4, background:'none', border:'none', cursor:'pointer', padding:0 }}
                        onClick={() => { axios.post('/api/favorites', { messageId: f.message_id }); setFavoritesList(prev => prev.filter(x => x.message_id !== f.message_id)); }}>
                        削除
                      </button>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowFavorites(false)}>閉じる</button>
              </div>
            </div>
          )}
          {showGlobalSearch && (
            <div className="modal-overlay" onClick={() => setShowGlobalSearch(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
                <div className="modal-title">🔍 全トーク検索</div>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <input className="form-input" style={{ flex:1, marginBottom:0 }} value={globalQuery}
                    onChange={e => setGlobalQuery(e.target.value)} placeholder="キーワードを入力..."
                    onKeyDown={e => { if (e.key === 'Enter' && globalQuery.trim()) {
                      setGlobalSearching(true);
                      axios.get('/api/search?q=' + encodeURIComponent(globalQuery)).then(r => { setGlobalResults(r.data); setGlobalSearching(false); }).catch(() => setGlobalSearching(false));
                    }}} autoFocus />
                  <button className="btn btn-primary" style={{ padding:'0 14px' }} onClick={() => {
                    if (!globalQuery.trim()) return;
                    setGlobalSearching(true);
                    axios.get('/api/search?q=' + encodeURIComponent(globalQuery)).then(r => { setGlobalResults(r.data); setGlobalSearching(false); }).catch(() => setGlobalSearching(false));
                  }}>検索</button>
                </div>
                <div style={{ overflowY:'auto', flex:1 }}>
                  {globalSearching && <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>検索中...</div>}
                  {!globalSearching && globalResults.length === 0 && globalQuery && <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>見つからんかった</div>}
                  {globalResults.map(msg => (
                    <div key={msg.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                      onClick={() => { setShowGlobalSearch(false); setSelectedRoom(rooms.find(r => r.id === msg.roomId)); }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, color:'var(--primary)', fontWeight:600 }}>{msg.roomName}</span>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>{new Date(msg.createdAt).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric' })}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:2 }}>{msg.senderName}</div>
                      <div style={{ fontSize:14, color:'var(--text)' }}>{msg.content?.slice(0, 60)}{msg.content?.length > 60 ? '…' : ''}</div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowGlobalSearch(false)}>閉じる</button>
              </div>
            </div>
          )}
          {showAI && (
            <Suspense fallback={null}><AIAssistant
              messages={messages.filter(m => m.type === 'text').slice(-50)}
              currentRoom={selectedRoom}
              onInsert={text => { setInputText(text); setShowAI(false); }}
              onClose={() => setShowAI(false)}
            /></Suspense>
          )}
          {showTaskPanel && (
            <Suspense fallback={null}><TaskPanel room={selectedRoom} currentUser={currentUser} socket={socket} onClose={() => setShowTaskPanel(false)} /></Suspense>
          )}
          {showSchedule && (
            <div className="modal-overlay" onClick={() => setShowSchedule(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">⏰ スケジュール送信</div>
                <textarea className="form-input" value={scheduleText} onChange={e => setScheduleText(e.target.value)}
                  placeholder="送信するメッセージ..." style={{ minHeight:80, resize:'vertical' }} />
                <label className="form-label" style={{ marginTop:8 }}>送信日時</label>
                <input type="datetime-local" className="form-input" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowSchedule(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={() => {
                    if (!scheduleText.trim() || !scheduleAt) return;
                    axios.post('/api/rooms/' + selectedRoom.id + '/schedule', { content: scheduleText.trim(), sendAt: scheduleAt })
                      .then(() => showToast?.('予約送信を設定したで！⏰', 'success'))
                      .catch(e => console.error(e));
                    setShowSchedule(false); setScheduleText(''); setScheduleAt('');
                  }}>予約する</button>
                </div>
              </div>
            </div>
          )}

          {/* 予約送信一覧 */}
          {showScheduleList && (
            <div className="modal-overlay" onClick={() => setShowScheduleList(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflowY:'auto' }}>
                <div className="modal-title">⏰ 予約送信一覧</div>
                {scheduleList.length === 0
                  ? <div style={{ textAlign:'center', color:'var(--text2)', padding:20 }}>予約中のメッセージはないで</div>
                  : scheduleList.map(s => (
                    <div key={s.id} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:13, color:'var(--primary)', marginBottom:4 }}>
                        📅 {new Date(s.send_at || s.sendAt).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                      <div style={{ fontSize:14, color:'var(--text)' }}>{s.content}</div>
                      <button onClick={() => {
                        axios.delete('/api/schedules/' + s.id).then(() => {
                          setScheduleList(prev => prev.filter(x => x.id !== s.id));
                          showToast?.('予約を取り消したで', 'info');
                        }).catch(() => {});
                      }} style={{ marginTop:6, fontSize:12, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        🗑️ キャンセル
                      </button>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowScheduleList(false)}>閉じる</button>
              </div>
            </div>
          )}

          {/* チャットエクスポート */}
          {showExport && (
            <div className="modal-overlay" onClick={() => setShowExport(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">📤 チャットをエクスポート</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
                  このトークの内容をテキストファイルとしてダウンロードできるで。
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowExport(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={() => {
                    const lines = messages
                      .filter(m => !m.deleted)
                      .map(m => {
                        const time = new Date(m.createdAt || m.created_at).toLocaleString('ja-JP');
                        const type = m.type === 'image' ? '[画像]' : m.type === 'file' ? '[ファイル]' : m.type === 'stamp' ? '[スタンプ]' : m.content || '';
                        return `[${time}] ${m.senderName}: ${type}`;
                      });
                    const text = `=== ${selectedRoom.name} ===\nエクスポート日時: ${new Date().toLocaleString('ja-JP')}\n\n` + lines.join('\n');
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `${selectedRoom.name}_${new Date().toISOString().slice(0,10)}.txt`;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                    setShowExport(false);
                    showToast?.('エクスポート完了！', 'success');
                  }}>📥 ダウンロード</button>
                </div>
              </div>
            </div>
          )}

          {/* 通知設定モーダル */}
          {showNotifSettings && selectedRoom && (
            <div className="modal-overlay" onClick={() => setShowNotifSettings(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">🔔 通知設定</div>
                <div style={{ fontSize:14, color:'var(--text2)', marginBottom:16 }}>{selectedRoom.name} の通知設定</div>
                {[
                  { key: 'all', label: '🔔 全ての通知', desc: 'メッセージ受信時に通知' },
                  { key: 'mention', label: '📣 メンション通知のみ', desc: '@メンションされた時だけ通知' },
                  { key: 'mute', label: '🔕 通知オフ', desc: '通知を受け取らない' },
                ].map(opt => {
                  const current = notifSettings[selectedRoom.id] || 'all';
                  return (
                    <div key={opt.key} onClick={() => {
                      const updated = { ...notifSettings, [selectedRoom.id]: opt.key };
                      setNotifSettings(updated);
                      localStorage.setItem('notifSettings', JSON.stringify(updated));
                      if (opt.key === 'mute') {
                        setMutedRooms(prev => new Set([...prev, selectedRoom.id]));
                        axios.post('/api/rooms/' + selectedRoom.id + '/mute').catch(() => {});
                      } else if (current === 'mute') {
                        setMutedRooms(prev => { const n = new Set(prev); n.delete(selectedRoom.id); return n; });
                        axios.delete('/api/rooms/' + selectedRoom.id + '/mute').catch(() => {});
                      }
                    }} style={{
                      display:'flex', alignItems:'center', gap:12, padding:'14px 4px',
                      borderBottom:'1px solid var(--border)', cursor:'pointer'
                    }}>
                      <div style={{
                        width:22, height:22, borderRadius:'50%', border:'2px solid',
                        borderColor: current === opt.key ? 'var(--primary)' : 'var(--border)',
                        background: current === opt.key ? 'var(--primary)' : 'transparent',
                        flexShrink:0
                      }} />
                      <div>
                        <div style={{ fontWeight:600 }}>{opt.label}</div>
                        <div style={{ fontSize:12, color:'var(--text2)' }}>{opt.desc}</div>
                      </div>
                    </div>
                  );
                })}
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:16 }} onClick={() => setShowNotifSettings(false)}>完了</button>
              </div>
            </div>
          )}

          {showPollCreator && (
            <div className="modal-overlay" onClick={() => setShowPollCreator(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">📊 投票を作成</div>
                <input className="form-input" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="質問を入力..." />
                <label className="form-label">選択肢</label>
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <input className="form-input" style={{ marginBottom:0, flex:1 }} value={opt}
                      onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                      placeholder={`選択肢 ${i + 1}`} />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                        style={{ color:'var(--danger)', padding:'0 8px', fontSize:18 }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setPollOptions([...pollOptions, ''])}
                  style={{ fontSize:13, color:'var(--primary)', padding:'4px 0', marginBottom:12 }}>＋ 選択肢を追加</button>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, marginBottom:12 }}>
                  <input type="checkbox" checked={pollMulti} onChange={e => setPollMulti(e.target.checked)} />
                  複数選択を許可
                </label>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowPollCreator(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={() => {
                    const opts = pollOptions.filter(o => o.trim());
                    if (!pollQuestion.trim() || opts.length < 2) return;
                    axios.post('/api/rooms/' + selectedRoom.id + '/polls', { question: pollQuestion.trim(), options: opts, multi: pollMulti })
                      .catch(e => console.error(e));
                    setShowPollCreator(false); setPollQuestion(''); setPollOptions(['', '']); setPollMulti(false);
                  }}>作成</button>
                </div>
              </div>
            </div>
          )}
          {/* 既読詳細モーダル */}
          {showReadDetail && (
            <div className="modal-overlay" onClick={() => setShowReadDetail(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">👁️ 既読メンバー</div>
                {showReadDetail.readers.length === 0
                  ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'16px 0', fontSize:14 }}>詳細情報を読み込み中...</div>
                  : showReadDetail.readers.filter(r => r.id !== currentUser.id).map(r => (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, overflow:'hidden', flexShrink:0 }}>
                        {r.avatar ? <img src={r.avatar.startsWith('http') ? r.avatar : `${process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com'}${r.avatar}`} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : r.name?.[0]}
                      </div>
                      <span style={{ fontSize:14 }}>{r.name}</span>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowReadDetail(null)}>閉じる</button>
              </div>
            </div>
          )}

          {/* ユーザープロフィールモーダル */}
          {showUserProfile && (
            <div className="modal-overlay" onClick={() => setShowUserProfile(null)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign:'center' }}>
                <div style={{ width:80, height:80, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, fontWeight:700, margin:'0 auto 12px', overflow:'hidden' }}>
                  {showUserProfile.avatar
                    ? <img src={showUserProfile.avatar.startsWith('http') ? showUserProfile.avatar : `${process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com'}${showUserProfile.avatar}`} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : showUserProfile.name?.[0]
                  }
                </div>
                <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>{showUserProfile.name}</div>
                {showUserProfile.status && <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16, fontStyle:'italic' }}>{showUserProfile.status}</div>}
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowUserProfile(null)}>閉じる</button>
              </div>
            </div>
          )}

          {/* グループメンバー管理モーダル */}
          {showMemberMgr && selectedRoom && (
            <div className="modal-overlay" onClick={() => setShowMemberMgr(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflow:'auto' }}>
                <div className="modal-title">👥 メンバー管理</div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{selectedRoom.members?.length}人</div>
                {selectedRoom.members?.map(mid => {
                  const friend = friendsList.find(f => (f.id || f._id) === mid);
                  const name = friend ? (friend.display_name || friend.username) : mid === currentUser.id ? (currentUser.displayName || currentUser.username) : '(不明なユーザー)';
                  const isCreator = mid === selectedRoom.creator_id;
                  const isMe = mid === currentUser.id;
                  const amCreator = currentUser.id === selectedRoom.creator_id;
                  return (
                    <div key={mid} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, flexShrink:0 }}>
                        {name?.[0] || '?'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight: isCreator ? 700 : 400 }}>{name}{isMe ? ' (自分)' : ''}</div>
                        {isCreator && <div style={{ fontSize:11, color:'var(--primary)' }}>👑 管理者</div>}
                      </div>
                      {(amCreator && !isMe && !isCreator) && (
                        <button onClick={() => {
                          appConfirm(`${name}をグループから削除しますか？`, () => {
                            axios.delete(`/api/rooms/${selectedRoom.id}/members/${mid}`).then(() => {
                              setSelectedRoom(prev => ({ ...prev, members: prev.members.filter(m => m !== mid) }));
                            }).catch(() => {});
                          })
                        }} style={{ fontSize:12, color:'var(--danger)', padding:'4px 10px', borderRadius:8, border:'1px solid var(--danger)', background:'none', cursor:'pointer' }}>
                          削除
                        </button>
                      )}
                      {isMe && !isCreator && (
                        <button onClick={() => {
                          appConfirm('グループを退出しますか？', () => {
                            axios.delete(`/api/rooms/${selectedRoom.id}/members/${currentUser.id}`).then(() => {
                              setSelectedRoom(null); setShowMemberMgr(false); fetchRooms();
                            }).catch(() => {});
                          });
                        }} style={{ fontSize:12, color:'var(--danger)', padding:'4px 10px', borderRadius:8, border:'1px solid var(--danger)', background:'none', cursor:'pointer' }}>
                          退出
                        </button>
                      )}
                    </div>
                  );
                })}
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowMemberMgr(false)}>閉じる</button>
              </div>
            </div>
          )}

          {/* メディア一覧モーダル */}
          {showMediaList && (
            <div className="modal-overlay" onClick={() => setShowMediaList(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh' }}>
                <div className="modal-title">🖼️ 画像・動画</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, maxHeight:'65vh', overflowY:'auto' }}>
                  {messages.filter(m => m.type === 'image' && m.fileData?.url).length === 0
                    ? <div style={{ gridColumn:'1/-1', textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>画像・動画がまだないで</div>
                    : messages.filter(m => m.type === 'image' && m.fileData?.url).map(m => (
                      <div key={m.id} style={{ aspectRatio:'1', overflow:'hidden', borderRadius:8, cursor:'pointer' }}
                        onClick={() => window.open(m.fileData.url?.startsWith('http') ? m.fileData.url : `${SERVER_URL}${m.fileData.url}`, '_blank')}>
                        <img src={m.fileData.url?.startsWith('http') ? m.fileData.url : `${SERVER_URL}${m.fileData.url}`} alt="" loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowMediaList(false)}>閉じる</button>
              </div>
            </div>
          )}
          {showAnnounce && (
            <div className="modal-overlay" onClick={() => setShowAnnounce(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">📢 アナウンス</div>
                <textarea className="form-input" value={announceText} onChange={e => setAnnounceText(e.target.value)}
                  placeholder="グループ全員に伝えたいことを書いてな" style={{ minHeight:100, resize:'vertical' }} autoFocus />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowAnnounce(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!announceText.trim()) return;
                    try { await axios.post('/api/rooms/' + selectedRoom.id + '/announcement', { text: announceText }); }
                    catch (e) { console.error(e); }
                    setShowAnnounce(false); setAnnounceText('');
                  }}>送信</button>
                </div>
              </div>
            </div>
          )}
          {showBookmarks && (
            <div className="modal-overlay" onClick={() => setShowBookmarks(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflow:'auto' }}>
                <div className="modal-title">🔖 ブックマーク</div>
                {bookmarkedMsgs.length === 0
                  ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>ブックマークがまだないで</div>
                  : bookmarkedMsgs.map(msg => (
                    <div key={msg.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>{msg.senderName} · {new Date(msg.createdAt).toLocaleDateString('ja-JP')}</div>
                      <div style={{ fontSize:14 }}>{msg.content}</div>
                      <button style={{ fontSize:11, color:'var(--danger)', marginTop:4, background:'none', border:'none', cursor:'pointer', padding:0 }} onClick={() => {
                        axios.delete('/api/bookmarks/' + msg.id);
                        setBookmarks(prev => { const n = new Set(prev); n.delete(msg.id); return n; });
                        setBookmarkedMsgs(prev => prev.filter(m => m.id !== msg.id));
                      }}>削除</button>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowBookmarks(false)}>閉じる</button>
              </div>
            </div>
          )}
          {showBgPicker && (
            <div className="modal-overlay" onClick={() => setShowBgPicker(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">🎨 背景を変更</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                  {[{id:"default",label:"デフォルト",color:"#efeff4"},{id:"#ffffff",label:"白",color:"#ffffff"},{id:"#1a1a2e",label:"深夜",color:"#1a1a2e"},{id:"#fef3e2",label:"温かみ",color:"#fef3e2"},{id:"#e8f5e9",label:"グリーン",color:"#e8f5e9"},{id:"#e3f2fd",label:"スカイ",color:"#e3f2fd"},{id:"#f3e5f5",label:"ラベンダー",color:"#f3e5f5"},{id:"#fff8e1",label:"サンシャイン",color:"#fff8e1"}].map(bg => (
                    <div key={bg.id} onClick={() => { setChatBg(bg.id); localStorage.setItem('chatBg', bg.id); }}
                      style={{
                        height:64, borderRadius:12, background:bg.color, cursor:'pointer',
                        border: chatBg === bg.id ? '3px solid var(--primary)' : '2px solid var(--border)',
                        display:'flex', alignItems:'flex-end', justifyContent:'center', padding:4,
                        fontSize:11, color:'#333', fontWeight:600, boxSizing:'border-box',
                      }}>{bg.label}</div>
                  ))}
                </div>
                <button className="btn btn-secondary" style={{width:'100%'}} onClick={() => setShowBgPicker(false)}>閉じる</button>
              </div>
            </div>
          )}
          {editingMessage && (
            <div className="modal-overlay" onClick={() => setEditingMessage(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">✏️ メッセージを編集</div>
                <textarea className="form-input" value={editText} onChange={e => setEditText(e.target.value)}
                  style={{ minHeight:80, resize:'vertical' }} autoFocus />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setEditingMessage(null)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={() => {
                    if (editText.trim()) {
                      socket.emit('message:edit', { roomId: selectedRoom.id, messageId: editingMessage.id, content: editText.trim() });
                      setEditingMessage(null);
                    }
                  }}>保存</button>
                </div>
              </div>
            </div>
          )}
          {forwardMsg && (
            <div className="modal-overlay" onClick={() => setForwardMsg(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">📤 転送先を選択</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8, padding:'0 4px',
                  background:'var(--surface2)', borderRadius:8 }}>
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
            <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.3)' }} onClick={() => setReactionPicker(null)}>
              <div style={{
                position:'fixed',
                left:'50%', transform:'translateX(-50%)',
                bottom:'calc(env(safe-area-inset-bottom) + 80px)',
                background:'var(--surface)', borderRadius:32, padding:'10px 14px',
                boxShadow:'0 4px 24px rgba(0,0,0,0.25)', display:'flex', gap:4, zIndex:3001,
                animation:'popIn 0.18s ease'
              }} onClick={(e) => e.stopPropagation()}>
                {['❤️','👍','😂','😮','😢','🔥','👏','🎉'].map(emoji => (
                  <button key={emoji} onClick={() => {
                    socket.emit('message:react', { messageId: reactionPicker.msgId, roomId: selectedRoom.id, emoji });
                    setReactionPicker(null);
                  }} style={{ fontSize:26, background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:10, WebkitTapHighlightColor:'transparent', transition:'transform 0.1s' }}
                    onMouseEnter={e => e.target.style.transform='scale(1.3)'}
                    onMouseLeave={e => e.target.style.transform='scale(1)'}
                  >{emoji}</button>
                ))}
              </div>
            </div>
          )}
          {showSearch && (
            <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:2000, display:'flex', flexDirection:'column' }}>
              <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
                  <button onClick={() => { setShowSearch(false); setSearchSender(''); setSearchDate(''); }} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setSearchQuery(q);
                      if (!q.trim() && !searchSender && !searchDate) { setSearchResults([]); return; }
                      setSearchLoading(true);
                      try {
                        const params = new URLSearchParams();
                        if (q.trim()) params.set('q', q);
                        if (searchSender) params.set('sender', searchSender);
                        if (searchDate) params.set('date', searchDate);
                        const res = await axios.get(`/api/rooms/${selectedRoom.id}/search?${params}`);
                        setSearchResults(res.data);
                      } catch {}
                      finally { setSearchLoading(false); }
                    }}
                    placeholder="メッセージを検索..."
                    style={{ flex:1, padding:'8px 12px', borderRadius:20, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:15, outline:'none' }}
                  />
                </div>
                {/* フィルター */}
                <div style={{ display:'flex', gap:8, padding:'0 12px 10px', overflowX:'auto' }}>
                  <input
                    value={searchSender}
                    onChange={e => setSearchSender(e.target.value)}
                    placeholder="👤 送信者名"
                    style={{ padding:'6px 10px', borderRadius:16, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, outline:'none', minWidth:100 }}
                  />
                  <input
                    type="date"
                    value={searchDate}
                    onChange={e => setSearchDate(e.target.value)}
                    style={{ padding:'6px 10px', borderRadius:16, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, outline:'none' }}
                  />
                  <button onClick={async () => {
                    if (!searchQuery.trim() && !searchSender && !searchDate) return;
                    setSearchLoading(true);
                    try {
                      const params = new URLSearchParams();
                      if (searchQuery.trim()) params.set('q', searchQuery);
                      if (searchSender) params.set('sender', searchSender);
                      if (searchDate) params.set('date', searchDate);
                      const res = await axios.get(`/api/rooms/${selectedRoom.id}/search?${params}`);
                      setSearchResults(res.data);
                    } catch {}
                    finally { setSearchLoading(false); }
                  }} style={{ padding:'6px 14px', borderRadius:16, background:'var(--primary)', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                    検索
                  </button>
                </div>
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
          <div className="messages-container"
            onScroll={(e) => {
              const el = e.currentTarget;
              isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              // 上端近くで過去メッセージ読み込み
              if (el.scrollTop < 60) loadMoreMessages();
            }}
            style={chatBg !== 'default' ? {
              backgroundImage: chatBg.startsWith('#') ? 'none' : `url(${chatBg})`,
              backgroundColor: chatBg.startsWith('#') ? chatBg : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
            } : {}}>
            {messages.reduce((acc, msg, i) => {
              const d = new Date(msg.createdAt);
              const dateStr = d.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
              const prevMsg = messages[i - 1];
              const prevDate = prevMsg ? new Date(prevMsg.createdAt).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }) : null;
              if (!prevDate || prevDate !== d.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })) {
                acc.push(<div key={`date-${i}`} className="date-divider">{dateStr}</div>);
              }
              acc.push(renderMessage(msg, i));
              return acc;
            }, [])}
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                <span className="typing-dots"><span/><span/><span/></span>
                <span style={{ marginLeft:6 }}>{typingUsers.join(', ')} が入力中</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">
            {/* @メンション候補 */}
            {mentionSuggestions.length > 0 && (
              <div style={{
                position:'absolute', bottom:'100%', left:0, right:0, background:'var(--surface)',
                border:'1px solid var(--border)', borderRadius:'12px 12px 0 0', boxShadow:'0 -4px 16px rgba(0,0,0,0.12)',
                zIndex:200, overflow:'hidden', marginBottom:2
              }}>
                {mentionSuggestions.map(m => (
                  <button key={m.id} onClick={() => handleMentionSelect(m)} style={{
                    display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 16px',
                    background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer',
                    fontSize:14, color:'var(--text)', WebkitTapHighlightColor:'transparent'
                  }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 }}>
                      {(m.displayName || m.username || '?')[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight:600 }}>{m.displayName || m.username}</div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>@{m.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
            {/* 音声メッセージ */}
            {showVoice && <VoiceMessage roomId={selectedRoom.id} currentUser={currentUser} socket={socket} onSent={() => setShowVoice(false)} onCancel={() => setShowVoice(false)} />}
            {/* 位置情報 */}
            {showLocation && <LocationShare socket={socket} roomId={selectedRoom.id} currentUser={currentUser} onSent={() => setShowLocation(false)} onCancel={() => setShowLocation(false)} />}
            {/* 秘密メッセージ */}
            {showSecret && <Suspense fallback={null}><SecretMessage socket={socket} roomId={selectedRoom.id} currentUser={currentUser} onSent={() => setShowSecret(false)} onCancel={() => setShowSecret(false)} /></Suspense>}
            {/* 文字スタイルパネル */}
            {showStylePicker && (
              <div style={{ padding:'10px 12px', background:'var(--surface2)', borderTop:'1px solid var(--border)', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--text2)', fontWeight:600 }}>フォント:</span>
                {[['default','デフォルト'],['serif','明朝体'],['monospace','等幅'],['cursive','手書き']].map(([f,label]) => (
                  <button key={f} onClick={() => { const s={...msgStyle,font:f}; setMsgStyle(s); localStorage.setItem('msgStyle',JSON.stringify(s)); }}
                    style={{ padding:'4px 10px', borderRadius:10, border:'1.5px solid', borderColor: msgStyle.font===f?'var(--primary)':'var(--border)', background: msgStyle.font===f?'var(--primary)':'transparent', color: msgStyle.font===f?'white':'var(--text)', fontSize:13, cursor:'pointer', fontFamily:f==='default'?undefined:f }}>{label}</button>
                ))}
                <span style={{ fontSize:12, color:'var(--text2)', fontWeight:600, marginLeft:8 }}>言語:</span>
                {[['ja','🇯🇵'],['en','🇺🇸'],['zh','🇨🇳'],['ko','🇰🇷']].map(([l,flag]) => (
                  <button key={l} onClick={() => { setLang(l); localStorage.setItem('lang',l); }}
                    style={{ padding:'4px 10px', borderRadius:10, border:'1.5px solid', borderColor: lang===l?'var(--primary)':'var(--border)', background: lang===l?'var(--primary)':'transparent', color: lang===l?'white':'var(--text)', fontSize:14, cursor:'pointer' }}>{flag}</button>
                ))}
              </div>
            )}
            <div className="input-row">
              <button className="plus-btn icon-btn" onClick={() => setShowInputMenu(v=>!v)} title="その他">
                {showInputMenu ? '✕' : '➕'}
              </button>
              <button className="icon-btn" onClick={() => setShowStampPanel(!showStampPanel)} title="スタンプ">🎫</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,video/*,audio/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleFileUpload} />
              <textarea className="message-input" value={inputText} onChange={handleTyping}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder={lang === "en" ? "Type a message..." : lang === "zh" ? "输入消息..." : lang === "ko" ? "메시지 입력..." : "メッセージを入力..."} rows={1} />
              <button className="send-btn" onClick={handleSend} disabled={!inputText.trim()}>➤</button>
            </div>
            {showInputMenu && (
              <div style={{
                position:'fixed', left:0, right:0,
                bottom: 'calc(env(safe-area-inset-bottom) + 56px)',
                zIndex:300, background:'var(--surface)',
                borderTop:'1px solid var(--border)',
                display:'grid', gridTemplateColumns:'repeat(4,1fr)',
                boxShadow:'0 -4px 16px rgba(0,0,0,0.12)',
                animation:'menuSlideUp 0.2s ease',
              }}>
                {[
                  { icon:'📎', label:'ファイル', action: () => { fileInputRef.current?.click(); setShowInputMenu(false); } },
                  { icon:'🎤', label:'音声', action: () => { setShowVoice(v=>!v); setShowInputMenu(false); } },
                  { icon:'📍', label:'位置情報', action: () => { setShowLocation(v=>!v); setShowInputMenu(false); } },
                  { icon:'🔐', label:'秘密', action: () => { setShowSecret(v=>!v); setShowInputMenu(false); } },
                  { icon:'📊', label:'投票', action: () => { setShowPollCreator(true); setShowInputMenu(false); } },
                  { icon:'⏰', label:'予約送信', action: () => { setScheduleText(inputText); setShowSchedule(true); setShowInputMenu(false); } },
                  { icon:'🎨', label:'文字スタイル', action: () => { setShowStylePicker(v=>!v); setShowInputMenu(false); } },
                ].map(item => (
                  <button key={item.label} className="input-menu-item" onClick={item.action}>
                    <span className="input-menu-icon">{item.icon}</span>
                    <span className="input-menu-label">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>}
        {!selectedRoom && <div className="no-room-selected"><div>💬</div><p>トークを選択してください</p></div>}
      </div>

      {showStats && selectedRoom && (
        <Suspense fallback={null}>
          <ChatStats roomId={selectedRoom.id} roomName={selectedRoom.name} onClose={() => setShowStats(false)} />
        </Suspense>
      )}
      {showCreateRoom && (
        <ErrorBoundary><Suspense fallback={null}><CreateRoom currentUser={currentUser} friendsList={friendsList} onClose={() => setShowCreateRoom(false)}
          onCreated={(room) => { setRooms((prev) => [room, ...prev]); setSelectedRoom(room); setShowCreateRoom(false); }} /></Suspense></ErrorBoundary>
      )}
    </div>
  );
}

function TabBar({ activeTab, setActiveTab, notifications }) {
  const tabs = [
    { id: 'chat', label: 'トーク', icon: '💬' },
    { id: 'friends', label: '友達', icon: '👥' },
    { id: 'timeline', label: 'お知らせ', icon: '📢' },
    { id: 'stampshop', label: 'ショップ', icon: '🎫' },
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

  // axiosインターセプター: 401のとき自動ログアウト
  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401 && currentUser) {
          localStorage.removeItem('token');
          setCurrentUser(null);
          setSocket(s => { s?.disconnect(); return null; });
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [currentUser]);
  const [notifications, setNotifications] = useState({ friends: 0 });
  const [toast, setToast] = useState(null);
  const [allStampSets, setAllStampSets] = useState([]);
  const [acquiredStampIds, setAcquiredStampIds] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [bookmarks, setBookmarks] = useState(new Set());
  const [mutedRooms, setMutedRooms] = useState(new Set());
  const [activeCall, setActiveCall] = useState(null); // { roomId, targetUserId, isCaller, offer }
  const [callMinimized, setCallMinimized] = useState(false);
  const [showSubAccounts, setShowSubAccounts] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [voiceCall, setVoiceCall] = useState(null); // { targetUser, isIncoming, callId, roomId }
  const [showGift, setShowGift] = useState(null);
  const [showReadLater, setShowReadLater] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinVerified, setPinVerified] = useState(true);
  const [, setMentions] = useState([]);  // メンション通知リスト（未読バッジ用）
  const [groupCall, setGroupCall] = useState(null); // { roomId, members, roomName }
  const [darkAutoMode, setDarkAutoMode] = useState(() => localStorage.getItem('darkAutoMode') === 'true');

  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
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
    // ミュート・ブックマーク初期化
    axios.get('/api/auth/me').then(res => {
      if (res.data.user.mutedRooms) setMutedRooms(new Set(res.data.user.mutedRooms));
      if (res.data.user.bookmarks) setBookmarks(new Set(res.data.user.bookmarks));
    }).catch(() => {});
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
    // message:edited / message:deleted はChatScreen内のuseEffectで処理
    s.on('user:online', ({ userId }) => setOnlineUsers(prev => new Set([...prev, userId])));
    s.on('user:offline', ({ userId }) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(userId); return n; }));
    // 初回接続時にオンラインユーザー一覧を取得
    axios.get('/api/users/online').then(r => setOnlineUsers(new Set(r.data))).catch(() => {});
    s.on('call:incoming', (data) => {
      setIncomingCall(data);
    });
    // 音声通話着信
    s.on('voice:incoming', (data) => {
      // { from: {id, username, avatar}, offer, callId, roomId }
      window.__voiceOffer = data.offer;
      setVoiceCall({
        targetUser: { id: data.from.id, displayName: data.from.username, avatar: data.from.avatar },
        isIncoming: true,
        callId: data.callId,
        roomId: data.roomId,
      });
    });
    // メンション通知
    s.on('mention:new', (data) => {
      setMentions(prev => [data, ...prev].slice(0, 20));
      showToast(`@メンション: ${data.from}さんから`, 'info');
    });
    // ギフト受信通知
    s.on('gift:received', (data) => {
      showToast(`🎁 ${data.from}さんから ${data.stamp} ${data.amount}コインもらった！`, 'success');
    });
    setSocket(s);
    return () => s.disconnect();
  }, [currentUser, showToast]);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // システムダークモード連動
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => { if (darkAutoMode) { document.body.classList.toggle('dark', e.matches); } };
    mq.addEventListener('change', handler);
    if (darkAutoMode) document.body.classList.toggle('dark', mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [darkAutoMode]);


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

  // iOS Safari: キーボード表示時に画面が押し上げられるよう対応
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      document.documentElement.style.setProperty('--keyboard-offset', `${Math.max(0, offset)}px`);
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => { vv.removeEventListener('resize', handler); vv.removeEventListener('scroll', handler); };
  }, []);

  const handleLogin = async (user) => {
    setCurrentUser(user);
    // PINが設定されてたら確認画面（pin_enabled / pinEnabled 両対応）
    if (user.pin_enabled || user.pinEnabled) setPinVerified(false);
    else setPinVerified(true);
  };


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

  // ChatScreenは常にマウントし続けてdisplay:noneで隠す（アンマウントするとselectedRoomが消えるため）
  const tabVisible = (id) => ({ display: activeTab === id ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 });
  const renderTabs = () => (
    <>
      {/* 全タブ常時マウント（タブ切替でstateリセットされないように） */}
      <div style={tabVisible('chat')}>
        <ChatScreen socket={socket} currentUser={currentUser} allStampSets={allStampSets} acquiredStampIds={acquiredStampIds} friendsList={friendsList} onCall={setActiveCall} setGroupCall={setGroupCall} onlineUsers={onlineUsers} bookmarks={bookmarks} setBookmarks={setBookmarks} mutedRooms={mutedRooms} setMutedRooms={setMutedRooms} soundTheme={currentUser?.soundTheme || 'default'} setShowSubAccounts={setShowSubAccounts} setVoiceCall={setVoiceCall} showToast={showToast} setShowGift={setShowGift} />
      </div>
      <div style={tabVisible('friends')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Friends
            currentUser={currentUser}
            socket={socket}
            onClearNotif={() => setNotifications((p) => ({ ...p, friends: 0 }))}
            onStartChat={async (friend) => {
              try {
                await axios.post('/api/rooms/dm', { targetUserId: friend.id || friend._id });
                setActiveTab('chat');
              } catch (e) { console.error('DM失敗', e); }
            }}
          />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('timeline')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Timeline currentUser={currentUser} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('stampshop')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <StampShop currentUser={currentUser} acquiredStampIds={acquiredStampIds} onAcquire={(id) => setAcquiredStampIds(prev => [...prev, id])} />
        </Suspense></ErrorBoundary>
      </div>
      {activeTab === 'dashboard' && (
        <div style={tabVisible('dashboard')}>
          <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
            <Dashboard currentUser={currentUser} onNavigateRoom={() => setActiveTab('chat')} />
          </Suspense></ErrorBoundary>
        </div>
      )}
      {activeTab === 'album' && (
        <div style={tabVisible('album')}>
          <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
            <Album currentUser={currentUser} />
          </Suspense></ErrorBoundary>
        </div>
      )}
      {activeTab === 'profile' && (
        <div style={tabVisible('profile')}>
          <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
            <Profile currentUser={currentUser} onUpdate={(u) => setCurrentUser(u)} onLogout={handleLogout} onContact={() => setShowContact(true)}
              darkMode={darkMode} onToggleDark={() => { setDarkAutoMode(false); localStorage.setItem('darkAutoMode','false'); setDarkMode(!darkMode); }}
              darkAutoMode={darkAutoMode} onToggleAuto={() => { const v = !darkAutoMode; setDarkAutoMode(v); localStorage.setItem('darkAutoMode', v); if (v) setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches); }}
              onOpenPinSetup={() => setShowPinSetup(true)}
              onSwitchAccount={(token, user) => { localStorage.setItem('token', token); axios.defaults.headers.common['Authorization'] = `Bearer ${token}`; setCurrentUser(user); window.location.reload(); }} />
          </Suspense></ErrorBoundary>
        </div>
      )}
    </>
  );

  return (
    <Router>
      <div className={`app ${darkMode ? 'dark' : ''}`}>
{/* LINEはタブごとにヘッダーを持つためグローバルヘッダーは非表示 */}
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
        {groupCall && (
          <GroupVideoCall
            socket={socket}
            currentUser={currentUser}
            roomId={groupCall.roomId}
            members={groupCall.members}
            roomName={groupCall.roomName}
            onEnd={() => { setGroupCall(null); setCallMinimized(false); }}
            minimized={callMinimized}
            onToggleMinimize={() => setCallMinimized(m => !m)}
          />
        )}
        {activeCall && (
          <VideoCall
            currentUser={currentUser}
            socket={socket}
            roomId={activeCall.roomId}
            targetUserId={activeCall.targetUserId}
            isCaller={activeCall.isCaller}
            incomingOffer={activeCall.offer}
            onEnd={() => { setActiveCall(null); setCallMinimized(false); }}
            minimized={callMinimized}
            onToggleMinimize={() => setCallMinimized(m => !m)}
          />
        )}
        {/* サブアカウント切り替え */}
        {showSubAccounts && (
          <Suspense fallback={null}>
            <SubAccounts
              currentUser={currentUser}
              onSwitch={(user) => {
                setCurrentUser(user);
                setShowSubAccounts(false);
                setTimeout(() => window.location.reload(), 100);
              }}
              onClose={() => setShowSubAccounts(false)}
            />
          </Suspense>
        )}

        {/* PIN認証（未確認の場合） */}
        {currentUser && !pinVerified && (
          <Suspense fallback={null}>
            <PinVerify
              onSuccess={() => setPinVerified(true)}
              onCancel={() => { setCurrentUser(null); setPinVerified(false); }}
            />
          </Suspense>
        )}

        {/* PIN設定 */}
        {showPinSetup && (
          <Suspense fallback={null}>
            <PinSetup enabled={!!currentUser?.pinEnabled} onClose={() => setShowPinSetup(false)} />
          </Suspense>
        )}

        {/* ギフト送信 */}
        {showGift && (
          <Suspense fallback={null}>
            <GiftModal
              targetUser={showGift}
              currentUser={currentUser}
              onClose={() => setShowGift(null)}
            />
          </Suspense>
        )}

        {/* 後で読む */}
        {showReadLater && (
          <Suspense fallback={null}>
            <ReadLater currentUser={currentUser} onClose={() => setShowReadLater(false)} />
          </Suspense>
        )}

        {/* お問い合わせ */}
        {showContact && (
          <Suspense fallback={null}>
            <ContactForm currentUser={currentUser} onClose={() => setShowContact(false)} />
          </Suspense>
        )}

        {/* 音声通話 */}}
        {voiceCall && (
          <Suspense fallback={null}>
            <VoiceCall
              socket={socket}
              currentUser={currentUser}
              targetUser={voiceCall.targetUser}
              roomId={voiceCall.roomId}
              isIncoming={voiceCall.isIncoming}
              callId={voiceCall.callId}
              onClose={() => setVoiceCall(null)}
            />
          </Suspense>
        )}

        {incomingCall && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
            <div className="incoming-call-modal">
              {/* 発信者アバター */}
              <div style={{ width:80, height:80, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, fontWeight:700, border:'3px solid rgba(255,255,255,0.3)' }}>
                {incomingCall.fromName?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:4, letterSpacing:1 }}>ビデオ通話</div>
              <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{incomingCall.fromName}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:32 }}>着信中…</div>
              <div style={{ display:'flex', gap:32, justifyContent:'center', alignItems:'center' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                  <button onClick={handleRejectCall} style={{ width:68, height:68, borderRadius:'50%', background:'#e74c3c', fontSize:28, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(231,76,60,0.5)' }}>📵</button>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>拒否</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                  <button onClick={handleAcceptCall} style={{ width:68, height:68, borderRadius:'50%', background:'#06c755', fontSize:28, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(6,199,85,0.5)', animation:'pulse 1.5s infinite' }}>📞</button>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>応答</span>
                </div>
              </div>
            </div>
            <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }`}</style>
          </div>
        )}
      </div>
    </Router>
  );
}
