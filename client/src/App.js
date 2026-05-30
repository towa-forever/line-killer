/* eslint-disable */
import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import { compressImage } from './utils/imageCompress';
import Portal from './components/Portal';
import { sounds, startRingtone, stopRingtone } from './utils/sounds';
import VoiceMessage, { VoiceMessageBubble } from './components/VoiceMessage';
import LocationShare, { LocationBubble } from './components/LocationShare';
import { SecretBubble } from './components/SecretMessage';
import { StoryBar } from './components/Story';
import './App.css';
import './i18n/i18n';
import { useTranslation, I18nextProvider } from 'react-i18next';
import i18n, { SUPPORTED_LANGS } from './i18n/i18n';

// 遅延読み込み（初回ロード高速化）
import ErrorBoundary from './components/ErrorBoundary';
const Friends = lazy(() => import('./components/Friends'));
const Timeline = lazy(() => import('./components/Timeline'));
const Voom = lazy(() => import('./components/Voom'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const StampShop = lazy(() => import('./components/StampShop'));
const Album = lazy(() => import('./components/Album'));
const VideoCall = lazy(() => import('./components/VideoCall'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const EventCalendar = lazy(() => import('./components/EventCalendar'));
const MiniGame = lazy(() => import('./components/MiniGame'));
const VoiceCall = lazy(() => import('./components/VoiceCall'));
const SubAccounts = lazy(() => import('./components/SubAccounts'));
const ContactForm     = lazy(() => import('./components/ContactForm'));
// PasswordReset は AuthScreen 内で inline lazy import
const GiftModal       = lazy(() => import('./components/GiftModal'));
const SharedWhiteboard = lazy(() => import('./components/SharedWhiteboard'));
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
const UserProfile = lazy(() => import('./components/UserProfile'));

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
axios.defaults.baseURL = SERVER_URL; // 同一サーバーなので相対パスでOK
// アプリ起動時に即座にトークンをセット
const _token = localStorage.getItem('token');
if (_token) axios.defaults.headers.common['Authorization'] = `Bearer ${_token}`;


// ===== システム通知バナー =====
function SystemNoticeBanner({ currentUser, showToast }) {
  const [notices, setNotices] = useState([]);
  const [realNameInput, setRealNameInput] = useState('');
  const [realNameLoading, setRealNameLoading] = useState(false);
  const [activeNotice, setActiveNotice] = useState(null);

  useEffect(() => {
    axios.get('/api/system-notices').then(r => {
      setNotices(r.data);
      if (r.data.length > 0) setActiveNotice(r.data[0]);
    }).catch(() => {});
  }, []);

  // ソケットでリアルタイム受信
  useEffect(() => {
    const handler = (notice) => {
      setNotices(prev => [notice, ...prev.filter(n => n.id !== notice.id)]);
      setActiveNotice(notice);
    };
    window.__wc_socket__?.on('system:notice', handler);
    return () => window.__wc_socket__?.off('system:notice', handler);
  }, []);

  const dismiss = async (id) => {
    await axios.post(`/api/system-notices/${id}/dismiss`).catch(() => {});
    setNotices(prev => prev.filter(n => n.id !== id));
    setActiveNotice(prev => prev?.id === id ? null : prev);
  };

  const submitRealName = async (noticeId) => {
    if (!realNameInput.trim()) return;
    setRealNameLoading(true);
    try {
      await axios.post('/api/users/me/real-name', { real_name: realNameInput.trim() });
      showToast?.('本名を登録したで！ありがとう🎉', 'success');
      dismiss(noticeId);
    } catch(e) {
      showToast?.(e.response?.data?.error || '送信エラー', 'error');
    } finally { setRealNameLoading(false); }
  };

  if (!activeNotice) return null;

  const n = activeNotice;
  const isRealName = n.action_type === 'real_name';
  const isSurvey = n.type === 'survey';

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, zIndex:9000,
      background: isSurvey ? 'linear-gradient(135deg,#5856d6,#7c3aed)' : 'linear-gradient(135deg,#06c755,#03a040)',
      color:'white', padding:'12px 16px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.2)',
      animation:'slideDown 0.3s ease',
    }}>
      <style>{`@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
      <div style={{ maxWidth:600, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>{n.title}</div>
            {n.content && <div style={{ fontSize:13, opacity:0.9, lineHeight:1.5 }}>{n.content}</div>}

            {/* 本名入力フォーム */}
            {isRealName && (
              <div style={{ marginTop:10, display:'flex', gap:8 }}>
                <input
                  value={realNameInput}
                  onChange={e => setRealNameInput(e.target.value)}
                  placeholder="例：山田 太郎"
                  style={{
                    flex:1, padding:'8px 12px', borderRadius:10, border:'none',
                    fontSize:14, outline:'none', color:'#1c1c1e',
                  }}
                  onKeyDown={e => e.key === 'Enter' && submitRealName(n.id)}
                />
                <button onClick={() => submitRealName(n.id)} disabled={realNameLoading}
                  style={{
                    padding:'8px 16px', background:'white', color:'#5856d6',
                    border:'none', borderRadius:10, fontWeight:700, fontSize:13,
                    cursor:'pointer', flexShrink:0,
                  }}>
                  {realNameLoading ? '送信中...' : '送信'}
                </button>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {isRealName && (
              <button onClick={() => dismiss(n.id)}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white',
                  borderRadius:8, padding:'4px 10px', fontSize:12, cursor:'pointer' }}>
                あとで
              </button>
            )}
            <button onClick={() => dismiss(n.id)}
              style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white',
                borderRadius:8, padding:'4px 8px', fontSize:16, cursor:'pointer', lineHeight:1 }}>
              ✕
            </button>
          </div>
        </div>
        {notices.length > 1 && (
          <div style={{ marginTop:6, fontSize:11, opacity:0.7 }}>
            他に{notices.length - 1}件のお知らせあるで →
            <button onClick={() => {
              const idx = notices.findIndex(n2 => n2.id === n.id);
              setActiveNotice(notices[(idx + 1) % notices.length]);
            }} style={{ background:'none', border:'none', color:'white', cursor:'pointer', fontSize:11, textDecoration:'underline' }}>
              次を見る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== オンボーディング用 WakkaLogo SVG =====
function WakkaLogo({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ borderRadius: 16, display:'block' }}>
      <rect width="80" height="80" rx="20" fill="#06c755"/>
      <circle cx="40" cy="38" r="22" fill="none" stroke="white" strokeWidth="6" opacity="0.3"/>
      <rect x="22" y="26" width="36" height="22" rx="10" fill="white"/>
      <path d="M28 48 L24 56 L36 50" fill="white"/>
      <circle cx="32" cy="37" r="2.5" fill="#06c755"/>
      <circle cx="40" cy="37" r="2.5" fill="#06c755"/>
      <circle cx="48" cy="37" r="2.5" fill="#06c755"/>
    </svg>
  );
}

// ===== スプラッシュ画面 =====
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="splash-screen">
      <div className="splash-logo">
        <WakkaLogo size={88} />
        <h1 className="splash-title">WakkaChat</h1>
        <p className="splash-sub">世界をつなぐチャットアプリ</p>
      </div>
      <div className="splash-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ===== ウェルカムスライド =====
function WelcomeSlides({ onDone }) {
  const { t } = useTranslation();
  const WELCOME_SLIDES = [
    { emoji: '💬', title: t('slides.slide1_title'), desc: t('slides.slide1_desc'), color: '#06c755' },
    { emoji: '🤖', title: t('slides.slide2_title'), desc: t('slides.slide2_desc'), color: '#5856d6' },
    { emoji: '🌍', title: t('slides.slide3_title'), desc: t('slides.slide3_desc'), color: '#ff9500' },
  ];
  const [slide, setSlide] = useState(0);
  const [exiting, setExiting] = useState(false);

  const goNext = () => {
    if (slide < WELCOME_SLIDES.length - 1) {
      setExiting(true);
      setTimeout(() => { setSlide(s => s + 1); setExiting(false); }, 220);
    } else {
      onDone();
    }
  };
  const skip = () => onDone();
  const s = WELCOME_SLIDES[slide];

  return (
    <div className="welcome-screen" style={{ '--slide-color': s.color }}>
      <button className="welcome-skip" onClick={skip}>{t('auth.skip')}</button>
      <div className={`welcome-slide ${exiting ? 'slide-exit' : 'slide-enter'}`}>
        <div className="welcome-emoji">{s.emoji}</div>
        <h2 className="welcome-title">{s.title}</h2>
        <p className="welcome-desc">{s.desc}</p>
      </div>
      <div className="welcome-dots">
        {WELCOME_SLIDES.map((_, i) => (
          <span key={i} className={`welcome-dot ${i === slide ? 'active' : ''}`}
            onClick={() => { setExiting(true); setTimeout(() => { setSlide(i); setExiting(false); }, 220); }} />
        ))}
      </div>
      <button className="welcome-next" onClick={goNext}
        style={{ background: s.color }}>
        {slide < WELCOME_SLIDES.length - 1 ? t('auth.next') : t('auth.start')}
      </button>
    </div>
  );
}

// ===== 新規登録ステップフロー =====
function RegisterFlow({ onDone, onBack }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1:名前 2:本名 3:ID 4:パスワード 5:アイコン
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [avatar, setAvatar] = useState(null); // base64
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const TOTAL = 5;
  const progress = (step / TOTAL) * 100;

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatar(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      // STEP1: 名前
      if (!displayName.trim()) { setError(t('errors.name_required')); return; }
      setStep(2);
    } else if (step === 2) {
      // STEP2: 本名（任意なのでバリデーションなし）
      setStep(3);
    } else if (step === 3) {
      // STEP3: ID
      if (!username.trim()) { setError(t('errors.id_required')); return; }
      if (/[\s\x00-\x1f]/.test(username.trim())) { setError(t('errors.id_no_space')); return; } // eslint-disable-line no-control-regex
      setStep(4);
    } else if (step === 4) {
      // STEP4: パスワード
      if (!password) { setError(t('errors.password_required')); return; }
      if (password.length < 6) { setError(t('errors.password_short')); return; }
      setStep(5);
    } else {
      // STEP5: アイコン → 登録実行
      handleRegister();
    }
  };

  const handleRegister = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.post('/api/auth/register', {
        username: username.trim(),
        password,
        displayName: displayName.trim(),
        avatar,
        realName: realName.trim() || null,
      });
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onDone(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || '接続エラー');
      setStep(2); // IDが重複してたらIDに戻す
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* 戻るボタン */}
        <button onClick={step === 1 ? onBack : () => { setError(''); setStep(s => s - 1); }}
          className="onboard-back-btn">← 戻る</button>

        {/* プログレスバー */}
        <div className="onboard-progress-bar">
          <div className="onboard-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="onboard-step-label">{t('auth.step_label', { current: step, total: TOTAL })}</div>

        {/* WakkaChat ロゴ */}
        <div className="auth-logo" style={{ marginBottom: 20 }}>
          <WakkaLogo size={48} />
          <h1>WakkaChat</h1>
        </div>

        {/* STEP 1: 名前 */}
        {step === 1 && (
          <div className="onboard-step">
            <p className="onboard-question">{t('onboarding.step1_q')}</p>
            <input className="auth-input" type="text" placeholder={t("onboarding.step1_placeholder")}
              value={displayName} onChange={e => setDisplayName(e.target.value)}
              autoFocus maxLength={30}
              onKeyDown={e => e.key === 'Enter' && handleNext()} />
            <p className="onboard-hint">{t('onboarding.step1_hint')}</p>
          </div>
        )}

        {/* STEP 2: 本名（任意）*/}
        {step === 2 && (
          <div className="onboard-step">
            <p className="onboard-question">本名を教えてください 📝</p>
            <input className="auth-input" type="text" placeholder="例：山田 太郎"
              value={realName} onChange={e => setRealName(e.target.value)}
              autoFocus maxLength={50}
              onKeyDown={e => e.key === 'Enter' && handleNext()} />
            <p className="onboard-hint">任意項目です。入力しなくてもOKやで（あとで設定可）</p>
          </div>
        )}

        {/* STEP 3: ID */}
        {step === 3 && (
          <div className="onboard-step">
            <p className="onboard-question">{t('onboarding.step2_q')}</p>
            <input className="auth-input" type="text" placeholder={t("onboarding.step2_placeholder")}
              value={username} onChange={e => setUsername(e.target.value)}
              autoCapitalize="none" autoFocus maxLength={30}
              onKeyDown={e => e.key === 'Enter' && handleNext()} />
            <p className="onboard-hint">{t('onboarding.step2_hint')}</p>
          </div>
        )}

        {/* STEP 4: パスワード */}
        {step === 4 && (
          <div className="onboard-step">
            <p className="onboard-question">{t('onboarding.step3_q')}</p>
            <div style={{ position: 'relative' }}>
              <input className="auth-input" type={showPw ? 'text' : 'password'}
                placeholder={t("onboarding.step3_placeholder")} value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password" autoFocus
                style={{ paddingRight: 44 }}
                onKeyDown={e => e.key === 'Enter' && handleNext()} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', fontSize:18,
                  color:'var(--text2)', padding:4 }}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="onboard-hint">{t('onboarding.step3_hint')}</p>
          </div>
        )}

        {/* STEP 5: アイコン */}
        {step === 5 && (
          <div className="onboard-step" style={{ textAlign: 'center' }}>
            <p className="onboard-question">{t('onboarding.step4_q')}</p>
            <label className="onboard-avatar-label">
              {avatar
                ? <img src={avatar} alt="avatar" className="onboard-avatar-preview" />
                : <div className="onboard-avatar-placeholder">
                    <span style={{ fontSize: 40 }}>😊</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{t('onboarding.avatar_tap')}</span>
                  </div>
              }
              <input type="file" accept="image/*" onChange={handleAvatarChange}
                style={{ display: 'none' }} />
            </label>
            <p className="onboard-hint">{t('onboarding.step4_hint')}</p>
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" onClick={handleNext} disabled={loading}>
          {loading ? t('auth.loading_register') : step < TOTAL ? t('auth.next') : t('auth.start')}
        </button>
      </div>
    </div>
  );
}

// ===== ログインフォーム =====
function LoginForm({ onLogin, onBack }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) { setError('IDを入力してください'); return; }
    if (!password) { setError('パスワードを入力してください'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post('/api/auth/login', { username: username.trim(), password });
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      onLogin(res.data.user);
    } catch (err) { alert('ERR:' + err.message + ' URL:' + err.config?.url + ' base:' + err.config?.baseURL); setError(err.response?.data?.error || '接続エラー'); }
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
        <button onClick={onBack} className="onboard-back-btn">← 戻る</button>
        <div className="auth-logo">
          <WakkaLogo size={52} />
          <h1>WakkaChat</h1>
          <p>{t('auth.welcome_back')}</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder={t("auth.login")} value={username}
            onChange={(e) => setUsername(e.target.value)} required className="auth-input"
            autoComplete="username" autoCapitalize="none" />
          <div style={{ position:'relative' }}>
            <input type={showPw ? 'text' : 'password'} placeholder={t("errors.password_required").replace("入力してください","").trim() || "Password"} value={password}
              onChange={(e) => setPassword(e.target.value)} required className="auth-input"
              style={{ paddingRight:44 }} autoComplete="current-password" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', fontSize:18,
                color:'var(--text2)', padding:4 }}>
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? t('auth.loading_login') : t('auth.login')}
          </button>
        </form>
        <button onClick={() => setShowReset(true)} style={{
          background:'none', border:'none', color:'var(--primary)', fontSize:13,
          cursor:'pointer', padding:'4px 0', marginTop:4, display:'block', width:'100%'
        }}>
          {t('auth.forgot_password')}
        </button>
      </div>
    </div>
  );
}

// ===== AuthScreen（全フローのコントローラー）=====
// ===== OAuth ヘルパー =====
async function handleGoogleOAuth(onLogin) {
  return new Promise((resolve, reject) => {
    const clientId = window.__GOOGLE_CLIENT_ID__ || process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId) { reject(new Error('REACT_APP_GOOGLE_CLIENT_IDが未設定です')); return; }
    // Google Identity Services (GSI) をロード
    if (!window.google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogle(clientId, onLogin, resolve, reject);
      script.onerror = () => reject(new Error('Googleスクリプトの読み込みに失敗しました'));
      document.head.appendChild(script);
    } else {
      initGoogle(clientId, onLogin, resolve, reject);
    }
  });
}

function initGoogle(clientId, onLogin, resolve, reject) {
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const res = await axios.post('/api/auth/google', { idToken: response.credential });
        localStorage.setItem('token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        onLogin(res.data.user);
        resolve();
      } catch(e) { reject(e); }
    },
  });
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // ポップアップが出なかった場合はOne Tapが使えないのでフォールバック
      window.google.accounts.id.renderButton(
        document.getElementById('google-btn-container'),
        { theme: 'outline', size: 'large', width: 300, text: 'continue_with' }
      );
    }
  });
}

// ===== AuthScreen（全フローのコントローラー）=====
function AuthScreen({ onLogin }) {
  // 初回起動か確認
  const { t } = useTranslation();
  const [phase, setPhase] = useState(() =>
    localStorage.getItem('wc_welcomed') ? 'top' : 'splash'
  );
  const [oauthLoading, setOauthLoading] = useState('');
  const [oauthError, setOauthError] = useState('');

  const handleSplashDone = () => setPhase('welcome');
  const handleWelcomeDone = () => {
    localStorage.setItem('wc_welcomed', '1');
    setPhase('top');
  };

  const handleGoogleLogin = async () => {
    setOauthLoading('google'); setOauthError('');
    try { await handleGoogleOAuth(onLogin); }
    catch(e) { setOauthError(e.response?.data?.error || 'Googleログインに失敗しました'); }
    finally { setOauthLoading(''); }
  };

  const handleAppleLogin = async () => {
    setOauthLoading('apple'); setOauthError('');
    try {
      // Apple Sign In JS API
      if (!window.AppleID) throw new Error('Apple Sign Inが読み込まれていません');
      const res = await window.AppleID.auth.signIn();
      const idToken = res.authorization?.id_token;
      const fullName = res.user ? `${res.user.name?.firstName || ''} ${res.user.name?.lastName || ''}`.trim() : '';
      if (!idToken) throw new Error('トークン取得に失敗しました');
      const authRes = await axios.post('/api/auth/apple', { idToken, fullName });
      localStorage.setItem('token', authRes.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${authRes.data.token}`;
      onLogin(authRes.data.user);
    } catch(e) {
      if (e.error === 'popup_closed_by_user') { setOauthError(''); }
      else { setOauthError(e.response?.data?.error || 'Appleログインに失敗しました'); }
    }
    finally { setOauthLoading(''); }
  };

  if (phase === 'splash') return <SplashScreen onDone={handleSplashDone} />;
  if (phase === 'welcome') return <WelcomeSlides onDone={handleWelcomeDone} />;
  if (phase === 'register') return <RegisterFlow onDone={onLogin} onBack={() => setPhase('top')} />;
  if (phase === 'login') return <LoginForm onLogin={onLogin} onBack={() => setPhase('top')} />;

  // TOP画面
  return (
    <div className="auth-screen">
      {/* Apple Sign In SDK */}
      <script type="text/javascript" src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js" async />
      <div className="auth-top-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <WakkaLogo size={80} />
          <h1 className="auth-top-title">WakkaChat</h1>
          <p className="auth-top-sub">{t('app.tagline')}</p>
        </div>

        {/* Googleログイン */}
        <button className="oauth-btn oauth-btn-google"
          onClick={handleGoogleLogin}
          disabled={!!oauthLoading}>
          {oauthLoading === 'google' ? '接続中...' : (
            <React.Fragment><span className="oauth-icon">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>{t('auth.google')}</React.Fragment>
          )}
        </button>

        {/* Apple Sign In */}
        <button className="oauth-btn oauth-btn-apple"
          onClick={handleAppleLogin}
          disabled={!!oauthLoading}>
          {oauthLoading === 'apple' ? '接続中...' : (
            <React.Fragment><span className="oauth-icon">
              <svg width="18" height="18" viewBox="0 0 814 1000" fill="white">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 411.4 65.5 301.6 69.4 297.4c0-.8.2-1.6.2-2.4 0-0 0-0 0-0C69.6 295 69.6 295 69.6 295c0 0 0 0 0 0C68.5 175.5 163.8 101.3 240 101.3c55.4 0 101.2 34.4 135.9 34.4 33.4 0 87.3-36.7 152.4-36.7 30.3 0 127.8 2.6 199 101.3zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
              </svg>
            </span>{t('auth.apple')}</React.Fragment>
          )}
        </button>

        {oauthError && <div className="auth-error" style={{ marginTop: 8 }}>{oauthError}</div>}

        {/* 区切り線 */}
        <div className="oauth-divider"><span>{t('auth.or')}</span></div>

        <button className="auth-btn" onClick={() => setPhase('register')}>
          {t('auth.create_account')}
        </button>
        <button className="auth-btn auth-btn-outline" onClick={() => setPhase('login')}>
          ログイン
        </button>
        <p className="auth-top-terms">
          登録すると<a href="/terms" target="_blank" rel="noreferrer">利用規約</a>・
          <a href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意したことになります
        </p>
        <div id="google-btn-container" style={{ display: 'none' }} />
      </div>
    </div>
  );
}

function MediaListModal({ roomId, serverUrl, onClose }) {
  const [photos, setPhotos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [lightbox, setLightbox] = React.useState(null);
  React.useEffect(() => {
    if (!roomId) return;
    axios.get(`/api/rooms/${roomId}/album`)
      .then(r => setPhotos(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);
  const getUrl = (photo) => {
    const u = photo.file_data?.url || photo.fileData?.url || photo.url;
    if (!u) return '';
    return u.startsWith('http') ? u : `${serverUrl}${u}`;
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh' }}>
        <div className="modal-title">🖼️ 画像・動画 ({photos.length})</div>
        {loading ? (
          <div style={{ textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>読み込み中...</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, maxHeight:'65vh', overflowY:'auto' }}>
            {photos.length === 0
              ? <div style={{ gridColumn:'1/-1', textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>画像・動画がまだないで</div>
              : photos.map((p, i) => {
                const url = getUrl(p);
                if (!url) return null;
                return (
                  <div key={p._id || p.id || i} style={{ aspectRatio:'1', overflow:'hidden', borderRadius:8, cursor:'pointer' }}
                    onClick={() => setLightbox(url)}>
                    <img src={url} alt="" loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </div>
                );
              })
            }
          </div>
        )}
        <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={onClose}>閉じる</button>
        {lightbox && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="" style={{ maxWidth:'95vw', maxHeight:'90vh', objectFit:'contain', borderRadius:8 }} />
          </div>
        )}
      </div>
    </div>
  );
}

function RoomNameEditor({ room, onClose }) {
  const [name, setName] = React.useState(room.name || '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try { await axios.patch(`/api/rooms/${room.id}/name`, { name: name.trim() }); onClose(); }
    catch (e) { setError(e.response?.data?.error || '保存に失敗したで'); }
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
      {error && <div style={{ fontSize:12, color:'var(--danger)', marginTop:4 }}>{error}</div>}
    </div>
  );
}

// アバターフレームコンポーネント
// AVATAR_FRAMES removed
const AvatarImg = React.memo(function AvatarImg({ src, name, size = 40, frame = 'none' }) {
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
}); // React.memo

// ephemeralメッセージ用カウントダウンコンポーネント
const EphemeralBubble = React.memo(function EphemeralBubble({ msg, isMine }) {
  const expiresAt = msg.expiresAt || msg.expires_at ? new Date(msg.expiresAt || msg.expires_at) : null;
  const [remaining, setRemaining] = React.useState(
    expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0
  );
  React.useEffect(() => {
    if (!expiresAt || remaining <= 0) return;
    const t = setInterval(() => {
      const r = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = expiresAt ? Math.min(100, (remaining / ((expiresAt - new Date(msg.createdAt || msg.created_at)) / 1000)) * 100) : 0;
  return (
    <div className="message-bubble" style={{ border:'1.5px dashed var(--danger)', background:'rgba(255,59,48,0.07)', position:'relative', overflow:'hidden' }}>
      <span style={{ fontSize:12, marginRight:6 }}>💨</span>{msg.content}
      {remaining > 0 ? (
        <>
          <div style={{ fontSize:10, color:'var(--danger)', marginTop:4, fontWeight:600 }}>
            {remaining >= 3600
              ? `${Math.floor(remaining/3600)}時間後に消えるで`
              : remaining >= 60
              ? `${Math.floor(remaining/60)}分${remaining%60}秒後に消えるで`
              : `${remaining}秒後に消えるで`}
          </div>
          <div style={{ height:3, background:'var(--surface2)', borderRadius:2, marginTop:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:'var(--danger)', borderRadius:2, transition:'width 1s linear' }} />
          </div>
        </>
      ) : (
        <div style={{ fontSize:10, color:'var(--text2)', marginTop:4, fontStyle:'italic' }}>消えました</div>
      )}
    </div>
  );
}); // React.memo

function ChatScreen({ socket, currentUser, allStampSets, acquiredStampIds, friendsList, onCall, setGroupCall, onlineUsers = new Set(), bookmarks = new Set(), setBookmarks, mutedRooms = new Set(), setMutedRooms, soundTheme = 'default', setShowSubAccounts, setVoiceCall, showToast, setShowGift, setShowReadLater, onNavigate, onReadRoom, setShowBroadcast, pinnedRooms = [], setPinnedRooms, showWhiteboard = false, setShowWhiteboard, showQuickReply = false, setShowQuickReply, quickReplies = [], setQuickReplies }) {
  const [rooms, setRooms] = useState([]);
  const [newQuickReply, setNewQuickReply] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]); // AI返信サジェスト
  const [newMsgCount, setNewMsgCount] = useState(0); // 最下部にいない時の新着数
  const [suggLoading, setSuggLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesCache = useRef({});
  // messagesCacheを最大20ルームに制限するクリーンアップ
  const trimMessagesCache = useCallback(() => {
    const cache = messagesCache.current;
    const roomIds = Object.keys(cache).filter(k => !k.endsWith('_time') && k !== '_current');
    if (roomIds.length <= 20) return;
    // 古い順にソートして超過分を削除
    const sorted = roomIds.sort((a, b) => (cache[a + '_time'] || 0) - (cache[b + '_time'] || 0));
    sorted.slice(0, roomIds.length - 20).forEach(id => {
      delete cache[id];
      delete cache[id + '_time'];
    });
  }, []);
  // Refを常に最新に保つ
  useEffect(() => { selectedRoomRef.current = selectedRoom; }, [selectedRoom]);
  const hasMoreMessages = useRef({}); // ルームごとにまだ読めるか
  const loadingMoreRef = useRef(false); // 二重ロード防止
  const [inputText, setInputText] = useState('');
  // show* 系フラグをまとめて1つのreducerで管理（個別stateより再レンダリングを抑制）
  const [modals, dispatchModal] = useReducer((state, action) => {
    switch (action.type) {
      case 'SET': return { ...state, [action.key]: action.value };
      case 'TOGGLE': return { ...state, [action.key]: !state[action.key] };
      case 'CLOSE_ALL': return { ...state, showStampPanel: false, showHeaderMenu: false, showInputMenu: false, showStylePicker: false };
      default: return state;
    }
  }, {
    showStampPanel: false, showCreateRoom: false, showNote: false, showSearch: false,
    showRoomSettings: false, showBgPicker: false, showMediaList: false, showMemberMgr: false,
    showBookmarks: false, showAnnounce: false, showAI: false, showEventCal: false,
    showMiniGame: false, showFavorites: false, showGlobalSearch: false, showTaskPanel: false,
    showVoice: false, showStickerMaker: false, showHeaderMenu: false, showInputMenu: false,
    showLocation: false, showSecret: false, showStats: false, showStylePicker: false,
    showSchedule: false, showPollCreator: false, showExport: false, showScheduleList: false,
    showNotifSettings: false,
  });
  // 後方互換のためのshorthand（既存コードを最小限の変更で動かす）
  const showStampPanel = modals.showStampPanel;
  const setShowStampPanel = useCallback((v) => dispatchModal({ type: 'SET', key: 'showStampPanel', value: v }), []);
  const showCreateRoom = modals.showCreateRoom;
  const setShowCreateRoom = useCallback((v) => dispatchModal({ type: 'SET', key: 'showCreateRoom', value: v }), []);
  const showNote = modals.showNote;
  const setShowNote = useCallback((v) => dispatchModal({ type: 'SET', key: 'showNote', value: v }), []);
  const showSearch = modals.showSearch;
  const setShowSearch = useCallback((v) => dispatchModal({ type: 'SET', key: 'showSearch', value: v }), []);
  const showRoomSettings = modals.showRoomSettings;
  const setShowRoomSettings = useCallback((v) => dispatchModal({ type: 'SET', key: 'showRoomSettings', value: v }), []);
  const showBgPicker = modals.showBgPicker;
  const setShowBgPicker = useCallback((v) => dispatchModal({ type: 'SET', key: 'showBgPicker', value: v }), []);
  const showMediaList = modals.showMediaList;
  const setShowMediaList = useCallback((v) => dispatchModal({ type: 'SET', key: 'showMediaList', value: v }), []);
  const showMemberMgr = modals.showMemberMgr;
  const setShowMemberMgr = useCallback((v) => dispatchModal({ type: 'SET', key: 'showMemberMgr', value: v }), []);
  const showBookmarks = modals.showBookmarks;
  const setShowBookmarks = useCallback((v) => dispatchModal({ type: 'SET', key: 'showBookmarks', value: v }), []);
  const showAnnounce = modals.showAnnounce;
  const setShowAnnounce = useCallback((v) => dispatchModal({ type: 'SET', key: 'showAnnounce', value: v }), []);
  const showAI = modals.showAI;
  const setShowAI = useCallback((v) => dispatchModal({ type: 'SET', key: 'showAI', value: v }), []);
  const showEventCal = modals.showEventCal;
  const setShowEventCal = useCallback((v) => dispatchModal({ type: 'SET', key: 'showEventCal', value: v }), []);
  const showMiniGame = modals.showMiniGame;
  const setShowMiniGame = useCallback((v) => dispatchModal({ type: 'SET', key: 'showMiniGame', value: v }), []);
  const showFavorites = modals.showFavorites;
  const setShowFavorites = useCallback((v) => dispatchModal({ type: 'SET', key: 'showFavorites', value: v }), []);
  const showGlobalSearch = modals.showGlobalSearch;
  const setShowGlobalSearch = useCallback((v) => dispatchModal({ type: 'SET', key: 'showGlobalSearch', value: v }), []);
  const showTaskPanel = modals.showTaskPanel;
  const setShowTaskPanel = useCallback((v) => dispatchModal({ type: 'SET', key: 'showTaskPanel', value: v }), []);
  const showVoice = modals.showVoice;
  const setShowVoice = useCallback((v) => dispatchModal({ type: 'SET', key: 'showVoice', value: v }), []);
  const showStickerMaker = modals.showStickerMaker;
  const setShowStickerMaker = useCallback((v) => dispatchModal({ type: 'SET', key: 'showStickerMaker', value: v }), []);
  const showHeaderMenu = modals.showHeaderMenu;
  const setShowHeaderMenu = useCallback((v) => dispatchModal({ type: 'SET', key: 'showHeaderMenu', value: v }), []);
  const showInputMenu = modals.showInputMenu;
  const setShowInputMenu = useCallback((v) => dispatchModal({ type: 'SET', key: 'showInputMenu', value: v }), []);
  const showLocation = modals.showLocation;
  const setShowLocation = useCallback((v) => dispatchModal({ type: 'SET', key: 'showLocation', value: v }), []);
  const showSecret = modals.showSecret;
  const setShowSecret = useCallback((v) => dispatchModal({ type: 'SET', key: 'showSecret', value: v }), []);
  const showStats = modals.showStats;
  const setShowStats = useCallback((v) => dispatchModal({ type: 'SET', key: 'showStats', value: v }), []);
  const showStylePicker = modals.showStylePicker;
  const setShowStylePicker = useCallback((v) => dispatchModal({ type: 'SET', key: 'showStylePicker', value: v }), []);
  const showSchedule = modals.showSchedule;
  const setShowSchedule = useCallback((v) => dispatchModal({ type: 'SET', key: 'showSchedule', value: v }), []);
  const showPollCreator = modals.showPollCreator;
  const setShowPollCreator = useCallback((v) => dispatchModal({ type: 'SET', key: 'showPollCreator', value: v }), []);
  const showExport = modals.showExport;
  const setShowExport = useCallback((v) => dispatchModal({ type: 'SET', key: 'showExport', value: v }), []);
  const showScheduleList = modals.showScheduleList;
  const setShowScheduleList = useCallback((v) => dispatchModal({ type: 'SET', key: 'showScheduleList', value: v }), []);
  const showNotifSettings = modals.showNotifSettings;
  const setShowNotifSettings = useCallback((v) => dispatchModal({ type: 'SET', key: 'showNotifSettings', value: v }), []);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // 返信先メッセージ
  const [reactionPicker, setReactionPicker] = useState(null); // { msgId, x, y }
  const [translating, setTranslating] = useState({}); // { msgId: translated text }
  const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥'];
  const [pinnedMessage, setPinnedMessage] = useState(null); // ピン留めメッセージ
  const [unreadCounts, setUnreadCounts] = useState({}); // { roomId: count }
  const [forwardMsg, setForwardMsg] = useState(null); // 転送するメッセージ
  const roomIconInputRef = useRef(null);
  const longPressTimer = useRef(null);
  const [msgMenu, setMsgMenu] = useState(null); // { msg, x, y } 長押しメニュー
  const [editingMessage, setEditingMessage] = useState(null); // { id, content }
  const [showReadDetail, setShowReadDetail] = useState(null); // { msgId, readers: [] }
  const [showEditHistory, setShowEditHistory] = useState(null); // { msgId, history: [], current }
  const [showBadges, setShowBadges] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [rankingData, setRankingData] = useState([]);
  const [rankingType, setRankingType] = useState('message');
  const [showFileManager, setShowFileManager] = useState(false);
  const [roomFiles, setRoomFiles] = useState([]);
  const [roomStats, setRoomStats] = useState(null);
  const { t, i18n: i18nInstance } = useTranslation();
  const [showTheme, setShowTheme] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showStampMarket, setShowStampMarket] = useState(false);
  const [showGamerStatus, setShowGamerStatus] = useState(false);
  const [stampMarketPacks, setStampMarketPacks] = useState([]);
  const [gamerStatusData, setGamerStatusData] = useState({ is_gaming: false, game_name: '', game_emoji: '🎮' });
  const [friendGamingList, setFriendGamingList] = useState([]);
  const [e2eEnabled, setE2eEnabled] = useState(!!localStorage.getItem('wc_e2e_key'));
  const [showDailyBonus, setShowDailyBonus] = useState(false);
  const [dailyBonusResult, setDailyBonusResult] = useState(null);
  const [showNotifSound, setShowNotifSound] = useState(false);
  const [notifSound, setNotifSound] = useState('default');
  const [showMusicShare, setShowMusicShare] = useState(false);
  const [musicUrl, setMusicUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showFortune, setShowFortune] = useState(false);
  const [fortuneResult, setFortuneResult] = useState(null);
  const [fortuneSign, setFortuneSign] = useState('牡羊座');
  const [showTodo, setShowTodo] = useState(false);
  const [extractedTodos, setExtractedTodos] = useState([]);
  const [showCommunity, setShowCommunity] = useState(false);
  const [communityList, setCommunityList] = useState([]);
  const [showRoulette, setShowRoulette] = useState(false);
  const [rouletteResult, setRouletteResult] = useState(null);
  const [showBirthday, setShowBirthday] = useState(false);
  const [birthdayFriends, setBirthdayFriends] = useState([]);
  const [showSpamReport, setShowSpamReport] = useState(null); // { id, type, name }
  const [showPractice, setShowPractice] = useState(false);
  const [practiceMode, setPracticeMode] = useState('english');
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [practiceInput, setPracticeInput] = useState('');
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [folderList, setFolderList] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const [friendActivities, setFriendActivities] = useState([]);
  const [fontSize, setFontSize] = useState(localStorage.getItem('fontSize') || 'medium');
  const [showSocialLinks, setShowSocialLinks] = useState(false);
  const [showDecoration, setShowDecoration] = useState(false);
  const [decoration, setDecoration] = useState({ bold: false, color: '', size: 'medium' });
  const [showMapShare, setShowMapShare] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // フォントサイズをhtmlに適用
  useEffect(() => {
    const sizes = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.setProperty('--base-font-size', sizes[fontSize] || '15px');
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const [badgeList, setBadgeList] = useState([]);
  const [badgeToast, setBadgeToast] = useState(null); // 新バッジ獲得トースト
  const [threadMsg, setThreadMsg] = useState(null); // スレッド表示中の親メッセージ
  const [threadMessages, setThreadMessages] = useState([]); // スレッドのメッセージ一覧
  const [threadInput, setThreadInput] = useState('');
  const [emotions, setEmotions] = useState({}); // { msgId: emoji }
  const [wakkabotLoading, setWakkabotLoading] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(null); // { id, name, avatar, status }
  const [readByDetailMap, setReadByDetailMap] = useState({}); // msgId -> [{id,name,avatar}]
  const [bookmarkedMsgs, setBookmarkedMsgs] = useState([]);
  const [announceText, setAnnounceText] = useState('');
  const [favoritesList, setFavoritesList] = useState([]);
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onOk }
  const appConfirm = useCallback((message, onOk) => setConfirmDialog({ message, onOk }), []);
  const [msgStyle, setMsgStyle] = useState(() => JSON.parse(localStorage.getItem('msgStyle') || '{"font":"default","color":""}'));
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ja');
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollFreeText, setPollFreeText] = useState(false);
  const [polls, setPolls] = useState({});
  const [chatBg, setChatBg] = useState(() => localStorage.getItem('chatBg') || 'default');
  const [customBgUrl, setCustomBgUrl] = useState('');
  const [editText, setEditText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]); // @補完候補
  const [scheduleList, setScheduleList] = useState([]); // スケジュール済みメッセージ
  const [searchSender, setSearchSender] = useState(''); // 検索：送信者フィルター
  const [searchDate, setSearchDate] = useState(''); // 検索：日付フィルター
  const searchDebounceRef = useRef(null);
  const [notifSettings, setNotifSettings] = useState(() => { // 通知設定
    try { return JSON.parse(localStorage.getItem('notifSettings') || '{}'); } catch { return {}; }
  });
  const draftRef = useRef({}); // 下書き一時保存 { roomId: text }
  const selectedRoomRef = useRef(null); // closureで古いselectedRoomを参照しないためのRef
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const notifSettingsRef = useRef((() => { try { return JSON.parse(localStorage.getItem('notifSettings') || '{}'); } catch { return {}; } })()); // 通知設定をclosure-safeに参照（初期値をlocalStorageから即読み）
  const mutedRoomsRef = useRef(new Set()); // ミュートルームをclosure-safeに参照
  useEffect(() => { notifSettingsRef.current = notifSettings; }, [notifSettings]);
  useEffect(() => { mutedRoomsRef.current = mutedRooms; }, [mutedRooms]);
  // renderMessage内で最新値を参照するためのRef（依存配列から外すことでrenderedMessagesの不要な再計算を防ぐ）
  const translatingRef = useRef({});
  useEffect(() => { translatingRef.current = translating; }, [translating]);
  const readByDetailMapRef = useRef({});
  useEffect(() => { readByDetailMapRef.current = readByDetailMap; }, [readByDetailMap]);
  const msgStyleRef = useRef(msgStyle);
  useEffect(() => { msgStyleRef.current = msgStyle; }, [msgStyle]);
  const messagesEndRef = useRef(null);
  const readObserverRef = useRef(null); // 既読用IntersectionObserver
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isAtBottomRef = useRef(true); // スクロール最下部にいるかどうか

  const myStampSets = React.useMemo(
    () => allStampSets.filter(s => acquiredStampIds.map(id => String(id)).includes(String(s.id))),
    [allStampSets, acquiredStampIds]
  );

  // マウント時にAPIから下書きを取得してdraftRefに入れる
  useEffect(() => {
    axios.get('/api/drafts').then(res => {
      const data = res.data || {};
      Object.assign(draftRef.current, data);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRooms = useCallback(async () => {
    try {
      const res = await axios.get('/api/rooms');
      setRooms(res.data);
      // キャッシュに保存（次回起動時に即表示）
      try { localStorage.setItem('rooms_cache', JSON.stringify(res.data)); } catch {}
    }
    catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    // キャッシュがあれば即表示してから最新データを取得
    try {
      const cached = localStorage.getItem('rooms_cache');
      if (cached) setRooms(JSON.parse(cached));
    } catch {}
    fetchRooms();
    // 起動時に未読カウントを取得
    axios.get('/api/dashboard').then(res => {
      const unread = {};
      (res.data.unread || []).forEach(r => { unread[r.roomId] = r.count; });
      setUnreadCounts(unread);
    }).catch(() => {});
  }, [fetchRooms]);

  // roomsが変わるたびにlocalStorageキャッシュを更新
  useEffect(() => {
    if (rooms.length > 0) {
      try { localStorage.setItem('rooms_cache', JSON.stringify(rooms)); } catch {}
    }
  }, [rooms]);

  // タイピングタイムアウトのクリーンアップ
  useEffect(() => {
    const ref = typingTimeoutRef.current;
    return () => { if (ref) clearTimeout(ref); };
  }, []);

  // ヘッダーメニュー・入力メニューを画面外タップで閉じる
  // オンライン/オフライン検知
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  };
    const onOffline = () => { setIsOnline(false); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // PCショートカット
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setSearchQuery(''); setSearchResults([]); setShowSearch(true); }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); setShowBadges(true); axios.get('/api/badges').then(r => setBadgeList(r.data)).catch(() => {}); }
      if (e.key === 'Escape') { setShowSearch(false); setShowBadges(false); setShowRanking(false); setShowStats(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showHeaderMenu && !showInputMenu) return;
    const close = (e) => {
      if (!e.target.closest('.header-menu-dropdown') && !e.target.closest('.header-menu-btn') && !e.target.closest('.header-menu-item')) setShowHeaderMenu(false);
      // input-menu-item ボタン自体はactionで閉じるのでここでは閉じない
      if (!e.target.closest('.input-menu-grid') && !e.target.closest('.plus-btn') && !e.target.closest('.input-menu-item')) setShowInputMenu(false);
    };
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('touchstart', close); document.removeEventListener('mousedown', close); };
  }, [showHeaderMenu, showInputMenu]);

  // タブの未読バッジ
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((s, n) => s + n, 0);
    document.title = total > 0 ? `(${total}) WakkaChat` : 'WakkaChat';
  }, [unreadCounts]);

  useEffect(() => {
    if (!socket) return;
    socket.on('message:receive', (msg) => {
      // message:newも同じ処理（通話終了・スケジュール送信など）
      const roomId = msg.roomId || msg.room_id;
      const senderId = msg.senderId || msg.sender_id;
      const normalizedMsg = { ...msg, roomId, senderId };
      const isMuted = mutedRoomsRef.current.has(roomId);
      const notifLevel = notifSettingsRef.current[roomId] || 'all';
      const shouldNotify = !isMuted && notifLevel !== 'mute';
      if (roomId === selectedRoomRef.current?.id) {
        setMessages((prev) => { const next = [...prev, normalizedMsg]; return next.length > 500 ? next.slice(-500) : next; });
        if (senderId !== currentUser.id) {
          socket.emit('message:read', { messageId: msg.id, roomId });
          if (shouldNotify) sounds.receive(soundTheme);
        }
      } else if (senderId !== currentUser.id) {
        setUnreadCounts((prev) => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
        // バックグラウンドルームへのブラウザ通知もミュートチェック
        if (shouldNotify) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(msg.senderName || msg.sender_name || '新着メッセージ', {
              body: msg.content?.slice(0, 80) || '📎 ファイル',
              icon: '/favicon.ico',
            });
          }
        }
      }
      // キャッシュにも追加（バックグラウンドのルームのメッセージも保存）
      if (messagesCache.current[roomId]) {
        const cached = messagesCache.current[roomId];
        if (!cached.some(m => m.id === normalizedMsg.id)) {
          messagesCache.current[roomId] = [...cached, normalizedMsg].slice(-500);
          messagesCache.current[roomId + '_time'] = Date.now(); // キャッシュ時刻更新
          trimMessagesCache();
        }
      }
      setRooms((prev) => {
        const updated = prev.map((r) => r.id === roomId ? { ...r, lastMessage: normalizedMsg, lastActivity: normalizedMsg.createdAt || normalizedMsg.created_at } : r);
        const idx = updated.findIndex(r => r.id === roomId);
        if (idx <= 0) return updated;
        const room = updated[idx];
        return [room, ...updated.slice(0, idx), ...updated.slice(idx + 1)];
      });
    });
    // message:new は message:receive と同じ処理（サーバーが両方使ってるため）
    socket.on('message:new', (msg) => {
      const roomId = msg.roomId || msg.room_id;
      const senderId = msg.senderId || msg.sender_id;
      const normalizedMsg = { ...msg, roomId, senderId, createdAt: msg.createdAt || msg.created_at };
      if (roomId === selectedRoomRef.current?.id) {
        setMessages((prev) => {
          if (prev.some(m => m.id === normalizedMsg.id)) return prev;
          const next = [...prev, normalizedMsg];
          return next.length > 500 ? next.slice(-500) : next;
        });
        // 最下部にいない時は新着カウントを増やす
        if (!isAtBottomRef.current && senderId !== currentUser?.id) {
          setNewMsgCount(c => c + 1);
        }
        // message:receiveと同様に既読を送信
        if (senderId !== currentUser.id) {
          socket.emit('message:read', { messageId: msg.id, roomId });
        }
      } else if (senderId !== currentUser.id) {
        setUnreadCounts((prev) => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
      }
      setRooms((prev) => {
        const updated = prev.map((r) => r.id === roomId ? { ...r, lastMessage: normalizedMsg, lastActivity: normalizedMsg.createdAt } : r);
        const idx = updated.findIndex(r => r.id === roomId);
        if (idx <= 0) return updated;
        const room = updated[idx];
        return [room, ...updated.slice(0, idx), ...updated.slice(idx + 1)];
      });
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
      if (roomId !== selectedRoomRef.current?.id) return;
      if (!messageId) { setPinnedMessage(null); return; }
      setMessages((prev) => {
        const msg = prev.find(m => m.id === messageId);
        if (msg) setPinnedMessage(msg);
        return prev;
      });
    });
    socket.on('room:new', (room) => {
      setRooms((prev) => prev.find(r => r.id === room.id) ? prev : [room, ...prev]);
      // 新しいルームのsocketルームにjoinしてリアルタイムでメッセージを受け取れるようにする
      if (room.id) socket.emit('room:join', room.id);
    });
    socket.on('room:updated', ({ roomId, name, icon }) => {
      setRooms((prev) => prev.map(r => r.id === roomId ? { ...r, ...(name && { name }), ...(icon && { icon }) } : r));
      setSelectedRoom((prev) => prev?.id === roomId ? { ...prev, ...(name && { name }), ...(icon && { icon }) } : prev);
    });
    // 自分がグループを退出した時
    socket.on('room:left', ({ roomId }) => {
      setRooms((prev) => prev.filter(r => r.id !== roomId));
      setSelectedRoom((prev) => prev?.id === roomId ? null : prev);
      localStorage.removeItem('rooms_cache');
      // 未読カウントをクリア
      setUnreadCounts((prev) => { const next = { ...prev }; delete next[roomId]; return next; });
      // messagesCacheも削除
      delete messagesCache.current[roomId];
      delete messagesCache.current[roomId + '_time'];
    });
    // グループメンバーが変わった時
    socket.on('room:members_updated', ({ roomId, members, removedId }) => {
      setRooms((prev) => prev.map(r => r.id === roomId ? { ...r, members } : r));
      setSelectedRoom((prev) => prev?.id === roomId ? { ...prev, members } : prev);
      // 自分が削除された場合はルームリストから除外
      if (removedId === currentUser.id) {
        setRooms((prev) => prev.filter(r => r.id !== roomId));
        setSelectedRoom((prev) => prev?.id === roomId ? null : prev);
        localStorage.removeItem('rooms_cache');
        // 未読カウントをクリア
        setUnreadCounts((prev) => { const next = { ...prev }; delete next[roomId]; return next; });
        // messagesCacheも削除
        delete messagesCache.current[roomId];
        delete messagesCache.current[roomId + '_time'];
      }
    });
    socket.on('poll:updated', (poll) => {
      setPolls(prev => ({ ...prev, [poll.id]: poll }));
    });
    socket.on('room:announcement', ({ roomId, text, by }) => {
      if (roomId === selectedRoomRef.current?.id) {
        const sysMsg = { id: 'ann_' + Date.now(), type: 'announcement', content: text, senderId: by, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, sysMsg]);
      }
    });
    socket.on('message:edited', ({ messageId, content: newContent, roomId: editRoomId, edit_history }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, edited: true, edit_history: edit_history || m.edit_history } : m));
      // 全キャッシュを更新（どのルームのメッセージかに関わらず）
      Object.keys(messagesCache.current).forEach(rid => {
        if (Array.isArray(messagesCache.current[rid]))
          messagesCache.current[rid] = messagesCache.current[rid].map(m => m.id === messageId ? { ...m, content: newContent, edited: true, edit_history: edit_history || m.edit_history } : m);
      });
    });
    socket.on('message:deleted', ({ messageId, roomId: delRoomId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, content: '' } : m));
      Object.keys(messagesCache.current).forEach(rid => {
        if (Array.isArray(messagesCache.current[rid]))
          messagesCache.current[rid] = messagesCache.current[rid].map(m => m.id === messageId ? { ...m, deleted: true, content: '' } : m);
      });
    });
    // タイピングインジケーター
    socket.on('typing:update', ({ username, isTyping }) => {
      setTypingUsers(prev =>
        isTyping ? (prev.includes(username) ? prev : [...prev, username])
                 : prev.filter(u => u !== username)
      );
    });
    socket.on('thread:new', ({ parentId, msg }) => {
      if (threadMsg?.id === parentId) {
        setThreadMessages(prev => [...prev, msg]);
      }
    });
    socket.on('badges:awarded', ({ badges }) => {
      if (badges && badges.length > 0) {
        setBadgeToast(badges[0]);
        setTimeout(() => setBadgeToast(null), 4000);
      }
    });
    return () => {
      socket.off('message:receive'); socket.off('message:new'); socket.off('message:read_update');
      socket.off('message:reacted'); socket.off('room:new'); socket.off('room:updated');
      socket.off('message:edited'); socket.off('message:deleted');
      socket.off('room:pinned'); socket.off('poll:updated');
      socket.off('room:announcement'); socket.off('typing:update');
      socket.off('room:left'); socket.off('room:members_updated');
      socket.off('badges:awarded');
      socket.off('thread:new');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // ルーム切り替え時に状態をリセット
    setTypingUsers([]); // タイピング表示クリア
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
    dispatchModal({ type: 'CLOSE_ALL' });
    setShowVoice(false);
    setShowLocation(false);
    setShowSecret(false);
    setMentionSuggestions([]);
    setNewMsgCount(0);
    if (!selectedRoom) return;
    messagesCache.current._current = selectedRoom.id; // 現在のルームを記録
    hasMoreMessages.current[selectedRoom.id] = true; // 過去メッセージがある可能性あり
    // キャッシュがあれば即表示
    if (messagesCache.current[selectedRoom.id]) {
      setMessages(messagesCache.current[selectedRoom.id]);
    } else {
      setMessages([]);
    }
    // キャッシュが30秒以内なら再取得しない
    const cacheTime = messagesCache.current[selectedRoom.id + '_time'];
    const isFreshCache = cacheTime && (Date.now() - cacheTime) < 30000;
    const currentRoomId = selectedRoom.id;
    (async () => {
      try {
        if (isFreshCache) {
          // キャッシュが新鮮なのでAPI省略・未読リセット・既読送信を行う
          setUnreadCounts((prev) => ({ ...prev, [currentRoomId]: 0 }));
          onReadRoom?.();
          isAtBottomRef.current = true;
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
          if (socket) {
            socket.emit('room:join', currentRoomId);
            // 既読はIntersectionObserverで画面に表示された時のみ送信
          }
          return;
        }
        const res = await axios.get(`/api/rooms/${currentRoomId}/messages`);
        // ルームが切り替わってたら無視
        if (messagesCache.current._current !== currentRoomId) return;
        messagesCache.current[currentRoomId] = res.data;
        messagesCache.current[currentRoomId + '_time'] = Date.now();
        trimMessagesCache();
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
        onReadRoom?.(); // チャットタブバッジをクリア
        // 最下部へ即スクロール（ルーム切替時は必ず最新メッセージから）
        isAtBottomRef.current = true;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
        if (socket) {
          socket.emit('room:join', selectedRoom.id);
          // 既読はIntersectionObserverで画面に表示された時のみ送信
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

  // IntersectionObserver で画面に入ったメッセージを既読にする
  useEffect(() => {
    if (!socket || !selectedRoom || !currentUser) return;
    const roomId = selectedRoom.id;

    // 前のObserverを解除
    if (readObserverRef.current) readObserverRef.current.disconnect();

    readObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const msgId = entry.target.dataset.msgid;
        const senderId = entry.target.dataset.senderid;
        if (!msgId || senderId === currentUser.id) return;
        // まだ既読でなければ送信
        const msg = messages.find(m => m.id === msgId);
        if (msg && !msg.read_by?.includes(currentUser.id)) {
          socket.emit('message:read', { messageId: msgId, roomId });
        }
        readObserverRef.current?.unobserve(entry.target);
      });
    }, { threshold: 0.5 }); // 50%表示で既読

    // コンテナ内のメッセージ要素を監視
    const container = messagesContainerRef.current;
    const targets = (container || document).querySelectorAll('[data-msgid]');
    targets.forEach(el => readObserverRef.current?.observe(el));

    return () => readObserverRef.current?.disconnect();
  }, [messages, socket, selectedRoom, currentUser]); // eslint-disable-line

  // 過去メッセージを追加読み込み
  const loadMoreMessages = useCallback(async () => {
    if (!selectedRoom || loadingMoreRef.current) return;
    if (hasMoreMessages.current[selectedRoom.id] === false) return;
    const oldest = messages[0];
    if (!oldest) return;
    loadingMoreRef.current = true;
    // スクロール位置を保持するためにcontainerのscrollHeightを記録
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
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
      // スクロール位置を補正（新メッセージ分だけ下にずらす）
      requestAnimationFrame(() => {
        if (container) {
          const diff = container.scrollHeight - prevScrollHeight;
          container.scrollTop += diff;
        }
      });
    } catch (e) { console.error(e); }
    finally { loadingMoreRef.current = false; }
  }, [selectedRoom, messages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !selectedRoom || !socket) return;
    sounds.send(soundTheme);
    const sentText = inputText;
    // デコレーション情報を付与
    const decoStyle = (decoration.bold || decoration.color || decoration.size !== 'medium')
      ? JSON.stringify(decoration) : null;
    socket.emit('message:send', {
      roomId: selectedRoom.id, content: inputText, type: 'text',
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderName: replyTo.senderName } : null,
      decoration: decoStyle
    });
    setInputText('');
    setReplyTo(null);
    setShowDecoration(false);
    setDecoration({ bold: false, color: '', size: 'medium' });
    // WakkaBOT検出
    if (sentText.includes('@WakkaBOT') || sentText.includes('@わっかBOT')) {
      setWakkabotLoading(true);
      const history = messages.slice(-10);
      axios.post('/api/ai/wakkabot', { message: sentText, history }).then(r => {
        if (r.data?.result) {
          socket.emit('message:send', { roomId: selectedRoom.id, content: `🤖 WakkaBOT: ${r.data.result}`, type: 'text' });
        }
      }).catch(() => {}).finally(() => setWakkabotLoading(false));
    }
    // 下書きをクリア
    if (selectedRoom?.id) {
      draftRef.current[selectedRoom.id] = '';
      axios.put('/api/drafts/' + selectedRoom.id, { content: '' }).catch(() => {});
    }
    // textareaの高さをリセット
    const ta = document.querySelector('.message-input');
    if (ta) { ta.style.height = 'auto'; }
  }, [inputText, selectedRoom, socket, soundTheme, replyTo]);

  const handleSendStamp = useCallback((stampSet, stamp) => {
    if (!selectedRoom || !socket) return;
    socket.emit('message:send', {
      roomId: selectedRoom.id,
      content: stamp.emoji,
      type: 'stamp',
      stampLabel: stamp.label
    });
    setShowStampPanel(false);
  }, [selectedRoom, socket]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedRoom) return;
    // ファイルサイズ制限（50MB）
    if (file.size > 50 * 1024 * 1024) {
      showToast?.('ファイルサイズは50MB以下にしてや', 'error');
      e.target.value = '';
      return;
    }
    // 画像は自動圧縮してから送信
    let fileToUpload = file;
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
      try { fileToUpload = await compressImage(file, 1280, 0.82); } catch(_) {}
    }
    const formData = new FormData();
    formData.append('file', fileToUpload);
    try {
      const res = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      socket?.emit('message:send', {
        roomId: selectedRoom.id,
        content: res.data.filename || 'ファイル',
        type: res.data.isImage ? 'image' : 'file',
        fileData: res.data
      });
    } catch (err) { console.error(err); showToast?.('ファイルのアップロードに失敗したで', 'error'); }
    e.target.value = '';
  }, [selectedRoom, socket, showToast]);

  const handleTyping = useCallback((e) => {
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
    if (atMatch && selectedRoom?.memberDetails?.length > 0) {
      const q = atMatch[1].toLowerCase();
      const members = (selectedRoom.memberDetails || []).filter(m =>
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
  }, [selectedRoom, socket, currentUser.id]);

  const handleMentionSelect = useCallback((member) => {
    const ta = document.querySelector('.message-input');
    const cursor = ta?.selectionStart ?? inputText.length;
    const textBefore = inputText.slice(0, cursor);
    const replaced = textBefore.replace(/@(\S*)$/, `@${member.username || member.displayName} `);
    setInputText(replaced + inputText.slice(cursor));
    setMentionSuggestions([]);
    setTimeout(() => ta?.focus(), 0);
  }, [inputText]);

  // ヘッダー系
  const handleBackToList = useCallback(() => setSelectedRoom(null), []);
  const handleOpenRoomSettings = useCallback(() => setShowRoomSettings(true), []);
  const handleCloseRoomSettings = useCallback(() => setShowRoomSettings(false), []);
  const handleCloseNote = useCallback(() => setShowNote(false), []);
  const handleUnpin = useCallback((e) => {
    e.stopPropagation();
    axios.patch(`/api/rooms/${selectedRoom?.id}/pin`, { messageId: null });
    setPinnedMessage(null);
  }, [selectedRoom]);
  const handleSearchToggle = useCallback(() => {
    setShowSearch(v => !v);
    setSearchQuery('');
    setSearchResults([]);
  }, []);
  const handleSearchReset = useCallback(() => {
    setShowSearch(false);
    setSearchSender('');
    setSearchDate('');
  }, []);
  const handleCloseMsgMenu = useCallback(() => setMsgMenu(null), []);
  const handleCloseConfirm = useCallback(() => setConfirmDialog(null), []);
  // モーダルclose系
  const handleSetChatBg = useCallback((bgId) => {
    setChatBg(bgId);
    localStorage.setItem('chatBg', bgId);
  }, []);
  const handleCloseReactionPicker = useCallback(() => setReactionPicker(null), []);
  const handleCloseForward = useCallback(() => setForwardMsg(null), []);
  const handleCloseEventCal = useCallback(() => setShowEventCal(false), []);
  const handleCloseStickerMaker = useCallback(() => setShowStickerMaker(false), []);
  const handleCloseMiniGame = useCallback(() => setShowMiniGame(false), []);
  const handleCloseAI = useCallback(() => setShowAI(false), []);
  const handleCloseTaskPanel = useCallback(() => setShowTaskPanel(false), []);
  const handleCloseUserProfile = useCallback(() => setShowUserProfile(null), []);
  const handleCloseMediaList = useCallback(() => setShowMediaList(false), []);
  const handleCloseStats = useCallback(() => setShowStats(false), []);
  const handleConfirmOk = useCallback(() => {
    confirmDialog?.onOk();
    setConfirmDialog(null);
  }, [confirmDialog]);

  // グローバル検索
  const handleGlobalSearch = useCallback(() => {
    if (!globalQuery.trim()) return;
    setGlobalSearching(true);
    axios.get('/api/search?q=' + encodeURIComponent(globalQuery))
      .then(r => { setGlobalResults(r.data); setGlobalSearching(false); })
      .catch(() => setGlobalSearching(false));
  }, [globalQuery]);
  const handleCloseGlobalSearch = useCallback(() => setShowGlobalSearch(false), []);
  const handleCloseFavorites = useCallback(() => setShowFavorites(false), []);
  const handleCloseCreateRoom = useCallback(() => setShowCreateRoom(false), []);
  const handleRoomCreated = useCallback((room) => {
    setRooms((prev) => prev.find(r => r.id === room.id) ? prev : [room, ...prev]);
    setSelectedRoom(room);
    setShowCreateRoom(false);
  }, []);

  // リアクション（msgMenu用）
  const handleReactFromMenu = useCallback((emoji) => {
    if (!msgMenu) return;
    socket?.emit('message:react', { messageId: msgMenu.msg.id, roomId: selectedRoom?.id, emoji });
    setMsgMenu(null);
  }, [msgMenu, socket, selectedRoom]);

  // 呼び出し系ボタン

  const renderMessage = useCallback((msg) => {
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
            <ErrorBoundary><Suspense fallback={<div style={{fontSize:13,color:'var(--text2)'}}>📊...</div>}><PollCard pollId={pollId} initialPoll={pollData} currentUser={currentUser} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }
    // 期限付きメッセージ
    if (msg.type === 'ephemeral') {
      return (
        <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`} style={{ marginBottom:6 }}>
          {!isMine && <div className="message-avatar">{msg.senderName?.[0] || '?'}</div>}
          <div className="message-body">
            {!isMine && <div className="message-sender">{msg.senderName}</div>}
            <EphemeralBubble msg={msg} isMine={isMine} />
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
              {new Date(msg.createdAt || msg.created_at).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}
            </span>
          </div>
        </div>
      );
    } else if (msg.type === 'stamp') {
      content = <span style={{ fontSize: 36 }}>{msg.content}</span>;
    } else if (msg.type === 'image' && (msg.fileData?.url || msg.file_data?.url)) {
      const rawUrl = msg.fileData?.url || msg.file_data?.url;
      const imgSrc = rawUrl?.startsWith('http') ? rawUrl : `${SERVER_URL}${rawUrl}`;
      content = <img src={imgSrc} alt="img" className="chat-image" loading="lazy" />;
    } else if (msg.type === 'file' && (msg.fileData?.url || msg.file_data?.url)) {
      const rawUrl = msg.fileData?.url || msg.file_data?.url;
      const fileUrl = rawUrl?.startsWith('http') ? rawUrl : `${SERVER_URL}${rawUrl}`;
      const ext = (rawUrl || '').split('.').pop().toLowerCase();
      const icons = { pdf:'📄', zip:'🗜️', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', mp4:'🎬', mov:'🎬', mp3:'🎵' };
      content = <a href={fileUrl} target="_blank" rel="noreferrer" className="chat-file-link" download style={{ display:'flex', alignItems:'center', gap:6 }}>{icons[ext]||'📎'} {msg.content}</a>;
    } else if (msg.type === 'voice') {
      content = <VoiceMessageBubble msg={msg} isMine={isMine} />;
    } else if (msg.type === 'location') {
      content = <LocationBubble msg={msg} isMine={isMine} />;
    } else if (msg.type === 'secret') {
      content = <SecretBubble msg={msg} isMine={isMine} />;
    } else {
      let decoStyle = {};
      if (msg.decoration) {
        try {
          const d = typeof msg.decoration === 'string' ? JSON.parse(msg.decoration) : msg.decoration;
          if (d.bold) decoStyle.fontWeight = 700;
          if (d.color) decoStyle.color = d.color;
          if (d.size === 'small') decoStyle.fontSize = '12px';
          if (d.size === 'large') decoStyle.fontSize = '18px';
        } catch(_) {}
      }
      if (msgStyleRef.current.font !== 'default') decoStyle.fontFamily = msgStyleRef.current.font;
      content = <span style={decoStyle}>{msg.content}</span>;
    }
    return (
      <div key={msg.id} id={`msg-${msg.id}`} data-msgid={msg.id} data-senderid={msg.senderId || msg.sender_id} className={`message ${isMine ? 'mine' : 'theirs'}`}
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
          onClick={() => setShowUserProfile({ id: msg.senderId, name: msg.senderName, username: msg.senderName, avatar: msg.senderAvatar })}>
          {msg.senderAvatar
            ? <img src={msg.senderAvatar.startsWith('http') ? msg.senderAvatar : `${SERVER_URL}${msg.senderAvatar}`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
            : <span style={{fontSize:15,fontWeight:700,color:isMine?'#fff':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>{msg.senderName?.[0] || '?'}</span>}
        </div>
        <div className="message-body">
          <div className="message-sender" style={{ color: isMine ? 'rgba(255,255,255,0.75)' : 'var(--text2)', textAlign: isMine ? 'right' : 'left' }}>{msg.senderName}</div>
          {msg.forwarded && (
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>📤 転送されたメッセージ</div>
          )}
          {(msg.replyTo || msg.reply_to) && (() => {
            const rt = msg.replyTo || msg.reply_to;
            return (
              <div className="reply-preview">
                <span className="reply-name">{rt.senderName}</span>
                <span className="reply-content">{rt.content?.slice(0, 40)}{rt.content?.length > 40 ? '...' : ''}</span>
              </div>
            );
          })()}
          <div style={{ position:'relative' }}>
            <div className="message-bubble">{content}
            {translatingRef.current[msg.id] && (
              <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid rgba(0,0,0,0.1)', fontSize:12, color: translatingRef.current[msg.id] === '翻訳中...' ? 'var(--text2)' : 'var(--text)', fontStyle:'italic' }}>
                🌐 {translatingRef.current[msg.id]}
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
                  onClick={() => { socket?.emit('message:react', { messageId: msg.id, roomId: selectedRoom.id, emoji }); }}>
                  {emoji} {users.length}
                </button>
              ))}
            </div>
          )}
          {emotions[msg.id] && (
            <div style={{ fontSize:18, textAlign: isMine ? 'right' : 'left', marginBottom:2, opacity:0.85 }}
              title="AI感情分析結果">
              {emotions[msg.id]}
            </div>
          )}
          {msg.edited && (
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:2, display:'flex', alignItems:'center', gap:4 }}>
              <button
                style={{ fontSize:11, color:'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline dotted' }}
                onClick={() => {
                  if (msg.edit_history?.length > 0) {
                    setShowEditHistory({ msgId: msg.id, history: msg.edit_history, current: msg.content });
                  } else {
                    socket?.emit('message:edit_history', { messageId: msg.id });
                    socket?.once('message:edit_history_result', ({ messageId, edit_history }) => {
                      if (messageId === msg.id) setShowEditHistory({ msgId: msg.id, history: edit_history, current: msg.content });
                    });
                  }
                }}
                title="編集履歴を見る"
              >✏️ 編集済み</button>
            </div>
          )}
          <div className="message-time">
            {isMine && (() => {
              const readCount = (msg.read_by || []).filter(id => id !== currentUser.id).length;
              return (
                <span
                  style={{ fontSize:11, color: readCount > 0 ? '#06c755' : 'var(--text2)', marginRight:4, fontWeight:600, cursor: readCount > 0 ? 'pointer' : 'default', display:'inline-flex', alignItems:'center', gap:1 }}
                  onClick={() => {
                    if (readCount === 0) return;
                    const detail = readByDetailMapRef.current[msg.id];
                    if (detail && detail.length > 0) {
                      const readers = detail.filter(r => r.id !== currentUser.id);
                      setShowReadDetail({ msgId: msg.id, readers });
                    } else {
                      const readers = (msg.read_by || []).filter(id => id !== currentUser.id).map(id => {
                        const member = selectedRoom?.memberDetails?.find(m => m.id === id);
                        return { id, name: member?.displayName || member?.username || id, avatar: member?.avatar };
                      });
                      setShowReadDetail({ msgId: msg.id, readers });
                    }
                  }}
                  title={readCount > 0 ? 'タップで詳細表示' : '未読'}
                >
                  {readCount > 0 ? (
                    <>{readCount > 1 ? `✓✓ ${readCount}` : '✓✓'}</>
                  ) : (
                    <span style={{opacity:0.4}}>✓</span>
                  )}
                </span>
              );
            })()}
            {time}
            <span className="reply-btn" onClick={() => setReplyTo(msg)}>↩</span>
          </div>
        </div>
      </div>
    );
  }, [currentUser, polls, selectedRoom, onlineUsers, bookmarks, socket, setReplyTo, showToast, soundTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // メッセージリスト全体をuseMemoでキャッシュ（messages/translating/editingMessage変化時のみ再計算）
  const renderedMessages = React.useMemo(() => {
    return messages.reduce((acc, msg, i) => {
      const d = new Date(msg.createdAt || msg.created_at);
      if (isNaN(d.getTime())) { acc.push(renderMessage(msg, i)); return acc; }
      const dateStr = d.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
      const prevMsg = messages[i - 1];
      const prevD = prevMsg ? new Date(prevMsg.createdAt || prevMsg.created_at) : null;
      const prevDate = prevD && !isNaN(prevD.getTime()) ? prevD.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }) : null;
      if (!prevDate || prevDate !== d.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })) {
        acc.push(<div key={`date-${i}`} className="date-divider">{dateStr}</div>);
      }
      acc.push(renderMessage(msg, i));
      return acc;
    }, []);
  }, [messages, renderMessage, translating]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <SystemNoticeBanner currentUser={currentUser} showToast={showToast} />
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
          <div style={{ display:'flex', gap:4 }}>
            <button className="icon-btn" onClick={() => setShowGlobalSearch(true)} style={{ fontSize:20, color:'white' }} title="全体検索">🔍</button>
            <button className="icon-btn" onClick={() => setShowCreateRoom(true)} style={{ fontSize:22, color:'white' }} title="新しいトーク">✏️</button>
          </div>
        </div>
        <StoryBar currentUser={currentUser} friendsList={friendsList} socket={socket} />
        <div className="room-items">
          {rooms.length === 0 && (
            <div className="room-empty">
              <div className="room-empty-icon">💬</div>
              <div className="room-empty-text">まだトークがないで！<br/>右上の ✏️ からトークを始めよう</div>
            </div>
          )}
          {React.useMemo(() => [...rooms].sort((a,b) => {
            const ap = pinnedRooms.includes(a.id) ? 1 : 0;
            const bp = pinnedRooms.includes(b.id) ? 1 : 0;
            if (ap !== bp) return bp - ap;
            const ta = new Date(a.lastActivity || a.lastMessage?.createdAt || 0).getTime();
            const tb = new Date(b.lastActivity || b.lastMessage?.createdAt || 0).getTime();
            return tb - ta;
          }).map((room) => {
            const lastMsg = room.lastMessage;
            // DMの場合は相手のアバターを表示
            const isDM = room.members?.length === 2;
            const otherMember = isDM ? room.memberDetails?.find(m => m.id !== currentUser?.id) : null;
            const roomAvatar = room.icon
              ? `${SERVER_URL}${room.icon}`
              : (isDM && otherMember?.avatar
                ? (otherMember.avatar.startsWith('http') ? otherMember.avatar : `${SERVER_URL}${otherMember.avatar}`)
                : null);
            const roomName = isDM && otherMember ? (otherMember.displayName || otherMember.username || room.name) : room.name;
            return (
              <div key={room.id} className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const isPinned = pinnedRooms.includes(room.id);
                  if (window.confirm(isPinned ? `「${roomName}」のピン留めを解除しますか？` : `「${roomName}」をピン留めしますか？`)) {
                    axios.post(`/api/rooms/${room.id}/pin`).then(res => {
                      const next = res.data.pinned
                        ? [...pinnedRooms, room.id]
                        : pinnedRooms.filter(id => id !== room.id);
                      setPinnedRooms(next);
                      localStorage.setItem('pinnedRooms', JSON.stringify(next));
                    }).catch(() => {});
                  }
                }}>
                <div style={{ position:'relative' }}>
                  <AvatarImg src={roomAvatar} name={roomName} size={40} frame="none" />
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
                      {pinnedRooms.includes(room.id) && <span style={{ fontSize:11, marginRight:3 }}>📌</span>}
                      {roomName}
                      {mutedRooms.has(room.id) && <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>🔕</span>}
                    </div>
                    {lastMsg?.createdAt && <div style={{ fontSize:11, color:'var(--text2)' }}>{new Date(lastMsg.createdAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</div>}
                  </div>
                  <div className={`room-last-msg ${unreadCounts[room.id] > 0 ? 'unread' : ''}`}>
                    {lastMsg?.type === 'stamp' ? '[スタンプ]' : lastMsg?.type === 'file' ? '[ファイル]' : lastMsg?.type === 'call_start' ? '📞 通話を開始しました' : lastMsg?.type === 'call_end' ? '📵 通話終了' : lastMsg?.content?.slice(0, 30) || ''}
                  </div>
                </div>
              </div>
            );
          }), [rooms, selectedRoom, currentUser, onlineUsers, unreadCounts, mutedRooms, pinnedRooms])}
        </div>
      </div>

      <div className={`message-area ${selectedRoom ? "visible" : ""}`}>
        {selectedRoom && <>
          <div className="chat-header">
            <button className="icon-btn back-btn" onClick={handleBackToList}>←</button>
            <div className="chat-header-name" onClick={handleOpenRoomSettings} style={{ cursor:'pointer' }}>
              {selectedRoom.name} <span style={{ fontSize:12, color:'var(--text2)' }}>⚙️</span>
            </div>
            <button className="icon-btn" onClick={handleSearchToggle}>🔍</button>
            <button className="icon-btn" onClick={() => setShowSuggestions(s => !s)} title="AI返信サジェスト" style={{ color: showSuggestions ? 'var(--primary)' : undefined }}>✨</button>
            <button className="call-icon-btn" onClick={() => {
              if (selectedRoom.members?.length > 2) {
                setGroupCall && setGroupCall({ roomId: selectedRoom.id, members: selectedRoom.members, roomName: selectedRoom.name });
              } else {
                const other = selectedRoom.members?.find(m => m !== currentUser.id);
                if(other) onCall({ roomId: selectedRoom.id, targetUserId: other, isCaller: true, offer: null });
              }
            }}>📞</button>
            <button className="icon-btn header-menu-btn" onClick={() => dispatchModal({ type: 'TOGGLE', key: 'showHeaderMenu' })} title="メニュー">⋯</button>
            {showHeaderMenu && (
              <div className="header-menu-dropdown" style={{ position:'absolute', top:'100%', right:0, zIndex:3000, background:'var(--surface)', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:320, maxHeight:'80dvh', overflowY:'auto', padding:'8px 0' }}
                onClick={e => e.stopPropagation()}>
                {/* このトーク */}
                <div style={{ padding:'8px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text2)', letterSpacing:1 }}>このトーク</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'4px 12px 8px' }}>
                  {[
                    { icon:'🔍', label:'検索', action: () => { setSearchQuery(''); setSearchResults([]); setShowSearch(true); } },
                    { icon:'📌', label:'ノート', action: () => setShowNote(true) },
                    { icon:'🖼️', label:'画像/動画', action: () => setShowMediaList(true) },
                    { icon:'📁', label:'ファイル', action: () => { axios.get('/api/rooms/' + selectedRoom.id + '/files').then(r => { setRoomFiles(r.data); setShowFileManager(true); }).catch(() => {}); } },
                    { icon: mutedRooms.has(selectedRoom.id)?'🔕':'🔔', label: mutedRooms.has(selectedRoom.id)?'ミュート解除':'ミュート', action: () => {
                      const isMuted = mutedRooms.has(selectedRoom.id);
                      if (isMuted) { axios.delete('/api/rooms/'+selectedRoom.id+'/mute'); setMutedRooms(prev=>{const n=new Set(prev);n.delete(selectedRoom.id);return n;}); }
                      else { axios.post('/api/rooms/'+selectedRoom.id+'/mute'); setMutedRooms(prev=>new Set([...prev,selectedRoom.id])); }
                    }},
                    { icon:'⭐', label:'重要', action: () => { axios.get('/api/favorites').then(r => { setFavoritesList(r.data); setShowFavorites(true); }).catch(() => {}); } },
                    { icon:'🔖', label:'後で読む', action: () => setShowReadLater(true) },
                    { icon:'📤', label:'エクスポート', action: () => setShowExport(true) },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowHeaderMenu(false); item.action(); }}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:12, border:'none', background:'var(--surface2)', cursor:'pointer', fontSize:11, color:'var(--text)', fontWeight:600 }}>
                      <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>

                {/* ツール */}
                <div style={{ height:1, background:'var(--border)', margin:'4px 12px' }} />
                <div style={{ padding:'8px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text2)', letterSpacing:1 }}>ツール</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'4px 12px 8px' }}>
                  {[
                    { icon:'📅', label:'カレンダー', action: () => setShowEventCal(true) },
                    { icon:'✅', label:'タスク', action: () => setShowTaskPanel(true) },
                    { icon:'⏰', label:'予約送信', action: () => { axios.get('/api/rooms/' + selectedRoom.id + '/schedules').then(r => { setScheduleList(r.data || []); setShowScheduleList(true); }).catch(() => setShowScheduleList(true)); } },
                    { icon:'📊', label:'統計', action: () => { axios.get('/api/rooms/' + selectedRoom.id + '/stats').then(r => { setRoomStats(r.data); setShowStats(true); }).catch(() => {}); } },
                    { icon:'💬', label:'クイック返信', action: () => setShowQuickReply(true) },
                    { icon:'🔤', label:'文字サイズ', action: () => { const s=['small','medium','large']; const n=s[(s.indexOf(fontSize)+1)%s.length]; setFontSize(n); axios.patch('/api/users/me',{font_size:n}).catch(()=>{}); showToast?.('文字サイズ変更: '+n,'success'); } },
                    { icon:'🌈', label:'背景', action: () => setShowBgPicker(true) },
                    { icon:'📞', label:'音声通話', action: () => {
                      if (selectedRoom?.members?.length > 2) { showToast?.('音声通話はDMのみやで','error'); return; }
                      const otherId = selectedRoom?.members?.find(m => m !== currentUser.id);
                      const otherDetail = selectedRoom?.memberDetails?.find(m => m.id === otherId);
                      setVoiceCall({ targetUser: otherId ? { id: otherId, displayName: otherDetail?.displayName || selectedRoom.name, avatar: otherDetail?.avatar } : null, isIncoming: false, roomId: selectedRoom?.id, callId: null });
                    } },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowHeaderMenu(false); item.action(); }}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:12, border:'none', background:'var(--surface2)', cursor:'pointer', fontSize:11, color:'var(--text)', fontWeight:600 }}>
                      <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>

                {/* AI */}
                <div style={{ height:1, background:'var(--border)', margin:'4px 12px' }} />
                <div style={{ padding:'8px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text2)', letterSpacing:1 }}>AI</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'4px 12px 8px' }}>
                  {[
                    { icon:'🤖', label:'アシスタント', action: () => setShowAI(true) },
                    { icon:'🔮', label:'AI占い', action: () => { setFortuneResult(null); setShowFortune(true); } },
                    { icon:'✅', label:'タスク抽出', action: () => { axios.post('/api/ai/extract-todos',{messages:messages.slice(-30)}).then(r=>{setExtractedTodos(r.data.todos||[]);setShowTodo(true);}).catch(()=>{setExtractedTodos([]);setShowTodo(true);}); } },
                    { icon:'🗣️', label:'会話練習', action: () => { setPracticeHistory([]); setShowPractice(true); } },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowHeaderMenu(false); item.action(); }}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:12, border:'none', background:'var(--surface2)', cursor:'pointer', fontSize:11, color:'var(--text)', fontWeight:600 }}>
                      <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>

                {/* エンタメ */}
                <div style={{ height:1, background:'var(--border)', margin:'4px 12px' }} />
                <div style={{ padding:'8px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text2)', letterSpacing:1 }}>エンタメ</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'4px 12px 8px' }}>
                  {[
                    { icon:'🎮', label:'ゲーム', action: () => setShowMiniGame(true) },
                    { icon:'🎰', label:'ルーレット', action: () => { setRouletteResult(null); setShowRoulette(true); } },
                    { icon:'🎰', label:'ボーナス', action: () => { axios.post('/api/daily-bonus').then(r=>{setDailyBonusResult(r.data);setShowDailyBonus(true);}).catch(()=>{}); } },
                    { icon:'🏆', label:'ランキング', action: () => { axios.get('/api/ranking?type=message').then(r=>{setRankingData(r.data);setShowRanking(true);}).catch(()=>{}); } },
                    { icon:'🖼️', label:'スタンプ作成', action: () => setShowStickerMaker(true) },
                    { icon:'🎵', label:'音楽シェア', action: () => setShowMusicShare(true) },
                    { icon:'🌍', label:'コミュニティ', action: () => { axios.get('/api/community/list').then(r=>{setCommunityList(r.data);setShowCommunity(true);}).catch(()=>{}); } },
                    ...(currentUser?.is_official||currentUser?.isOfficial ? [{ icon:'📣', label:'一斉送信', action: () => setShowBroadcast(true) }] : []),
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowHeaderMenu(false); item.action(); }}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:12, border:'none', background:'var(--surface2)', cursor:'pointer', fontSize:11, color:'var(--text)', fontWeight:600 }}>
                      <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>

                {/* 全体 */}
                <div style={{ height:1, background:'var(--border)', margin:'4px 12px' }} />
                <div style={{ padding:'8px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text2)', letterSpacing:1 }}>全体</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'4px 12px 12px' }}>
                  {[
                    { icon:'🔍', label:'全体検索', action: () => { setShowGlobalSearch(true); } },
                    { icon:'🏠', label:'ダッシュボード', action: () => onNavigate?.('dashboard') },
                    { icon:'📷', label:'アルバム', action: () => onNavigate?.('album') },
                    { icon:'👀', label:'アクティビティ', action: () => { axios.get('/api/friends/activities').then(r=>{setFriendActivities(r.data);setShowActivity(true);}).catch(()=>{}); } },
                    { icon:'🎂', label:'誕生日', action: () => { axios.get('/api/friends/birthdays').then(r=>{setBirthdayFriends(r.data);setShowBirthday(true);}).catch(()=>{}); } },
                    { icon:'📁', label:'フォルダ', action: () => { axios.get('/api/folders').then(r=>{setFolderList(r.data);setShowFolders(true);}).catch(()=>{}); } },
                    { icon:'🏅', label:'バッジ', action: () => { axios.get('/api/badges').then(r=>{setBadgeList(r.data);setShowBadges(true);}).catch(()=>{}); } },
                    { icon:'🎨', label:'テーマ', action: () => setShowTheme(true) },
                    { icon:'🌐', label:t('settings.language'), action: () => setShowLangModal(true) },
                    { icon:'🛒', label:'スタンプ販売所', action: () => {
                      axios.get('/api/stamp-market').then(r => { setStampMarketPacks(r.data); setShowStampMarket(true); }).catch(() => {});
                    }},
                    { icon:'🎮', label:'ゲームステータス', action: () => {
                      axios.get('/api/gamer-status/friends').then(r => setFriendGamingList(r.data)).catch(() => {});
                      setShowGamerStatus(true);
                    }},
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowHeaderMenu(false); item.action(); }}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:12, border:'none', background:'var(--surface2)', cursor:'pointer', fontSize:11, color:'var(--text)', fontWeight:600 }}>
                      <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {showNote && <Portal><ErrorBoundary><Suspense fallback={null}><Note room={selectedRoom} currentUser={currentUser} socket={socket} onClose={handleCloseNote} /></Suspense></ErrorBoundary></Portal>}
          <Portal>{showRoomSettings && (
            <div className="modal-overlay" onClick={handleCloseRoomSettings}>
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
                <RoomNameEditor room={selectedRoom} onClose={handleCloseRoomSettings} />

                {/* 友達招待 */}
                {selectedRoom && selectedRoom.type !== 'dm' && <FriendInviteSection roomId={selectedRoom.id} members={selectedRoom.members} friendsList={friendsList} showToast={showToast} />}

                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={handleCloseRoomSettings}>閉じる</button>
                </div>
              </div>
            </div>
          )}</Portal>
          <Portal>{msgMenu && (
            <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.4)' }} onClick={handleCloseMsgMenu}>
              {/* アクションリスト（ボトムシート） ※リアクションも統合 */}
              <div style={{
                position:'fixed', bottom:0, left:0, right:0,
                background:'var(--surface)',
                borderRadius:'20px 20px 0 0',
                overflow:'hidden', zIndex:3001,
                paddingBottom:'env(safe-area-inset-bottom)',
                boxShadow:'0 -4px 32px rgba(0,0,0,0.2)',
                animation:'slideUp 0.22s ease',
                maxHeight:'85dvh', overflowY:'auto'
              }} onClick={(e) => e.stopPropagation()}>
                {/* リアクションバー（ボトムシート上部に統合） */}
                <div style={{
                  display:'flex', gap:2, padding:'14px 12px 10px',
                  borderBottom:'1px solid var(--border)',
                  justifyContent:'center', flexWrap:'wrap'
                }}>
                  {QUICK_REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => { handleReactFromMenu(emoji); setMsgMenu(null); }}
                      style={{ fontSize:28, padding:'6px 8px', border:'none', background:'none', cursor:'pointer', borderRadius:12, WebkitTapHighlightColor:'transparent' }}>{emoji}
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
                  }} style={{ fontSize:22, padding:'6px 8px', border:'none', background:'none', cursor:'pointer', borderRadius:12, color:'var(--text2)', WebkitTapHighlightColor:'transparent' }}>🌐</button>
                </div>
                {[
                  { icon:'📌', label: pinnedMessage?.id === msgMenu.msg.id ? 'ピンを外す' : 'ピン留め', action: () => {
                    const newId = pinnedMessage?.id === msgMenu.msg.id ? null : msgMenu.msg.id;
                    axios.patch(`/api/rooms/${selectedRoom.id}/pin`, { messageId: newId });
                    setPinnedMessage(newId ? msgMenu.msg : null);
                  }},
                  { icon:'↩', label:'返信', action: () => setReplyTo(msgMenu.msg) },
                  { icon:'⚡', label:'TLDR', action: () => {
                    axios.post('/api/ai/tldr', { text: msgMenu.msg.content })
                      .then(r => { if(r.data?.result) alert(r.data.result); })
                      .catch(() => {});
                  }},
                  { icon:'🚨', label:'報告', action: () => setShowSpamReport({ id: msgMenu.msg.id, type: 'message', name: msgMenu.msg.senderName }) },
                  { icon:'🎭', label:'感情分析', action: () => {
                    const text = msgMenu.msg.content;
                    if (!text) return;
                    axios.post('/api/ai/emotion', { text }).then(r => {
                      if (r.data?.emoji) setEmotions(prev => ({ ...prev, [msgMenu.msg.id]: r.data.emoji }));
                    }).catch(() => {});
                  }},
                  { icon:'💬', label:'スレッド', action: () => {
                    setThreadMsg(msgMenu.msg);
                    axios.get('/api/threads/' + msgMenu.msg.id).then(r => setThreadMessages(r.data || [])).catch(() => setThreadMessages([]));
                  }},
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
                      appConfirm('送信を取り消しますか？', () => socket?.emit('message:delete', { roomId: selectedRoom.id, messageId: msgMenu.msg.id, recall: true }));
                    }},
                    { icon:'✏️', label:'編集', action: () => { setEditingMessage(msgMenu.msg); setEditText(msgMenu.msg.content || ''); } },
                    { icon:'🗑️', label:'削除', danger: true, action: () => {
                      appConfirm('このメッセージを削除しますか？', () => socket?.emit('message:delete', { roomId: selectedRoom.id, messageId: msgMenu.msg.id }));
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
          )}</Portal>
          {/* カスタム確認ダイアログ */}
      <Portal>{confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={handleCloseConfirm}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320, boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:20, textAlign:'center', lineHeight:1.6 }}>
              {confirmDialog.message}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={handleCloseConfirm}
                style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
                キャンセル
              </button>
              <button onClick={handleConfirmOk}
                style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}</Portal>
      {showEventCal && <Portal><ErrorBoundary><Suspense fallback={null}><EventCalendar room={selectedRoom} currentUser={currentUser} socket={socket} onClose={handleCloseEventCal} /></Suspense></ErrorBoundary></Portal>}
      {/* スタンプ自作 */}
      <Portal>{showStickerMaker && (
        <Portal><ErrorBoundary><Suspense fallback={null}>
          <StickerMaker
            onSend={(data) => {
              if (socket && selectedRoom) {
                socket?.emit('message:send', { roomId: selectedRoom.id, content: data.content, type: 'image', fileData: data.fileData });
                setShowStickerMaker(false);
              }
            }}
            onClose={handleCloseStickerMaker}
          />
        </Suspense></ErrorBoundary></Portal>
      )}</Portal>
      {showMiniGame && <Portal><ErrorBoundary><Suspense fallback={null}><MiniGame onSendResult={text => { socket?.emit('message:send', { roomId: selectedRoom?.id, content: text, type: 'text' }); sounds.send(soundTheme); }} onClose={handleCloseMiniGame} /></Suspense></ErrorBoundary></Portal>}
          <Portal>{showFavorites && (
            <div className="modal-overlay" onClick={handleCloseFavorites}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>
                <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>⭐ 重要メッセージ</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:12, color:'var(--text2)', background:'var(--surface2)', borderRadius:20, padding:'2px 10px' }}>{favoritesList.length}件</span>
                    <button onClick={handleCloseFavorites} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  </div>
                </div>
                <div style={{ overflowY:'auto', flex:1, padding:'8px 0' }}>
                  {favoritesList.length === 0
                    ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'40px 20px' }}>
                        <div style={{ fontSize:36, marginBottom:12 }}>⭐</div>
                        <div style={{ fontSize:14, fontWeight:600 }}>重要メッセージがまだないで</div>
                        <div style={{ fontSize:12, marginTop:4 }}>メッセージを長押し→ブックマークで追加できるで！</div>
                      </div>
                    : favoritesList.map((f, i) => {
                        const roomName = rooms.find(r => r.id === f.room_id)?.name || 'DM';
                        return (
                          <div key={f.message_id || i} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:11, background:'rgba(59,130,246,0.12)', color:'var(--primary)', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>{roomName}</span>
                                <span style={{ fontSize:11, color:'var(--text2)' }}>{f.sender_name}</span>
                              </div>
                              <div style={{ display:'flex', gap:8 }}>
                                <button
                                  onClick={() => {
                                    handleCloseFavorites();
                                    const room = rooms.find(r => r.id === f.room_id);
                                    if (room) {
                                      setSelectedRoom(room);
                                      setTimeout(() => {
                                        const el = document.getElementById('msg-' + f.message_id);
                                        if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
                                      }, 500);
                                    }
                                  }}
                                  style={{ fontSize:11, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:600 }}>
                                  ジャンプ
                                </button>
                                <button
                                  onClick={() => {
                                    axios.delete('/api/bookmarks/' + f.message_id).catch(() => {});
                                    setFavoritesList(prev => prev.filter(x => x.message_id !== f.message_id));
                                    setBookmarks(prev => { const n = new Set(prev); n.delete(f.message_id); return n; });
                                  }}
                                  style={{ fontSize:11, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                                  削除
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.5, wordBreak:'break-word',
                              display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                              {f.content || '[メディア]'}
                            </div>
                            {f.created_at && <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>{new Date(f.created_at).toLocaleDateString('ja-JP', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>}
                          </div>
                        );
                      })
                  }
                </div>
              </div>
            </div>
          )}</Portal>
          <Portal>{showGlobalSearch && (
            <div className="modal-overlay" onClick={handleCloseGlobalSearch}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'88vh', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>
                {/* ヘッダー */}
                <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <div style={{ fontWeight:700, fontSize:16 }}>🔍 グローバル検索</div>
                    <button onClick={handleCloseGlobalSearch} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="form-input" style={{ flex:1, marginBottom:0 }} value={globalQuery}
                      onChange={e => setGlobalQuery(e.target.value)} placeholder="メッセージ・ユーザー名で検索..."
                      onKeyDown={e => { if (e.key === 'Enter') handleGlobalSearch(); }} autoFocus />
                    <button className="btn btn-primary" style={{ padding:'0 16px', flexShrink:0 }} onClick={handleGlobalSearch}>検索</button>
                  </div>
                  {globalResults.length > 0 && !globalSearching && (
                    <div style={{ fontSize:12, color:'var(--text2)', marginTop:8 }}>{globalResults.length}件ヒット</div>
                  )}
                </div>
                {/* 結果 */}
                <div style={{ overflowY:'auto', flex:1 }}>
                  {globalSearching && (
                    <div style={{ textAlign:'center', color:'var(--text2)', padding:40 }}>
                      <div style={{ fontSize:24, marginBottom:8 }}>🔍</div>
                      <div>検索中...</div>
                    </div>
                  )}
                  {!globalSearching && globalResults.length === 0 && globalQuery && (
                    <div style={{ textAlign:'center', color:'var(--text2)', padding:40 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>😕</div>
                      <div style={{ fontSize:14, fontWeight:600 }}>見つからんかった</div>
                      <div style={{ fontSize:12, marginTop:4 }}>別のキーワードで試してみて</div>
                    </div>
                  )}
                  {!globalSearching && globalResults.length === 0 && !globalQuery && (
                    <div style={{ textAlign:'center', color:'var(--text2)', padding:40 }}>
                      <div style={{ fontSize:36, marginBottom:8 }}>🔍</div>
                      <div style={{ fontSize:14 }}>キーワードを入力して検索してな</div>
                    </div>
                  )}
                  {globalResults.map(msg => {
                    const roomName = msg.roomName || rooms.find(r => r.id === msg.roomId)?.name || 'DM';
                    // キーワードハイライト
                    const highlight = (text, q) => {
                      if (!q || !text) return text;
                      const idx = text.toLowerCase().indexOf(q.toLowerCase());
                      if (idx === -1) return text?.slice(0, 80);
                      const start = Math.max(0, idx - 20);
                      const end = Math.min(text.length, idx + q.length + 40);
                      return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
                    };
                    return (
                      <div key={msg.id}
                        onClick={() => {
                          setShowGlobalSearch(false);
                          const room = rooms.find(r => r.id === msg.roomId);
                          if (room) {
                            setSelectedRoom(room);
                            setTimeout(() => {
                              const el = document.getElementById(`msg-${msg.id}`);
                              if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
                            }, 600);
                          }
                        }}
                        style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:11, background:'rgba(59,130,246,0.12)', color:'var(--primary)', borderRadius:6, padding:'2px 8px', fontWeight:600, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{roomName}</span>
                            <span style={{ fontSize:11, color:'var(--text2)' }}>{msg.senderName}</span>
                          </div>
                          <span style={{ fontSize:11, color:'var(--text2)', flexShrink:0 }}>{new Date(msg.createdAt).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                        <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.5 }}>
                          {highlight(msg.content, globalQuery)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}</Portal>
          <Portal>{showAI && (
            <ErrorBoundary><Suspense fallback={null}><AIAssistant
              messages={messages.filter(m => m.type === 'text').slice(-50)}
              currentRoom={selectedRoom}
              onInsert={text => { setInputText(text); setShowAI(false); }}
              onClose={handleCloseAI}
            /></Suspense></ErrorBoundary>
          )}</Portal>
          <Portal>{showTaskPanel && (
            <ErrorBoundary><Suspense fallback={null}><TaskPanel room={selectedRoom} currentUser={currentUser} socket={socket} onClose={handleCloseTaskPanel} showToast={showToast} /></Suspense></ErrorBoundary>
          )}</Portal>
          <Portal>{showSchedule && (
            <div className="modal-overlay" onClick={() => setShowSchedule(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">⏰ スケジュール送信</div>
                <textarea className="form-input" value={scheduleText} onChange={e => setScheduleText(e.target.value)}
                  placeholder="送信するメッセージ..." style={{ minHeight:80, resize:'vertical' }} />
                <label className="form-label" style={{ marginTop:8 }}>送信日時</label>
                <input type="datetime-local" className="form-input" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowSchedule(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!scheduleText.trim() || !scheduleAt) { showToast?.('メッセージと送信日時を入力してね', 'error'); return; }
                    const sendTime = new Date(scheduleAt);
                    if (sendTime <= new Date()) { showToast?.('送信日時は未来の日時を指定してね', 'error'); return; }
                    try {
                      await axios.post('/api/rooms/' + selectedRoom.id + '/schedule', { content: scheduleText.trim(), sendAt: scheduleAt });
                      showToast?.('予約送信を設定したで！⏰', 'success');
                      setShowSchedule(false); setScheduleText(''); setScheduleAt('');
                    } catch(e) { showToast?.('予約の設定に失敗した...', 'error'); }
                  }}>予約する</button>
                </div>
              </div>
            </div>
          )}</Portal>

          {/* 予約送信一覧 */}
          <Portal>{showScheduleList && (
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
          )}</Portal>

          {/* チャットエクスポート */}
          <Portal>{showExport && (
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
          )}</Portal>

          {/* 通知設定モーダル */}
          <Portal>{showNotifSettings && selectedRoom && (
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
          )}</Portal>

          <Portal>{showPollCreator && (
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
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, marginBottom:12 }}>
                  <input type="checkbox" checked={pollFreeText} onChange={e => setPollFreeText(e.target.checked)} />
                  記述回答を許可 ✏️
                </label>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowPollCreator(false)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={async () => {
                    const opts = pollOptions.filter(o => o.trim());
                    if (!pollQuestion.trim() || opts.length < 2) { showToast?.('質問と選択肢を2つ以上入力してね', 'error'); return; }
                    try {
                      await axios.post('/api/rooms/' + selectedRoom.id + '/polls', { question: pollQuestion.trim(), options: opts, multi: pollMulti, allow_free_text: pollFreeText });
                      showToast?.('投票を作成したで！', 'success');
                    } catch(e) { showToast?.('投票の作成に失敗した...', 'error'); return; }
                    setShowPollCreator(false); setPollQuestion(''); setPollOptions(['', '']); setPollMulti(false); setPollFreeText(false);
                  }}>作成</button>
                </div>
              </div>
            </div>
          )}</Portal>
          {/* 既読詳細モーダル */}


          {/* @WakkaBOT ヒント（入力欄にWakkaBOTと打ったとき） */}
          {/* スレッドパネル（Slackライク） */}
          {threadMsg && (
            <div style={{
              position:'fixed', right:0, top:0, bottom:0, width:'min(360px, 100vw)',
              background:'var(--bg)', borderLeft:'1px solid var(--border)',
              zIndex:800, display:'flex', flexDirection:'column',
              boxShadow:'-4px 0 20px rgba(0,0,0,0.15)'
            }}>
              <div style={{ padding:'16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={() => setThreadMsg(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text2)' }}>✕</button>
                <div style={{ fontWeight:700, fontSize:15 }}>💬 スレッド</div>
              </div>
              {/* 親メッセージ */}
              <div style={{ padding:'12px 16px', background:'var(--surface)', borderBottom:'1px solid var(--border)', margin:'0' }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>{threadMsg.senderName}</div>
                <div style={{ fontSize:14, color:'var(--text)' }}>{threadMsg.content}</div>
              </div>
              {/* スレッド返信一覧 */}
              <div style={{ flex:1, overflowY:'auto', padding:'8px 16px' }}>
                {threadMessages.length === 0
                  ? <p style={{ color:'var(--text2)', fontSize:13, textAlign:'center', margin:'24px 0' }}>まだ返信がないで！</p>
                  : threadMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom:12, display:'flex', gap:8, alignItems:'flex-start' }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--primary)', color:'white', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {m.senderName?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:2 }}>{m.senderName}</div>
                        <div style={{ fontSize:14, color:'var(--text)', background:'var(--surface)', borderRadius:10, padding:'8px 12px', display:'inline-block', maxWidth:260 }}>{m.content}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
              {/* 入力欄 */}
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
                <input
                  value={threadInput}
                  onChange={e => setThreadInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && threadInput.trim()) {
                      e.preventDefault();
                      socket?.emit('thread:send', { parentId: threadMsg.id, roomId: selectedRoom?.id, content: threadInput.trim() });
                      setThreadInput('');
                    }
                  }}
                  placeholder="返信を入力..."
                  className="form-input"
                  style={{ flex:1, fontSize:14 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding:'8px 14px' }}
                  onClick={() => {
                    if (!threadInput.trim()) return;
                    socket?.emit('thread:send', { parentId: threadMsg.id, roomId: selectedRoom?.id, content: threadInput.trim() });
                    setThreadInput('');
                  }}
                >送信</button>
              </div>
            </div>
          )}
          {/* オフラインバナー */}
          {!isOnline && (
            <div style={{
              position:'fixed', top:0, left:0, right:0, zIndex:9999,
              background:'#e53e3e', color:'white', textAlign:'center',
              padding:'8px', fontSize:13, fontWeight:600
            }}>
              📵 オフライン中 - メッセージは接続後に送信されるで
            </div>
          )}
          {/* WakkaBOT処理中インジケーター */}
          {wakkabotLoading && (
            <div style={{
              position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:20, padding:'10px 18px', zIndex:9998,
              boxShadow:'0 4px 20px rgba(0,0,0,0.15)',
              display:'flex', alignItems:'center', gap:8, fontSize:14
            }}>
              <span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>⚙️</span>
              WakkaBOTが考え中...
            </div>
          )}



          {/* ===== 会話練習モード ===== */}
          <Portal>{showPractice && (
            <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:3000, display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={() => setShowPractice(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text2)' }}>✕</button>
                <div style={{ fontWeight:700, fontSize:16 }}>🗣️ 会話練習モード</div>
              </div>
              <div style={{ display:'flex', gap:6, padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                {[['english','🇺🇸 英会話'],['keigo','🎩 敬語'],['casual','😄 タメ口']].map(([m,l]) => (
                  <button key={m} onClick={() => { setPracticeMode(m); setPracticeHistory([]); }} style={{
                    flex:1, padding:'8px 4px', borderRadius:10, fontSize:12, fontWeight:600,
                    background: practiceMode===m ? 'var(--primary)' : 'var(--surface2)',
                    color: practiceMode===m ? 'white' : 'var(--text)', border:'none', cursor:'pointer'
                  }}>{l}</button>
                ))}
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                {practiceHistory.length === 0 && (
                  <div style={{ textAlign:'center', color:'var(--text2)', fontSize:14, marginTop:40 }}>
                    {practiceMode==='english' ? '英語で話しかけてみよう！' : practiceMode==='keigo' ? '敬語で話しかけてみよう！' : 'タメ口で話しかけてみよう！'}
                  </div>
                )}
                {practiceHistory.map((m, i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth:'80%', padding:'10px 14px', borderRadius: m.role==='user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role==='user' ? 'var(--primary)' : 'var(--surface2)',
                      color: m.role==='user' ? 'white' : 'var(--text)', fontSize:14, lineHeight:1.6
                    }}>{m.content}</div>
                  </div>
                ))}
                {practiceLoading && <div style={{ color:'var(--text2)', fontSize:13 }}>AIが考え中...</div>}
              </div>
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, paddingBottom:'calc(12px + env(safe-area-inset-bottom))' }}>
                <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey && practiceInput.trim()) {
                    e.preventDefault();
                    const msg = practiceInput.trim();
                    setPracticeInput('');
                    const newHistory = [...practiceHistory, { role:'user', content: msg }];
                    setPracticeHistory(newHistory);
                    setPracticeLoading(true);
                    axios.post('/api/ai/practice', { mode: practiceMode, message: msg, history: practiceHistory })
                      .then(r => { setPracticeHistory(h => [...h, { role:'assistant', content: r.data.result }]); })
                      .catch(() => {}).finally(() => setPracticeLoading(false));
                  }}}
                  placeholder={practiceMode==='english' ? 'Type in English...' : 'メッセージを入力...'}
                  className="form-input" style={{ flex:1, fontSize:14 }} />
                <button className="btn btn-primary" style={{ padding:'8px 16px' }} onClick={() => {
                  const msg = practiceInput.trim();
                  if (!msg) return;
                  setPracticeInput('');
                  const newHistory = [...practiceHistory, { role:'user', content: msg }];
                  setPracticeHistory(newHistory);
                  setPracticeLoading(true);
                  axios.post('/api/ai/practice', { mode: practiceMode, message: msg, history: practiceHistory })
                    .then(r => { setPracticeHistory(h => [...h, { role:'assistant', content: r.data.result }]); })
                    .catch(() => {}).finally(() => setPracticeLoading(false));
                }}>送信</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== フォルダ整理 ===== */}
          <Portal>{showFolders && (
            <div className="modal-overlay" onClick={() => setShowFolders(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
                <div className="modal-title">📁 トークフォルダ</div>
                <div style={{ maxHeight:300, overflowY:'auto', marginBottom:12 }}>
                  {folderList.length === 0
                    ? <p style={{ textAlign:'center', color:'var(--text2)', fontSize:13, margin:'20px 0' }}>フォルダがまだないで</p>
                    : folderList.map(f => (
                      <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:24 }}>{f.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{f.name}</div>
                          <div style={{ fontSize:12, color:'var(--text2)' }}>{f.roomIds?.length || 0}件のトーク</div>
                        </div>
                        <button onClick={() => axios.delete('/api/folders/' + f.id).then(() => setFolderList(prev => prev.filter(x => x.id !== f.id))).catch(() => {})}
                          style={{ background:'none', border:'none', color:'var(--danger,#e53e3e)', cursor:'pointer', fontSize:18 }}>🗑️</button>
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={() => {
                  const name = prompt('フォルダ名を入力してな');
                  if (!name) return;
                  axios.post('/api/folders', { name, icon:'📁' }).then(r => setFolderList(prev => [...prev, r.data])).catch(() => {});
                }}>＋ 新しいフォルダを作る</button>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowFolders(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== アクティビティフィード ===== */}
          <Portal>{showActivity && (
            <div className="modal-overlay" onClick={() => setShowActivity(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
                <div className="modal-title">👀 友達のアクティビティ</div>
                <div style={{ maxHeight:360, overflowY:'auto' }}>
                  {friendActivities.length === 0
                    ? <p style={{ textAlign:'center', color:'var(--text2)', fontSize:13, margin:'24px 0' }}>アクティビティ中の友達がおらんで</p>
                    : friendActivities.map(u => (
                      <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, overflow:'hidden', flexShrink:0 }}>
                          {u.avatar ? <img src={u.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (u.display_name?.[0] || u.username?.[0])}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{u.display_name || u.username}</div>
                          <div style={{ fontSize:13, color:'var(--primary)' }}>{u.current_activity}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowActivity(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== PCショートカット一覧（?キーで表示） ===== */}
          {/* ===== メッセージ検索 ===== */}
          <Portal>{showSearch && (
            <div className="modal-overlay" onClick={() => setShowSearch(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
                <div className="modal-title">🔍 メッセージ検索</div>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter' && searchQuery.trim()) {
                      axios.get('/api/rooms/' + selectedRoom?.id + '/search?q=' + encodeURIComponent(searchQuery))
                        .then(r => setSearchResults(r.data)).catch(() => {});
                    }}}
                    placeholder="キーワードを入力..." className="form-input" style={{ flex:1 }} autoFocus />
                  <button className="btn btn-primary" onClick={() => {
                    if (!searchQuery.trim()) return;
                    axios.get('/api/rooms/' + selectedRoom?.id + '/search?q=' + encodeURIComponent(searchQuery))
                      .then(r => setSearchResults(r.data)).catch(() => {});
                  }}>検索</button>
                </div>
                <div style={{ maxHeight:360, overflowY:'auto' }}>
                  {searchResults.length === 0
                    ? <p style={{ textAlign:'center', color:'var(--text2)', fontSize:13, margin:'20px 0' }}>検索結果なし</p>
                    : searchResults.map(m => (
                      <div key={m.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                          {m.senderName} · {new Date(m.createdAt).toLocaleDateString('ja-JP')}
                        </div>
                        <div style={{ fontSize:14, color:'var(--text)' }}>{m.content}</div>
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowSearch(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== AI占い ===== */}
          <Portal>{showFortune && (
            <div className="modal-overlay" onClick={() => setShowFortune(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
                <div className="modal-title">🔮 今日の運勢</div>
                <select value={fortuneSign} onChange={e => setFortuneSign(e.target.value)} className="form-input" style={{ marginBottom:12 }}>
                  {['牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座','天秤座','蠍座','射手座','山羊座','水瓶座','魚座'].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:12 }} onClick={() => {
                  setFortuneResult('読み込み中...');
                  axios.get('/api/ai/fortune?sign=' + fortuneSign)
                    .then(r => setFortuneResult(r.data.result))
                    .catch(() => setFortuneResult('占いに失敗したで'));
                }}>占う！</button>
                {fortuneResult && (
                  <div style={{ background:'var(--surface2)', borderRadius:12, padding:14, fontSize:14, lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                    {fortuneResult}
                  </div>
                )}
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowFortune(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== AI ToDo抽出 ===== */}
          <Portal>{showTodo && (
            <div className="modal-overlay" onClick={() => setShowTodo(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
                <div className="modal-title">✅ AI タスク抽出</div>
                {extractedTodos.length === 0
                  ? <p style={{ textAlign:'center', color:'var(--text2)', margin:'20px 0', fontSize:14 }}>タスクが見つからんかったで</p>
                  : extractedTodos.map((t, i) => (
                    <div key={i} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                      <div style={{ fontSize:18, flexShrink:0 }}>📌</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:'var(--text)' }}>{t.task}</div>
                        {(t.who || t.deadline) && (
                          <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                            {t.who && `👤 ${t.who}`} {t.deadline && `📅 ${t.deadline}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowTodo(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== ルーレット ===== */}
          <Portal>{showRoulette && (
            <div className="modal-overlay" onClick={() => setShowRoulette(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:300, textAlign:'center' }}>
                <div className="modal-title">🎰 ルーレット</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>グループからランダムで1人を選ぶで！</div>
                {rouletteResult
                  ? <>
                      <div style={{ fontSize:56, marginBottom:8 }}>🎯</div>
                      <div style={{ fontSize:22, fontWeight:800, color:'var(--primary)', marginBottom:4 }}>{rouletteResult}</div>
                      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>に決まったで！</div>
                    </>
                  : <div style={{ fontSize:56, marginBottom:16 }}>🎰</div>
                }
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={() => {
                  axios.get('/api/rooms/' + selectedRoom?.id + '/roulette')
                    .then(r => setRouletteResult(r.data.username))
                    .catch(() => {});
                }}>まわす！</button>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowRoulette(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== 誕生日 ===== */}
          <Portal>{showBirthday && (
            <div className="modal-overlay" onClick={() => setShowBirthday(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
                <div className="modal-title">🎂 誕生日</div>
                {birthdayFriends?.today?.length > 0 && (
                  <div style={{ background:'var(--color-background-warning)', borderRadius:12, padding:12, marginBottom:12 }}>
                    <div style={{ fontWeight:700, marginBottom:6, fontSize:14 }}>🎉 今日が誕生日！</div>
                    {birthdayFriends.today.map(u => (
                      <div key={u.id} style={{ fontSize:14 }}>🎁 {u.display_name || u.username}</div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>自分の誕生日を設定</div>
                <select className="form-input" style={{ marginBottom:8 }}
                  onChange={e => axios.patch('/api/users/me/birthday', { birthday: e.target.value }).catch(() => {})}>
                  <option value="">選択してください</option>
                  {Array.from({length:12}, (_,i) => i+1).map(m =>
                    Array.from({length:31}, (_,d) => d+1).map(d => {
                      const val = String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                      return <option key={val} value={val}>{m}月{d}日</option>;
                    })
                  )}
                </select>
                <div style={{ fontSize:13, fontWeight:600, margin:'12px 0 8px' }}>友達の誕生日一覧</div>
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  {(birthdayFriends?.all || []).map(u => (
                    <div key={u.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                      <span>{u.display_name || u.username}</span>
                      <span style={{ color:'var(--text2)' }}>{u.birthday?.replace('-', '月')}日</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowBirthday(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== コミュニティ ===== */}
          <Portal>{showCommunity && (
            <div className="modal-overlay" onClick={() => setShowCommunity(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
                <div className="modal-title">🌍 オープンコミュニティ</div>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <input id="community-code" placeholder="招待コードを入力" className="form-input" style={{ flex:1 }} />
                  <button className="btn btn-primary" onClick={() => {
                    const code = document.getElementById('community-code').value.trim();
                    if (!code) return;
                    axios.get('/api/community/join/' + code)
                      .then(r => { alert(r.data.roomName + 'に参加したで！'); setShowCommunity(false); })
                      .catch(() => alert('コードが間違っとるで'));
                  }}>参加</button>
                </div>
                <div style={{ maxHeight:300, overflowY:'auto', marginBottom:12 }}>
                  {communityList.length === 0
                    ? <p style={{ textAlign:'center', color:'var(--text2)', fontSize:13, margin:'20px 0' }}>コミュニティがまだないで</p>
                    : communityList.map(c => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ fontSize:28, flexShrink:0 }}>{c.icon || '🌍'}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                          <div style={{ fontSize:12, color:'var(--text2)' }}>{c.memberCount}人 · コード: {c.invite_code}</div>
                        </div>
                        <button className="btn btn-primary" style={{ fontSize:12, padding:'6px 10px' }}
                          onClick={() => axios.get('/api/community/join/' + c.invite_code).then(() => setShowCommunity(false)).catch(() => {})}>
                          参加
                        </button>
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowCommunity(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== スパム報告 ===== */}
          <Portal>{showSpamReport && (
            <div className="modal-overlay" onClick={() => setShowSpamReport(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:340 }}>
                <div className="modal-title">🚨 報告する</div>
                <div style={{ fontSize:14, color:'var(--text2)', marginBottom:12 }}>
                  「{showSpamReport.name}」を報告しますか？
                </div>
                <textarea id="report-reason" placeholder="理由を入力（任意）" className="form-input" style={{ minHeight:80, marginBottom:12 }} />
                <button className="btn btn-danger" style={{ width:'100%', marginBottom:8 }} onClick={() => {
                  const reason = document.getElementById('report-reason').value;
                  axios.post('/api/report', { targetId: showSpamReport.id, targetType: showSpamReport.type, reason })
                    .then(() => { alert('報告を受け付けたで'); setShowSpamReport(null); })
                    .catch(() => {});
                }}>報告する</button>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowSpamReport(null)}>キャンセル</button>
              </div>
            </div>
          )}</Portal>
          {/* ===== デイリーボーナスモーダル ===== */}
          <Portal>{showDailyBonus && dailyBonusResult && (
            <div className="modal-overlay" onClick={() => setShowDailyBonus(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:320, textAlign:'center' }}>
                {dailyBonusResult.already ? (
                  <>
                    <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
                    <div className="modal-title">今日はもう受け取ったで！</div>
                    <div style={{ color:'var(--text2)', fontSize:14, marginBottom:16 }}>明日またくてや👋</div>
                    <div style={{ fontSize:13, color:'var(--text2)' }}>連続ログイン: {dailyBonusResult.streak}日🔥</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:48, marginBottom:8 }}>🎰</div>
                    <div className="modal-title">ボーナスゲット！</div>
                    <div style={{ fontSize:40, fontWeight:800, color:'var(--primary)', margin:'12px 0' }}>+{dailyBonusResult.coinsEarned}コイン</div>
                    <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
                      基本: {dailyBonusResult.baseCoins}コイン ＋ 連続ボーナス: {dailyBonusResult.streakBonus}コイン
                    </div>
                    <div style={{ fontSize:13, color:'var(--primary)', fontWeight:600, marginBottom:16 }}>
                      🔥 {dailyBonusResult.streak}日連続ログイン！
                    </div>
                    <div style={{ fontSize:14, color:'var(--text2)' }}>残高: {dailyBonusResult.coins}コイン</div>
                  </>
                )}
                <button className="btn btn-primary" style={{ width:'100%', marginTop:16 }} onClick={() => setShowDailyBonus(false)}>やったで！</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== ランキングモーダル ===== */}
          <Portal>{showRanking && (
            <div className="modal-overlay" onClick={() => setShowRanking(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
                <div className="modal-title">🏆 ランキング</div>
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                  {[['message','💬 メッセ'], ['coins','💰 コイン'], ['streak','🔥 連続'], ['badges','🏅 バッジ']].map(([type, label]) => (
                    <button key={type} onClick={() => {
                      setRankingType(type);
                      axios.get('/api/ranking?type=' + type).then(r => setRankingData(r.data)).catch(() => {});
                    }} style={{
                      flex:1, padding:'8px 4px', borderRadius:8, fontSize:12, fontWeight:600,
                      background: rankingType === type ? 'var(--primary)' : 'var(--surface2)',
                      color: rankingType === type ? 'white' : 'var(--text)',
                      border:'none', cursor:'pointer'
                    }}>{label}</button>
                  ))}
                </div>
                <div style={{ maxHeight:360, overflowY:'auto' }}>
                  {rankingData.map((u, i) => (
                    <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:28, textAlign:'center', fontWeight:800, fontSize:16,
                        color: i===0?'#FFD700': i===1?'#C0C0C0': i===2?'#CD7F32':'var(--text2)' }}>
                        {i===0?'🥇': i===1?'🥈': i===2?'🥉': i+1}
                      </div>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--primary)', color:'white', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {u.username?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:14 }}>{u.username}</div>
                        <div style={{ fontSize:12, color:'var(--text2)' }}>
                          {rankingType==='message' && `${u.message_count}メッセージ`}
                          {rankingType==='coins' && `${u.coins}コイン`}
                          {rankingType==='streak' && `${u.login_streak}日連続`}
                          {rankingType==='badges' && `${u.badge_count}バッジ`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowRanking(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== ファイル管理モーダル ===== */}
          <Portal>{showFileManager && (
            <div className="modal-overlay" onClick={() => setShowFileManager(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
                <div className="modal-title">📁 ファイル管理</div>
                <div style={{ maxHeight:400, overflowY:'auto' }}>
                  {roomFiles.length === 0
                    ? <p style={{ textAlign:'center', color:'var(--text2)', margin:'24px 0' }}>ファイルがまだないで</p>
                    : roomFiles.map((f, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ fontSize:28 }}>
                          {f.type==='image'?'🖼️': f.type==='video'?'🎥': f.type==='audio'?'🎵':'📄'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {f.content || 'ファイル'}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text2)' }}>
                            {new Date(f.created_at).toLocaleDateString('ja-JP')}
                          </div>
                        </div>
                        {f.content && (
                          <a href={f.content.startsWith('http') ? f.content : `${window.location.origin}${f.content}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:12, color:'var(--primary)', textDecoration:'none', padding:'4px 10px', border:'1px solid var(--primary)', borderRadius:8 }}>
                            開く
                          </a>
                        )}
                      </div>
                    ))
                  }
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowFileManager(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== グループ統計モーダル ===== */}
          <Portal>{showStats && roomStats && (
            <div className="modal-overlay" onClick={() => setShowStats(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
                <div className="modal-title">📊 グループ統計</div>
                <div style={{ textAlign:'center', marginBottom:16 }}>
                  <div style={{ fontSize:36, fontWeight:800, color:'var(--primary)' }}>{roomStats.total}</div>
                  <div style={{ fontSize:13, color:'var(--text2)' }}>総メッセージ数</div>
                </div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontWeight:600, marginBottom:8, fontSize:14 }}>👑 送信数ランキング</div>
                  {roomStats.ranking?.map((u, i) => (
                    <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ width:20, fontSize:13, color:'var(--text2)' }}>{i+1}</span>
                      <span style={{ flex:1, fontSize:14 }}>{u.name}</span>
                      <div style={{ background:'var(--primary)', height:8, borderRadius:4, width: Math.max(8, (u.count / roomStats.total * 120)) + 'px' }} />
                      <span style={{ fontSize:13, color:'var(--text2)', minWidth:30, textAlign:'right' }}>{u.count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontWeight:600, marginBottom:8, fontSize:14 }}>🕐 時間帯別アクティビティ</div>
                  <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:60 }}>
                    {roomStats.byHour?.map((count, h) => {
                      const max = Math.max(...roomStats.byHour, 1);
                      return (
                        <div key={h} title={`${h}時: ${count}件`} style={{ flex:1, background:'var(--primary)', opacity: 0.3 + (count/max)*0.7, borderRadius:'2px 2px 0 0', height: Math.max(4, (count/max*56)) + 'px' }} />
                      );
                    })}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text2)', marginTop:2 }}>
                    <span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>23時</span>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowStats(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== 通知音設定モーダル ===== */}
          <Portal>{showNotifSound && (
            <div className="modal-overlay" onClick={() => setShowNotifSound(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:340 }}>
                <div className="modal-title">🔔 通知音設定</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {[['default','🔔 デフォルト'], ['bell','🔔 ベル'], ['chime','🎵 チャイム'], ['pop','💬 ポップ'], ['none','🔕 通知なし']].map(([val, label]) => (
                    <button key={val} onClick={() => setNotifSound(val)} style={{
                      padding:'12px', borderRadius:10, textAlign:'left', fontSize:14,
                      background: notifSound===val ? 'var(--primary)' : 'var(--surface2)',
                      color: notifSound===val ? 'white' : 'var(--text)',
                      border:'none', cursor:'pointer', fontWeight: notifSound===val ? 700 : 400
                    }}>{label} {notifSound===val && '✓'}</button>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={() => {
                  axios.patch('/api/rooms/' + selectedRoom?.id + '/notification', { sound: notifSound }).catch(() => {});
                  setShowNotifSound(false);
                }}>保存する</button>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowNotifSound(false)}>キャンセル</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== 音楽シェアモーダル ===== */}
          <Portal>{showMusicShare && (
            <div className="modal-overlay" onClick={() => setShowMusicShare(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
                <div className="modal-title">🎵 音楽をシェア</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>
                  SpotifyやYouTubeのURLを貼るとリッチに表示されるで
                </div>
                <input value={musicUrl} onChange={e => setMusicUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="form-input" style={{ marginBottom:12 }} />
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={() => {
                  if (!musicUrl.trim()) return;
                  socket?.emit('message:send', { roomId: selectedRoom?.id, content: `🎵 ${musicUrl.trim()}`, type: 'text' });
                  setMusicUrl('');
                  setShowMusicShare(false);
                }}>シェアする</button>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowMusicShare(false)}>キャンセル</button>
              </div>
            </div>
          )}</Portal>

          {/* ===== スタンプマーケットプレイス ===== */}
          <Portal>{showStampMarket && (
            <div className="modal-overlay" onClick={() => setShowStampMarket(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}
                style={{ maxWidth:480, maxHeight:'80vh', overflowY:'auto' }}>
                <div className="modal-title">🛒 スタンプ販売所</div>
                <p style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>
                  クリエイターが作ったスタンプをコインで購入できるで！
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {stampMarketPacks.length === 0
                    ? <div style={{ textAlign:'center', padding:24, color:'var(--text2)' }}>
                        まだスタンプがないで。最初のクリエイターになろう！
                      </div>
                    : stampMarketPacks.map(pack => (
                      <div key={pack.id} style={{
                        border:'1.5px solid var(--border)', borderRadius:14,
                        padding:'12px 14px', display:'flex', gap:12, alignItems:'center',
                      }}>
                        <div style={{ fontSize:32, flexShrink:0 }}>
                          {pack.stamps?.[0]?.emoji || '📦'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:14 }}>{pack.title}</div>
                          <div style={{ fontSize:12, color:'var(--text2)' }}>
                            by {pack.creator_name} · {pack.stamps?.length || 0}個
                          </div>
                          <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                            {pack.avg_rating && `⭐ ${pack.avg_rating}`} {pack.sales_count > 0 && `· ${pack.sales_count}件購入`}
                          </div>
                        </div>
                        <div style={{ textAlign:'center', flexShrink:0 }}>
                          <div style={{ fontWeight:800, color: pack.price === 0 ? '#06c755' : '#ff9500', fontSize:15 }}>
                            {pack.price === 0 ? '無料' : `${pack.price}💰`}
                          </div>
                          {pack.purchased
                            ? <div style={{ fontSize:11, color:'#06c755', fontWeight:700 }}>✓ 購入済み</div>
                            : <button onClick={() => {
                                if (!window.confirm(`「${pack.title}」を${pack.price}コインで購入しますか？`)) return;
                                axios.post(`/api/stamp-market/${pack.id}/buy`)
                                  .then(() => {
                                    alert('購入完了！スタンプが使えるようになったで🎉');
                                    axios.get('/api/stamp-market').then(r => setStampMarketPacks(r.data)).catch(() => {});
                                  })
                                  .catch(e => alert(e.response?.data?.error || '購入失敗'));
                              }} style={{
                                background:'#06c755', color:'white', border:'none',
                                borderRadius:8, padding:'4px 10px', fontSize:12,
                                cursor:'pointer', marginTop:4, fontWeight:700,
                              }}>購入する</button>
                          }
                        </div>
                      </div>
                    ))
                  }
                </div>
                <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>🎨 自分のスタンプを出品する</div>
                  <p style={{ fontSize:12, color:'var(--text2)' }}>
                    スタンプを出品してコインを稼ごう！<br/>
                    売上の80%がクリエイターに還元されるで。
                  </p>
                  <button onClick={() => { setShowStampMarket(false); setShowStickerMaker(true); }}
                    style={{ marginTop:8, padding:'10px 16px', background:'#5856d6', color:'white',
                      border:'none', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    ✏️ スタンプを作る・出品する
                  </button>
                </div>
              </div>
            </div>
          )}</Portal>

          {/* ===== ゲーマーステータス ===== */}
          <Portal>{showGamerStatus && (
            <div className="modal-overlay" onClick={() => setShowGamerStatus(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
                <div className="modal-title">🎮 ゲーマーステータス</div>

                {/* 自分のステータス設定 */}
                <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border)', marginBottom:12 }}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:'var(--text)' }}>自分のステータス</div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                      <input type="checkbox" checked={gamerStatusData.is_gaming}
                        onChange={e => {
                          const v = { ...gamerStatusData, is_gaming: e.target.checked };
                          setGamerStatusData(v);
                          axios.post('/api/gamer-status', v).catch(() => {});
                        }} style={{ width:18, height:18, accentColor:'#06c755' }} />
                      <span style={{ fontSize:14, fontWeight:600 }}>ゲーム中</span>
                    </label>
                    <span style={{ fontSize:22 }}>{gamerStatusData.game_emoji}</span>
                  </div>
                  {gamerStatusData.is_gaming && (
                    <input value={gamerStatusData.game_name}
                      onChange={e => {
                        const v = { ...gamerStatusData, game_name: e.target.value };
                        setGamerStatusData(v);
                      }}
                      onBlur={() => axios.post('/api/gamer-status', gamerStatusData).catch(() => {})}
                      placeholder="プレイ中のゲーム名（例：Minecraft）"
                      style={{ marginTop:8, width:'100%', padding:'8px 12px',
                        border:'1.5px solid var(--border)', borderRadius:10,
                        fontSize:13, background:'var(--surface)', color:'var(--text)' }}
                    />
                  )}
                </div>

                {/* 友達のゲーミング状況 */}
                <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:'var(--text)' }}>🕹️ 今ゲーム中の友達</div>
                {friendGamingList.length === 0
                  ? <div style={{ color:'var(--text2)', fontSize:13, padding:'8px 0' }}>
                      今ゲーム中の友達はいないみたい
                    </div>
                  : friendGamingList.map(s => (
                    <div key={s.user_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                      <img src={s.user?.avatar || '/default-avatar.png'} alt=""
                        style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }} />
                      <div>
                        <div style={{ fontWeight:600, fontSize:13, color:'var(--text)' }}>{s.user?.display_name || s.user?.username}</div>
                        <div style={{ fontSize:12, color:'#06c755' }}>
                          {s.game_emoji} {s.game_name || 'ゲーム中'}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}</Portal>

          {/* ===== E2E暗号化設定 ===== */}
          <Portal>{showLangModal && false && ( // 将来的にE2E設定モーダルをここに
            <div></div>
          )}</Portal>


          {/* ===== 言語設定モーダル ===== */}
          <Portal>{showLangModal && (
            <div className="modal-overlay" onClick={() => setShowLangModal(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:320 }}>
                <div className="modal-title">🌐 {t('settings.language_select')}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
                  {SUPPORTED_LANGS.map(lang => (
                    <button key={lang.code}
                      onClick={() => { i18nInstance.changeLanguage(lang.code); localStorage.setItem('wc_lang', lang.code); setShowLangModal(false); }}
                      style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                        borderRadius:12, border: i18nInstance.language === lang.code ? '2px solid #06c755' : '1.5px solid var(--border)',
                        background: i18nInstance.language === lang.code ? '#f0fff6' : 'var(--surface)',
                        cursor:'pointer', fontSize:15, fontWeight: i18nInstance.language === lang.code ? 700 : 400,
                        color:'var(--text)',
                      }}>
                      <span style={{ fontSize:24 }}>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {i18nInstance.language === lang.code && <span style={{ marginLeft:'auto', color:'#06c755', fontSize:18 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}</Portal>

          {/* ===== テーマ設定モーダル ===== */}
          <Portal>{showTheme && (
            <div className="modal-overlay" onClick={() => setShowTheme(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
                <div className="modal-title">🎨 テーマカスタマイズ</div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>テーマカラー</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
                    {[
                      ['#667eea','紫'],['#06b6d4','水色'],['#10b981','緑'],
                      ['#f59e0b','オレンジ'],['#ef4444','赤'],['#ec4899','ピンク'],
                      ['#8b5cf6','バイオレット'],['#14b8a6','ティール'],['#f97316','オレンジ2'],['#6366f1','インディゴ']
                    ].map(([color, name]) => (
                      <button key={color} title={name} onClick={() => {
                        document.documentElement.style.setProperty('--primary', color);
                        axios.patch('/api/users/me/theme', { primaryColor: color }).catch(() => {});
                      }} style={{
                        width:'100%', aspectRatio:'1', borderRadius:12, background:color,
                        border:'3px solid transparent', cursor:'pointer',
                        boxShadow:'0 2px 8px rgba(0,0,0,0.2)'
                      }} />
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>フォント</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[
                      ['default','デフォルト（システム）'],
                      ['serif','明朝体'],
                      ['"Comic Sans MS"','丸文字'],
                    ].map(([font, label]) => (
                      <button key={font} onClick={() => {
                        document.documentElement.style.setProperty('--font', font);
                        axios.patch('/api/users/me/theme', { fontFamily: font }).catch(() => {});
                      }} style={{
                        padding:'10px 14px', borderRadius:10, textAlign:'left', fontSize:14,
                        fontFamily: font === 'default' ? 'inherit' : font,
                        background:'var(--surface2)', color:'var(--text)',
                        border:'none', cursor:'pointer'
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setShowTheme(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>
          {/* バッジ獲得トースト */}
          {badgeToast && (
            <div style={{
              position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
              background:'linear-gradient(135deg, #667eea, #764ba2)', color:'white',
              borderRadius:16, padding:'12px 20px', zIndex:9999,
              boxShadow:'0 8px 32px rgba(0,0,0,0.3)', animation:'slideUp 0.4s ease',
              textAlign:'center', minWidth:200
            }}>
              <div style={{ fontSize:28, marginBottom:4 }}>🏆</div>
              <div style={{ fontWeight:700, fontSize:15 }}>新バッジ獲得！</div>
              <div style={{ fontSize:13, opacity:0.9, marginTop:2 }}>{badgeToast}</div>
            </div>
          )}
          {/* バッジ一覧モーダル */}
          <Portal>{showBadges && (
            <div className="modal-overlay" onClick={() => setShowBadges(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
                <div className="modal-title">🏅 バッジ一覧</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxHeight:400, overflowY:'auto' }}>
                  {badgeList.map(b => (
                    <div key={b.id} style={{
                      padding:'12px', borderRadius:12, border: b.acquired ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: b.acquired ? 'var(--surface)' : 'var(--surface2)', opacity: b.acquired ? 1 : 0.5,
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4, textAlign:'center'
                    }}>
                      <span style={{ fontSize:28, filter: b.acquired ? 'none' : 'grayscale(1)' }}>{b.emoji}</span>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{b.label}</div>
                      <div style={{ fontSize:11, color:'var(--text2)' }}>{b.desc}</div>
                      {b.acquired && <div style={{ fontSize:10, color:'var(--primary)', fontWeight:700 }}>✓ 獲得済み</div>}
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowBadges(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>
          <Portal>{showEditHistory && (
            <div className="modal-overlay" onClick={() => setShowEditHistory(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
                <div className="modal-title">✏️ 編集履歴</div>
                <div style={{ maxHeight:320, overflowY:'auto' }}>
                  {showEditHistory.history.length === 0
                    ? <p style={{ color:'var(--text2)', fontSize:13, textAlign:'center', margin:'16px 0' }}>履歴がないで</p>
                    : [...showEditHistory.history].reverse().map((h, i) => (
                      <div key={i} style={{ borderBottom:'1px solid var(--border)', padding:'10px 0' }}>
                        <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>
                          {new Date(h.edited_at).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                          {i === 0 ? ' （最新の前）' : ''}
                        </div>
                        <div style={{ fontSize:14, color:'var(--text)', background:'var(--surface2)', borderRadius:8, padding:'8px 10px' }}>{h.content}</div>
                      </div>
                    ))
                  }
                  <div style={{ borderTop:'2px solid var(--primary)', paddingTop:10, marginTop:4 }}>
                    <div style={{ fontSize:11, color:'var(--primary)', marginBottom:4, fontWeight:600 }}>現在のメッセージ</div>
                    <div style={{ fontSize:14, color:'var(--text)', background:'var(--surface2)', borderRadius:8, padding:'8px 10px' }}>{showEditHistory.current}</div>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowEditHistory(null)}>閉じる</button>
              </div>
            </div>
          )}</Portal>
          <Portal>{showReadDetail && (
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
          )}</Portal>

          {/* ユーザープロフィールモーダル */}
          <Portal>{showUserProfile && (
            <ErrorBoundary><Suspense fallback={null}>
              <UserProfile
                username={showUserProfile.name}
                currentUser={currentUser}
                onClose={handleCloseUserProfile}
                onStartChat={async (user) => {
                  const res = await axios.post('/api/rooms/dm', { targetUserId: user.id || showUserProfile.id }).catch(() => null);
                  if (res?.data) { setRooms(prev => prev.find(r => r.id === res.data.id) ? prev : [res.data, ...prev]); setSelectedRoom(res.data); }
                  setShowUserProfile(null);
                }}
                onCall={(user) => { onCall({ roomId: null, targetUserId: user.id || showUserProfile.id, isCaller: true, offer: null }); setShowUserProfile(null); }}
                onVoiceCall={(user) => { setVoiceCall({ targetUser: user, isIncoming: false, callId: null, roomId: null }); setShowUserProfile(null); }}
              />
            </Suspense></ErrorBoundary>
          )}</Portal>

          {/* グループメンバー管理モーダル */}
          <Portal>{showMemberMgr && selectedRoom && (
            <div className="modal-overlay" onClick={() => setShowMemberMgr(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflow:'auto' }}>
                <div className="modal-title">👥 メンバー管理</div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>{selectedRoom.members?.length}人</div>
                {selectedRoom.members?.map(mid => {
                  // memberDetailsから詳細情報を取得
                  const detail = selectedRoom.memberDetails?.find(d => d.id === mid);
                  const friend = friendsList.find(f => (f.id || f._id) === mid);
                  const name = detail?.displayName || detail?.username || friend?.display_name || friend?.username
                    || (mid === currentUser?.id ? (currentUser?.displayName || currentUser?.username) : '(不明なユーザー)');
                  const avatar = detail?.avatar || friend?.avatar;
                  const isCreator = mid === selectedRoom.creator_id;
                  const isMe = mid === currentUser.id;
                  const amCreator = currentUser.id === selectedRoom.creator_id;
                  return (
                    <div key={mid} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                        {avatar
                          ? <img src={avatar.startsWith('http') ? avatar : `${SERVER_URL}${avatar}`} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : name?.[0] || '?'
                        }
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
          )}</Portal>

          {/* メディア一覧モーダル */}
          <Portal>{showMediaList && (
            <MediaListModal
              roomId={selectedRoom?.id}
              serverUrl={SERVER_URL}
              onClose={handleCloseMediaList}
            />
          )}</Portal>
          <Portal>{showAnnounce && (
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
          )}</Portal>
          <Portal>{showBookmarks && (
            <div className="modal-overlay" onClick={() => setShowBookmarks(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', overflow:'auto' }}>
                <div className="modal-title">🔖 ブックマーク</div>
                {bookmarkedMsgs.length === 0
                  ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'20px 0' }}>ブックマークがまだないで</div>
                  : bookmarkedMsgs.map(msg => (
                    <div key={msg.id || msg._id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>{msg.sender_name || msg.senderName} · {new Date(msg.created_at || msg.createdAt).toLocaleDateString('ja-JP')}</div>
                      <div style={{ fontSize:14 }}>{msg.type === 'stamp' ? '[スタンプ]' : msg.type === 'image' ? '[画像]' : msg.content}</div>
                      <button style={{ fontSize:11, color:'var(--danger)', marginTop:4, background:'none', border:'none', cursor:'pointer', padding:0 }} onClick={() => {
                        const msgId = msg.id || msg._id;
                        axios.delete('/api/bookmarks/' + msgId).catch(() => {});
                        setBookmarks(prev => { const n = new Set(prev); n.delete(msgId); return n; });
                        setBookmarkedMsgs(prev => prev.filter(m => (m.id || m._id) !== msgId));
                      }}>削除</button>
                    </div>
                  ))
                }
                <button className="btn btn-secondary" style={{ width:'100%', marginTop:12 }} onClick={() => setShowBookmarks(false)}>閉じる</button>
              </div>
            </div>
          )}</Portal>
          <Portal>{showBgPicker && (() => {
            const BG_PRESETS = [
              {id:"default",label:"デフォルト",bg:"var(--bg)"},
              {id:"#ffffff",label:"☁️ 白",bg:"#ffffff"},
              {id:"#1a1a2e",label:"🌌 深夜",bg:"#1a1a2e"},
              {id:"#fef3e2",label:"🌅 温かみ",bg:"#fef3e2"},
              {id:"#e8f5e9",label:"🌿 グリーン",bg:"#e8f5e9"},
              {id:"#e3f2fd",label:"☀️ スカイ",bg:"#e3f2fd"},
              {id:"#f3e5f5",label:"💜 ラベンダー",bg:"#f3e5f5"},
              {id:"#fff8e1",label:"🌻 サンシャイン",bg:"#fff8e1"},
              {id:"linear-gradient(135deg,#667eea,#764ba2)",label:"🔮 パープル",bg:"linear-gradient(135deg,#667eea,#764ba2)"},
              {id:"linear-gradient(135deg,#f093fb,#f5576c)",label:"🌸 ピンク",bg:"linear-gradient(135deg,#f093fb,#f5576c)"},
              {id:"linear-gradient(135deg,#4facfe,#00f2fe)",label:"🌊 オーシャン",bg:"linear-gradient(135deg,#4facfe,#00f2fe)"},
              {id:"linear-gradient(135deg,#43e97b,#38f9d7)",label:"🍃 ミント",bg:"linear-gradient(135deg,#43e97b,#38f9d7)"},
              {id:"linear-gradient(135deg,#fa709a,#fee140)",label:"🌈 サンセット",bg:"linear-gradient(135deg,#fa709a,#fee140)"},
              {id:"linear-gradient(135deg,#30cfd0,#330867)",label:"🌙 オーロラ",bg:"linear-gradient(135deg,#30cfd0,#330867)"},
              {id:"linear-gradient(135deg,#a8edea,#fed6e3)",label:"🍬 キャンディ",bg:"linear-gradient(135deg,#a8edea,#fed6e3)"},
              {id:"linear-gradient(135deg,#ffecd2,#fcb69f)",label:"🍊 ピーチ",bg:"linear-gradient(135deg,#ffecd2,#fcb69f)"},
            ];
            return (
              <div className="modal-overlay" onClick={() => setShowBgPicker(false)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, fontSize:16 }}>🎨 背景を変更</div>
                    <button onClick={() => setShowBgPicker(false)} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  </div>
                  <div style={{ overflowY:'auto', flex:1, padding:16 }}>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8, fontWeight:600 }}>プリセット</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
                      {BG_PRESETS.map(bg => (
                        <div key={bg.id} onClick={() => { handleSetChatBg(bg.id); setShowBgPicker(false); }}
                          style={{
                            height:72, borderRadius:12, cursor:'pointer', position:'relative', overflow:'hidden',
                            background: bg.bg,
                            border: chatBg === bg.id ? '3px solid var(--primary)' : '2px solid var(--border)',
                            boxSizing:'border-box',
                          }}>
                          <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'4px 4px', background:'rgba(0,0,0,0.35)', borderRadius:'0 0 10px 10px', fontSize:10, color:'#fff', fontWeight:600, textAlign:'center', lineHeight:1.3 }}>{bg.label}</div>
                          {chatBg === bg.id && <div style={{ position:'absolute', top:4, right:4, fontSize:14 }}>✅</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8, fontWeight:600 }}>カスタム画像URL</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <input className="form-input" style={{ flex:1, marginBottom:0, fontSize:13 }}
                        value={customBgUrl} onChange={e => setCustomBgUrl(e.target.value)}
                        placeholder="https://... の画像URLを入力" />
                      <button className="btn btn-primary" style={{ padding:'0 14px', flexShrink:0 }}
                        onClick={() => { if (customBgUrl.trim()) { handleSetChatBg(customBgUrl.trim()); setCustomBgUrl(''); setShowBgPicker(false); } }}>
                        適用
                      </button>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text2)', marginTop:6 }}>※ 背景は自分のみに反映されるで</div>
                    {chatBg !== 'default' && (
                      <button onClick={() => { handleSetChatBg('default'); setShowBgPicker(false); }}
                        style={{ width:'100%', marginTop:12, padding:10, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                        🔄 デフォルトに戻す
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}</Portal>
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
                      socket?.emit('message:edit', { roomId: selectedRoom.id, messageId: editingMessage.id, content: editText.trim() });
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
                            fileData: forwardMsg.fileData || forwardMsg.file_data || null,
                          });
                          setForwardMsg(null);
                          showToast?.(`${room.name} に転送したで！`, 'success');
                        } catch(e) { console.error(e); showToast?.('転送に失敗した...', 'error'); }
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
                  <button className="btn btn-secondary" onClick={handleCloseForward}>キャンセル</button>
                </div>
              </div>
            </div>
          )}
          <Portal>{reactionPicker && (
            <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.3)' }} onClick={handleCloseReactionPicker}>
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
                    socket?.emit('message:react', { messageId: reactionPicker.msgId, roomId: selectedRoom.id, emoji });
                    setReactionPicker(null);
                  }} style={{ fontSize:26, background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:10, WebkitTapHighlightColor:'transparent', transition:'transform 0.1s' }}
                    onMouseEnter={e => e.target.style.transform='scale(1.3)'}
                    onMouseLeave={e => e.target.style.transform='scale(1)'}
                  >{emoji}</button>
                ))}
              </div>
            </div>
          )}</Portal>
          <Portal>{showSearch && (
            <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:2000, display:'flex', flexDirection:'column' }}>
              <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
                  <button onClick={handleSearchReset} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => {
                      const q = e.target.value;
                      setSearchQuery(q);
                      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                      if (!q.trim() && !searchSender && !searchDate) { setSearchResults([]); return; }
                      searchDebounceRef.current = setTimeout(async () => {
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
                      }, 300);
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
                      {msg.content?.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === searchQuery.toLowerCase()
                          ? <mark key={i} style={{ background:'#ffeb3b', color:'#000', borderRadius:2 }}>{part}</mark>
                          : part
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}</Portal>
          {pinnedMessage && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--surface)', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
              onClick={() => { const el = document.getElementById(`msg-${pinnedMessage.id}`); el?.scrollIntoView({ behavior:'smooth', block:'center' }); }}>
              <span style={{ fontSize:16 }}>📌</span>
              <div style={{ flex:1, overflow:'hidden' }}>
                <div style={{ fontSize:11, color:'var(--primary)', fontWeight:700 }}>ピン留め</div>
                <div style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{pinnedMessage.content}</div>
              </div>
              <button onClick={handleUnpin}
                style={{ fontSize:16, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          )}
          <div className="messages-container"
            ref={messagesContainerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              isAtBottomRef.current = atBottom;
              if (atBottom) setNewMsgCount(0);
              // 上端近くで過去メッセージ読み込み
              if (el.scrollTop < 60) loadMoreMessages();
            }}
            style={chatBg !== 'default' ? (() => {
              if (chatBg.startsWith('#')) return { backgroundColor: chatBg };
              if (chatBg.startsWith('linear-gradient') || chatBg.startsWith('radial-gradient')) return { backgroundImage: chatBg };
              return { backgroundImage: `url(${chatBg})`, backgroundSize:'cover', backgroundPosition:'center' };
            })() : {}}>
            {renderedMessages}
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                <span className="typing-dots"><span/><span/><span/></span>
                <span style={{ marginLeft:6 }}>{typingUsers.join(', ')} が入力中</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          {/* 新着メッセージジャンプボタン */}
          {newMsgCount > 0 && (
            <div style={{ position:'absolute', bottom:70, left:0, right:0, display:'flex', justifyContent:'center', zIndex:10, pointerEvents:'none' }}>
              <button
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior:'smooth' });
                  setNewMsgCount(0);
                }}
                style={{ pointerEvents:'auto', padding:'8px 20px', borderRadius:20, background:'var(--primary)', color:'white', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, boxShadow:'0 4px 16px rgba(0,0,0,0.25)', display:'flex', alignItems:'center', gap:6 }}>
                ⬇ 新着{newMsgCount}件
              </button>
            </div>
          )}
          {/* AI返信サジェスト */}
          {showSuggestions && (
            <div style={{ padding:'8px 12px', borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:6, overflowX:'auto', flexShrink:0 }}>
              <button onClick={async () => {
                if (suggLoading) return;
                setSuggLoading(true);
                try {
                  const res = await axios.post('/api/ai/assist', { type: 'suggest', messages: messages.slice(-15) });
                  const lines = (res.data.result || '').split('\n').filter(l => /^\d+\./.test(l.trim()));
                  setAiSuggestions(lines.map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean).slice(0,3));
                } catch { setAiSuggestions([]); }
                setSuggLoading(false);
              }} style={{ flexShrink:0, padding:'6px 12px', borderRadius:20, background:'rgba(59,130,246,0.12)', color:'var(--primary)', border:'1px solid rgba(59,130,246,0.25)', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                {suggLoading ? '⏳' : '✨ AI提案'}
              </button>
              {aiSuggestions.map((s, i) => (
                <button key={i} onClick={() => { setInputText(s); setShowSuggestions(false); setAiSuggestions([]); }}
                  style={{ flexShrink:0, padding:'6px 12px', borderRadius:20, background:'var(--surface2)', color:'var(--text)', border:'1px solid var(--border)', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis' }}>
                  {s}
                </button>
              ))}
              <button onClick={() => { setShowSuggestions(false); setAiSuggestions([]); }}
                style={{ flexShrink:0, marginLeft:'auto', padding:'6px 10px', borderRadius:20, background:'none', color:'var(--text2)', border:'none', fontSize:14, cursor:'pointer' }}>✕</button>
            </div>
          )}
          <InputArea
            inputText={inputText}
            handleTyping={handleTyping}
            handleSend={handleSend}
            handleFileUpload={handleFileUpload}
            handleMentionSelect={handleMentionSelect}
            handleSendStamp={handleSendStamp}
            mentionSuggestions={mentionSuggestions}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            fileInputRef={fileInputRef}
            showInputMenu={showInputMenu}
            setShowInputMenu={setShowInputMenu}
            showStampPanel={showStampPanel}
            setShowStampPanel={setShowStampPanel}
            showVoice={showVoice}
            showLocation={showLocation}
            showSecret={showSecret}
            showStylePicker={showStylePicker}
            setShowStylePicker={setShowStylePicker}
            msgStyle={msgStyle}
            setMsgStyle={setMsgStyle}
            lang={lang}
            setLang={setLang}
            setShowVoice={setShowVoice}
            setShowLocation={setShowLocation}
            setShowSecret={setShowSecret}
            setShowPollCreator={setShowPollCreator}
            setShowSchedule={setShowSchedule}
            setScheduleText={setScheduleText}
            selectedRoom={selectedRoom}
            socket={socket}
            currentUser={currentUser}
            soundTheme={soundTheme}
            myStampSets={myStampSets}
            allStampSets={allStampSets}
            acquiredStampIds={acquiredStampIds}
            showToast={showToast}
            showDecoration={showDecoration}
            setShowDecoration={setShowDecoration}
            decoration={decoration}
            setDecoration={setDecoration}
          />
        </>}
        {!selectedRoom && <div className="no-room-selected"><div>💬</div><p>トークを選択してください</p></div>}
      </div>

      <Portal>{showStats && selectedRoom && (
        <ErrorBoundary><Suspense fallback={null}>
          <ChatStats roomId={selectedRoom.id} roomName={selectedRoom.name} onClose={handleCloseStats} />
        </Suspense></ErrorBoundary>
      )}</Portal>
      <Portal>{showCreateRoom && (
        <ErrorBoundary><Suspense fallback={null}><CreateRoom
          currentUser={currentUser}
          friendsList={friendsList}
          onOpen={() => { /* friendsList はCreateRoom内でAPIから自動取得 */ }}
          onClose={handleCloseCreateRoom}
          onCreated={handleRoomCreated}
        /></Suspense></ErrorBoundary>
      )}</Portal>

      {/* 共有ホワイトボード */}
      {showWhiteboard && selectedRoom && (
        <ErrorBoundary><Suspense fallback={null}>
          <SharedWhiteboard socket={socket} roomId={selectedRoom.id} onClose={() => setShowWhiteboard(false)} />
        </Suspense></ErrorBoundary>
      )}

      {/* クイック返信 */}
      {showQuickReply && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowQuickReply(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'80vh', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>
              <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontWeight:700, fontSize:16 }}>💬 クイック返信</div>
                <button onClick={() => setShowQuickReply(false)} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ overflowY:'auto', flex:1, padding:'8px 16px' }}>
                {quickReplies.length === 0 && (
                  <div style={{ textAlign:'center', color:'var(--text2)', padding:'24px 0', fontSize:13 }}>
                    よく使うフレーズを登録してな！<br/>ワンタップで送信できるで
                  </div>
                )}
                {quickReplies.map((qr, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <button onClick={() => {
                      setInputText(prev => prev + qr);
                      setShowQuickReply(false);
                    }} style={{ flex:1, textAlign:'left', padding:'8px 12px', borderRadius:10, background:'var(--surface2)', border:'none', cursor:'pointer', fontSize:14, color:'var(--text)' }}>
                      {qr}
                    </button>
                    <button onClick={() => {
                      const next = quickReplies.filter((_, j) => j !== i);
                      setQuickReplies(next);
                      localStorage.setItem('quickReplies', JSON.stringify(next));
                    }} style={{ fontSize:14, color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px' }}>🗑️</button>
                  </div>
                ))}
              </div>
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
                <div style={{ display:'flex', gap:8 }}>
                  <input className="form-input" style={{ flex:1, marginBottom:0, fontSize:14 }}
                    value={newQuickReply} onChange={e => setNewQuickReply(e.target.value)}
                    placeholder="フレーズを入力..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newQuickReply.trim()) {
                        const next = [...quickReplies, newQuickReply.trim()];
                        setQuickReplies(next);
                        localStorage.setItem('quickReplies', JSON.stringify(next));
                        setNewQuickReply('');
                      }
                    }} />
                  <button className="btn btn-primary" onClick={() => {
                    if (!newQuickReply.trim()) return;
                    const next = [...quickReplies, newQuickReply.trim()];
                    setQuickReplies(next);
                    localStorage.setItem('quickReplies', JSON.stringify(next));
                    setNewQuickReply('');
                  }}>追加</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div>
    </>
  );
}

const InputArea = React.memo(function InputArea({
  inputText, handleTyping, handleSend, handleFileUpload, handleMentionSelect,
  handleSendStamp, mentionSuggestions, replyTo, setReplyTo,
  fileInputRef, showInputMenu, setShowInputMenu,
  showStampPanel, setShowStampPanel, showVoice, showLocation, showSecret,
  showStylePicker, setShowStylePicker, msgStyle, setMsgStyle, lang, setLang,
  setShowVoice, setShowLocation, setShowSecret,
  setShowPollCreator, setShowSchedule, setScheduleText,
  selectedRoom, socket, currentUser, soundTheme, myStampSets, allStampSets, acquiredStampIds, showToast,
  showDecoration, setShowDecoration, decoration, setDecoration,
}) {
  return (
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
      {showVoice && <ErrorBoundary><VoiceMessage roomId={selectedRoom.id} currentUser={currentUser} socket={socket} onSent={() => setShowVoice(false)} onCancel={() => setShowVoice(false)} /></ErrorBoundary>}
      {/* 位置情報 */}
      {showLocation && <ErrorBoundary><LocationShare socket={socket} roomId={selectedRoom.id} currentUser={currentUser} onSent={() => setShowLocation(false)} onCancel={() => setShowLocation(false)} /></ErrorBoundary>}
      {/* 秘密メッセージ */}
      {showSecret && <ErrorBoundary><Suspense fallback={null}><SecretMessage socket={socket} roomId={selectedRoom.id} currentUser={currentUser} onSent={() => setShowSecret(false)} onCancel={() => setShowSecret(false)} /></Suspense></ErrorBoundary>}
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
      {/* ✨ デコレーションパネル */}
      {showDecoration && (
        <div style={{ padding:'8px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', background:'var(--surface)' }}>
          <button onClick={() => setDecoration(d => ({ ...d, bold: !d.bold }))}
            style={{ fontWeight:700, padding:'4px 12px', borderRadius:8, border:'1px solid var(--border)', background: decoration.bold ? 'var(--primary)' : 'none', color: decoration.bold ? 'white' : 'var(--text)', cursor:'pointer' }}>B</button>
          {['', '#e53e3e','#38a169','#3182ce','#d69e2e','#805ad5'].map(c => (
            <button key={c} onClick={() => setDecoration(d => ({ ...d, color: c }))}
              style={{ width:24, height:24, borderRadius:'50%', background: c || 'var(--text)', border: decoration.color===c ? '3px solid var(--primary)' : '2px solid var(--border)', cursor:'pointer' }} />
          ))}
          {[['small','小'],['medium','中'],['large','大']].map(([s,l]) => (
            <button key={s} onClick={() => setDecoration(d => ({ ...d, size: s }))}
              style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background: decoration.size===s ? 'var(--primary)' : 'none', color: decoration.size===s ? 'white' : 'var(--text)', fontSize:12, cursor:'pointer' }}>{l}</button>
          ))}
        </div>
      )}
      <div className="input-row">
    <button className="plus-btn icon-btn" onClick={() => setShowInputMenu(v=>!v)} title="その他">
      {showInputMenu ? '✕' : '➕'}
    </button>
    <button className="icon-btn" onClick={() => setShowStampPanel(!showStampPanel)} title="スタンプ">🎫</button>
    <button className="icon-btn" onClick={() => setShowDecoration(v => !v)} title="デコレーション" style={{ color: showDecoration ? 'var(--primary)' : 'var(--text2)' }}>✨</button>
    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,video/*,audio/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleFileUpload} />
    <textarea className="message-input" value={inputText} onChange={handleTyping}
      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
      placeholder={lang === "en" ? "Type a message..." : lang === "zh" ? "输入消息..." : lang === "ko" ? "메시지 입력..." : "メッセージを入力..."} rows={1} />
    <button className="send-btn" onClick={handleSend} disabled={!inputText.trim()}>➤</button>
      </div>
      {showInputMenu && (
    <div className="input-menu-grid" style={{
      position:'fixed', left:0, right:0,
      bottom: 'calc(env(safe-area-inset-bottom) + 56px)',
      zIndex:3000, background:'var(--surface)',
      borderTop:'1px solid var(--border)',
      display:'grid', gridTemplateColumns:'repeat(4,1fr)',
      boxShadow:'0 -4px 16px rgba(0,0,0,0.12)',
      animation:'menuSlideUp 0.2s ease',
    }}>
      {/* ファイルはlabelで直接input操作 */}
      <label className="input-menu-item" style={{ cursor:'pointer' }} onClick={() => setShowInputMenu(false)}>
        <span className="input-menu-icon">📎</span>
        <span className="input-menu-label">ファイル</span>
        <input type="file" accept="image/*,video/*,audio/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style={{ display:'none' }} onChange={handleFileUpload} />
      </label>
      {[
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
  );
});


// 公式アカウント 一斉送信モーダル

// グループへの友達招待セクション（ルーム設定モーダル内で使用）
function FriendInviteSection({ roomId, members = [], friendsList = [], showToast }) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [inviting, setInviting] = useState(false);

  // membersは文字列IDの配列（memberDetailsは別フィールド）
  const memberIds = new Set([
    ...members.map(m => (typeof m === 'string' ? m : (m.id || m._id || ''))),
  ].filter(Boolean));
  const invitable = (friendsList || []).filter(f => {
    const fid = f.id || f._id || '';
    return fid && !memberIds.has(fid);
  });
  const filtered = search.trim()
    ? invitable.filter(f => (f.display_name || f.username || '').toLowerCase().includes(search.toLowerCase()))
    : invitable;

  const toggle = (fid) => setSelected(prev => prev.includes(fid) ? prev.filter(id => id !== fid) : [...prev, fid]);

  const handleInvite = async () => {
    if (!selected.length) return;
    setInviting(true);
    try {
      await axios.post(`/api/rooms/${roomId}/members`, { memberIds: selected });
      showToast?.(`✅ ${selected.length}人を招待したで！`, 'success');
      setSelected([]); setShow(false); setSearch('');
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '不明なエラー';
      showToast?.(`❌ 招待に失敗したで: ${msg}`, 'error');
    } finally { setInviting(false); }
  };

  if (!show) return (
    <div style={{ marginBottom:12 }}>
      <button onClick={() => setShow(true)}
        style={{ width:'100%', padding:'10px 0', borderRadius:12, border:'1.5px dashed var(--primary)', background:'rgba(59,130,246,0.05)', color:'var(--primary)', fontWeight:700, fontSize:14, cursor:'pointer' }}>
        👥 友達をグループに招待する
        {invitable.length > 0 && <span style={{ fontSize:12, fontWeight:400, marginLeft:6 }}>（{invitable.length}人招待可能）</span>}
      </button>
    </div>
  );

  return (
    <div style={{ marginBottom:12, border:'1.5px solid var(--primary)', borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'10px 12px', background:'rgba(59,130,246,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontWeight:700, fontSize:14, color:'var(--primary)' }}>👥 友達を招待</span>
        <button onClick={() => { setShow(false); setSelected([]); setSearch(''); }}
          style={{ fontSize:18, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
      </div>
      <div style={{ padding:'8px 12px' }}>
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="名前で検索..." style={{ marginBottom:8 }} autoFocus />
        <div style={{ maxHeight:200, overflowY:'auto', marginBottom:8 }}>
          {filtered.length === 0
            ? <div style={{ textAlign:'center', color:'var(--text2)', padding:'12px 0', fontSize:13 }}>
                {invitable.length === 0 ? '招待できる友達がおらへん' : '見つからんかった'}
              </div>
            : filtered.map(f => {
                const fid = f.id || f._id;
                const sel = selected.includes(fid);
                const name = f.display_name || f.username;
                return (
                  <div key={fid} onClick={() => toggle(fid)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 4px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderRadius:8, background: sel ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, overflow:'hidden' }}>
                      {f.avatar ? <img src={f.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{name}</div>
                    <div style={{ width:22, height:22, borderRadius:'50%', border:'2px solid', flexShrink:0, borderColor: sel ? 'var(--primary)' : 'var(--border)', background: sel ? 'var(--primary)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {sel && <span style={{ color:'white', fontSize:13, fontWeight:700 }}>✓</span>}
                    </div>
                  </div>
                );
              })
          }
        </div>
        <button onClick={handleInvite} disabled={!selected.length || inviting}
          style={{ width:'100%', padding:'10px 0', borderRadius:10, border:'none', fontWeight:700, fontSize:14, cursor:'pointer',
            background: selected.length ? 'var(--primary)' : 'var(--border)',
            color: selected.length ? 'white' : 'var(--text2)', opacity: inviting ? 0.7 : 1 }}>
          {inviting ? '招待中...' : selected.length ? `${selected.length}人を招待する` : '友達を選んでな'}
        </button>
      </div>
    </div>
  );
}

function BroadcastModal({ currentUser, onClose, showToast }) {
  const [text, setText] = React.useState('');
  const [image, setImage] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [sending, setSending] = React.useState(false);
  const fileRef = React.useRef(null);

  const handleSend = async () => {
    if (!text.trim() && !image) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('content', text);
      if (image) fd.append('image', image);
      const res = await axios.post('/api/official/broadcast', fd);
      showToast?.(`✅ ${res.data.sent}人に送信しました！`, 'success');
      onClose();
    } catch (e) {
      showToast?.(e.response?.data?.error || '送信に失敗しました', 'error');
    } finally { setSending(false); }
  };

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'flex-end' }}>
      <div style={{ background:'var(--surface)', width:'100%', borderRadius:'20px 20px 0 0', padding:20, maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:18 }}>📣 一斉送信</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>友達全員のDMにメッセージを送信</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'var(--text2)' }}>✕</button>
        </div>

        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="送信するメッセージを入力..."
          style={{ flex:1, minHeight:120, padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:15, resize:'none', outline:'none', marginBottom:12 }} />

        {preview && (
          <div style={{ position:'relative', marginBottom:12, display:'inline-block' }}>
            <img src={preview} alt="" style={{ maxWidth:160, maxHeight:120, borderRadius:10, objectFit:'cover' }} />
            <button onClick={() => { setImage(null); setPreview(null); }}
              style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', border:'none', color:'white', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:12 }}>✕</button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => fileRef.current?.click()} style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color:'var(--text2)' }}>🖼️</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImage} />
          <button onClick={handleSend} disabled={sending || (!text.trim() && !image)}
            style={{ padding:'10px 28px', borderRadius:20, background:'#1DB874', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', opacity: sending || (!text.trim() && !image) ? 0.5 : 1 }}>
            {sending ? '送信中...' : '📣 全員に送信'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TabBar = React.memo(function TabBar({ activeTab, setActiveTab, notifications, onClearNotif }) {
  const tabs = [
    { id: 'chat',     label: 'トーク',       icon: '💬' },
    { id: 'friends',  label: '友達',         icon: '👥' },
    { id: 'timeline', label: 'お知らせ',     icon: '📢' },
    { id: 'voom',     label: 'VOOM',         icon: '🎬' },
    { id: 'profile',  label: 'マイページ',   icon: '👤' },
  ];
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => { setActiveTab(tab.id); onClearNotif?.(tab.id); }}>
          <span className="tab-icon">{tab.icon}</span>
          {notifications?.[tab.id] > 0 && <span className="tab-badge">{notifications[tab.id]}</span>}
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}); // React.memo

// タブをRoutes外でレンダリングするためのラッパー
// /videocall パスの時だけ非表示にする
function LocationAwareTabs({ tabsElement }) {
  const location = useLocation();
  const isVideoCall = location.pathname.startsWith('/videocall');
  if (isVideoCall) return null;
  return tabsElement;
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
  const callTimeoutRef = useRef(null);
  const currentUserRef = useRef(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [bookmarks, setBookmarks] = useState(new Set());
  const [mutedRooms, setMutedRooms] = useState(new Set());
  const [activeCall, setActiveCall] = useState(null); // { roomId, targetUserId, isCaller, offer }
  const [callMinimized, setCallMinimized] = useState(false);
  const [showSubAccounts, setShowSubAccounts] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pinnedRooms, setPinnedRooms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedRooms') || '[]'); } catch { return []; }
  });
  const [voiceCall, setVoiceCall] = useState(null); // { targetUser, isIncoming, callId, roomId }
  const [showGift, setShowGift] = useState(null);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickReplies, setQuickReplies] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quickReplies') || '[]'); } catch { return []; }
  });
  const [showReadLater, setShowReadLater] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinVerified, setPinVerified] = useState(true);
  const [, setMentions] = useState([]);  // メンション通知リスト（未読バッジ用）
  const [groupCall, setGroupCall] = useState(null); // { roomId, members, roomName }
  const [darkAutoMode, setDarkAutoMode] = useState(() => localStorage.getItem('darkAutoMode') === 'true');

  const toastTimerRef = useRef(null);
  const activeTabRef = useRef('chat');
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

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
    // 友達リストはキャッシュ活用
    try {
      const cached = localStorage.getItem('friends_cache');
      if (cached) setFriendsList(JSON.parse(cached));
    } catch {}
    axios.get('/api/friends').then(res => {
      setFriendsList(res.data);
      try { localStorage.setItem('friends_cache', JSON.stringify(res.data)); } catch {}
    }).catch(() => {});
    // ミュート・ブックマーク・ピン留め初期化（サーバーが正）
    axios.get('/api/auth/me').then(res => {
      const u = res.data.user;
      if (u.mutedRooms) setMutedRooms(new Set(u.mutedRooms));
      if (u.bookmarks) setBookmarks(new Set(u.bookmarks));
      if (u.pinnedRooms) {
        setPinnedRooms(u.pinnedRooms);
        try { localStorage.setItem('pinnedRooms', JSON.stringify(u.pinnedRooms)); } catch {}
      }
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
    // 未読メッセージをチャットタブバッジに反映
    s.on('message:receive', (msg) => {
      const senderId = msg.senderId || msg.sender_id;
      if (senderId !== currentUserRef.current?.id && activeTabRef.current !== 'chat') {
        setNotifications(prev => ({ ...prev, chat: (prev.chat || 0) + 1 }));
      }
    });
    s.on('friend:accepted', (data) => {
      showToast(`${data.by_name} と友達になりました！`, 'success');
      // 友達リストを自動更新
      axios.get('/api/friends').then(res => setFriendsList(res.data)).catch(() => {});
    });
    // message:edited / message:deleted はChatScreen内のuseEffectで処理
    s.on('user:online', ({ userId }) => setOnlineUsers(prev => new Set([...prev, userId])));
    s.on('user:offline', ({ userId }) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(userId); return n; }));
    // 初回接続時にオンラインユーザー一覧を取得
    axios.get('/api/users/online').then(r => setOnlineUsers(new Set(r.data))).catch(() => {});
    s.on('call:incoming', (data) => {
      startRingtone();
      setIncomingCall(data);
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        stopRingtone();
        s.emit('call:reject', { to: data.from });
        setIncomingCall(null);
        callTimeoutRef.current = null;
      }, 30000);
    });
    // 音声通話着信
    s.on('voice:incoming', (data) => {
      // { from: {id, username, avatar}, offer, callId, roomId }
      startRingtone();
      setVoiceCall({
        targetUser: { id: data.from.id, displayName: data.from.username, avatar: data.from.avatar },
        isIncoming: true,
        callId: data.callId,
        roomId: data.roomId,
        incomingOffer: data.offer,
      });
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        stopRingtone();
        s.emit('voice:reject', { to: data.from.id, callId: data.callId });
        setVoiceCall(null);
        callTimeoutRef.current = null;
      }, 30000);
    });
    // メンション通知
    s.on('mention:new', (data) => {
      setMentions(prev => [data, ...prev].slice(0, 20));
      setNotifications(prev => ({ ...prev, chat: (prev.chat || 0) + 1 }));
      showToast(`@メンション: ${data.from}さんから`, 'info');
    });
    // ギフト受信通知
    s.on('gift:received', (data) => {
      showToast(`🎁 ${data.from}さんから ${data.stampId || data.stamp || '🎁'} ${data.amount}コインもらった！`, 'success');
    });
    // 発信側: ビデオ通話が拒否された
    s.on('call:rejected', () => {
      stopRingtone();
      if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
      setActiveCall(null);
      showToast('通話が拒否されました', 'info');
    });
    // 発信側: 音声通話が拒否された
    s.on('voice:reject', () => {
      stopRingtone();
      if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
      setVoiceCall(null);
      showToast('音声通話が拒否されました', 'info');
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

  // Renderのコールドスタート防止 - 2分ごとにpingを送る（ログイン前後両方）
  useEffect(() => {
    const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';
    const ping = () => axios.get(currentUser ? '/api/auth/me' : `${SERVER_URL}/health`).catch(() => {});
    ping(); // 即時実行
    const timer = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [currentUser]);

  const handleLogin = useCallback(async (user) => {
    setCurrentUser(user);
    // PINが設定されてたら確認画面（pin_enabled / pinEnabled 両対応）
    if (user.pin_enabled || user.pinEnabled) setPinVerified(false);
    else setPinVerified(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    if (socket) socket.disconnect();
    setSocket(null); setCurrentUser(null);
  }, [socket]);

  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    stopRingtone();
    const { from, roomId, offer } = incomingCall;
    setIncomingCall(null);
    setActiveCall({ roomId, targetUserId: from, isCaller: false, offer });
  }, [incomingCall]);

  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    stopRingtone();
    socket?.emit('call:reject', { to: incomingCall.from });
    setIncomingCall(null);
  }, [incomingCall, socket]);

  const handleAcceptVoice = useCallback(() => {
    if (!voiceCall) return;
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    stopRingtone();
    setVoiceCall(prev => ({ ...prev, _accepted: true }));
  }, [voiceCall]);

  const handleRejectVoice = useCallback(() => {
    if (!voiceCall) return;
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    stopRingtone();
    socket?.emit('voice:reject', { to: voiceCall.targetUser?.id, callId: voiceCall.callId });
    setVoiceCall(null);
  }, [voiceCall, socket]);

  // ChatScreenは常にマウントし続けてdisplay:noneで隠す（アンマウントするとselectedRoomが消えるため）
  const tabVisible = useCallback((id) => ({ display: activeTab === id ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }), [activeTab]);

  const handleReadRoom = useCallback(() => setNotifications(p => ({ ...p, chat: 0 })), []);
  const handleClearFriendNotif = useCallback(() => setNotifications(p => ({ ...p, friends: 0 })), []);
  const handleClearNotif = useCallback((tabId) => setNotifications(p => ({ ...p, [tabId]: 0 })), []);
  const handleStartChat = useCallback(async (friend) => {
    try {
      const res = await axios.post('/api/rooms/dm', { targetUserId: friend.id || friend._id });
      if (res.data) {
        axios.get('/api/friends').then(r => setFriendsList(r.data)).catch(() => {});
        localStorage.removeItem('rooms_cache');
        setActiveTab('chat');
      }
    } catch (e) { console.error('DM失敗', e); }
  }, []);
  const handleStampAcquire = useCallback((id) => setAcquiredStampIds(prev => [...prev, id]), []);
  const handleNavigateRoom = useCallback(() => setActiveTab('chat'), []);
  const handleProfileUpdate = useCallback((u) => setCurrentUser(u), []);
  const handleContactOpen = useCallback(() => setShowContact(true), []);
  const handleToggleDark = useCallback(() => { setDarkAutoMode(false); localStorage.setItem('darkAutoMode','false'); setDarkMode(d => !d); }, []);
  const handleToggleAuto = useCallback(() => {
    const v = !darkAutoMode;
    setDarkAutoMode(v);
    localStorage.setItem('darkAutoMode', v);
    if (v) setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, [darkAutoMode]);
  const handleOpenPinSetup = useCallback(() => setShowPinSetup(true), []);
  const handleSwitchAccount = useCallback((token, user) => {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setCurrentUser(user);
    window.location.reload();
  }, []);
  const handleGroupCallEnd = useCallback(() => { setGroupCall(null); setCallMinimized(false); }, []);
  const handleGroupCallMinimize = useCallback(() => setCallMinimized(m => !m), []);
  const handleActiveCallEnd = useCallback(() => { setActiveCall(null); setCallMinimized(false); }, []);
  const handleCloseSubAccounts = useCallback(() => setShowSubAccounts(false), []);
  const handlePinSuccess = useCallback(() => setPinVerified(true), []);
  const handlePinCancel = useCallback(() => { setCurrentUser(null); setPinVerified(false); }, []);
  const handleClosePinSetup = useCallback(() => {
    setShowPinSetup(false);
    axios.get('/api/auth/me').then(r => setCurrentUser(r.data.user)).catch(() => {});
  }, []);
  const handleCloseGift = useCallback(() => setShowGift(null), []);
  const handleCloseReadLater = useCallback(() => setShowReadLater(false), []);
  const handleCloseContact = useCallback(() => setShowContact(false), []);
  const handleCloseVoiceCall = useCallback(() => { stopRingtone(); setVoiceCall(null); }, []);

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const tabsElement = (
    <>
      {/* 全タブ常時マウント（タブ切替でstateリセットされないように） */}
      <div style={tabVisible('chat')}>
        <ChatScreen socket={socket} currentUser={currentUser} allStampSets={allStampSets} acquiredStampIds={acquiredStampIds} friendsList={friendsList} onCall={setActiveCall} setGroupCall={setGroupCall} onlineUsers={onlineUsers} bookmarks={bookmarks} setBookmarks={setBookmarks} mutedRooms={mutedRooms} setMutedRooms={setMutedRooms} soundTheme={currentUser?.soundTheme || 'default'} setShowSubAccounts={setShowSubAccounts} setVoiceCall={setVoiceCall} showToast={showToast} setShowGift={setShowGift} setShowReadLater={setShowReadLater} onNavigate={setActiveTab} onReadRoom={handleReadRoom} setShowBroadcast={setShowBroadcast} pinnedRooms={pinnedRooms} setPinnedRooms={setPinnedRooms} showWhiteboard={showWhiteboard} setShowWhiteboard={setShowWhiteboard} showQuickReply={showQuickReply} setShowQuickReply={setShowQuickReply} quickReplies={quickReplies} setQuickReplies={setQuickReplies} />
      </div>
      <div style={tabVisible('friends')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Friends
            currentUser={currentUser}
            socket={socket}
            onClearNotif={handleClearFriendNotif}
            onStartChat={handleStartChat}
          />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('timeline')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Timeline currentUser={currentUser} socket={socket} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('stampshop')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <StampShop currentUser={currentUser} acquiredStampIds={acquiredStampIds} onAcquire={handleStampAcquire} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('album')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Album currentUser={currentUser} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('dashboard')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Dashboard currentUser={currentUser} onNavigateRoom={handleNavigateRoom} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('voom')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Voom currentUser={currentUser} socket={socket} />
        </Suspense></ErrorBoundary>
      </div>
      <div style={tabVisible('profile')}>
        <ErrorBoundary><Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,fontSize:32,color:'var(--text2)'}}>⏳</div>}>
          <Profile currentUser={currentUser} onOpenAdmin={(currentUser?.isAdmin === true || currentUser?.username === 'とわ') ? () => setShowAdmin(true) : null} onUpdate={handleProfileUpdate} onLogout={handleLogout} onContact={handleContactOpen}
            darkMode={darkMode} onToggleDark={handleToggleDark}
            darkAutoMode={darkAutoMode} onToggleAuto={handleToggleAuto}
            onOpenPinSetup={handleOpenPinSetup}
            onNavigate={setActiveTab}
            onSwitchAccount={handleSwitchAccount}
            onOpenShop={() => setActiveTab('stampshop')} />
        </Suspense></ErrorBoundary>
      </div>
    </>
  );

  return (
    <Router>
      <div className={`app ${darkMode ? 'dark' : ''}`}>
{/* LINEはタブごとにヘッダーを持つためグローバルヘッダーは非表示 */}
        <main className="app-main">
          <Routes>
            <Route path="/videocall/:roomId/:targetUserId" element={<ErrorBoundary><Suspense fallback={null}><VideoCall currentUser={currentUser} socket={socket} /></Suspense></ErrorBoundary>} />
            <Route path="*" element={null} />
          </Routes>
          <LocationAwareTabs tabsElement={tabsElement} />
        </main>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} notifications={notifications} onClearNotif={handleClearNotif} />
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        {groupCall && (
          <ErrorBoundary><Suspense fallback={null}>
            <GroupVideoCall
              socket={socket}
              currentUser={currentUser}
              roomId={groupCall.roomId}
              members={groupCall.members}
              roomName={groupCall.roomName}
              onEnd={handleGroupCallEnd}
              minimized={callMinimized}
              onToggleMinimize={handleGroupCallMinimize}
            />
          </Suspense></ErrorBoundary>
        )}
        {activeCall && (
          <ErrorBoundary><Suspense fallback={null}>
            <VideoCall
              currentUser={currentUser}
              socket={socket}
              roomId={activeCall.roomId}
              targetUserId={activeCall.targetUserId}
              isCaller={activeCall.isCaller}
              incomingOffer={activeCall.offer}
              onEnd={handleActiveCallEnd}
              minimized={callMinimized}
              onToggleMinimize={handleGroupCallMinimize}
            />
          </Suspense></ErrorBoundary>
        )}
        {/* サブアカウント切り替え */}
        {showSubAccounts && (
          <ErrorBoundary><Suspense fallback={null}>
            <SubAccounts
              currentUser={currentUser}
              onSwitch={(user) => {
                setCurrentUser(user);
                setShowSubAccounts(false);
                setTimeout(() => window.location.reload(), 100);
              }}
              onClose={handleCloseSubAccounts}
            />
          </Suspense></ErrorBoundary>
        )}

        {/* PIN認証（未確認の場合） */}
        {currentUser && !pinVerified && (
          <ErrorBoundary><Suspense fallback={null}>
            <PinVerify
              onSuccess={handlePinSuccess}
              onCancel={handlePinCancel}
            />
          </Suspense></ErrorBoundary>
        )}

        {/* PIN設定 */}
        {showPinSetup && (
          <ErrorBoundary><Suspense fallback={null}>
            <PinSetup enabled={!!currentUser?.pinEnabled} onClose={handleClosePinSetup} />
          </Suspense></ErrorBoundary>
        )}
        {/* ギフト送信 */}
        {showGift && (
          <ErrorBoundary><Suspense fallback={null}>
            <GiftModal
              targetUser={showGift}
              currentUser={currentUser}
              onClose={handleCloseGift}
            />
          </Suspense></ErrorBoundary>
        )}

        {/* 後で読む */}
        {showReadLater && (
          <ErrorBoundary><Suspense fallback={null}>
            <ReadLater currentUser={currentUser} onClose={handleCloseReadLater} />
          </Suspense></ErrorBoundary>
        )}

        {/* お問い合わせ */}

        {/* 管理者パネル */}
        {showAdmin && (
          <ErrorBoundary><Suspense fallback={null}>
            <AdminPanel currentUser={currentUser} onClose={() => setShowAdmin(false)} />
          </Suspense></ErrorBoundary>
        )}

        {/* 公式アカウント 一斉送信モーダル */}
        {showBroadcast && (
          <BroadcastModal currentUser={currentUser} onClose={() => setShowBroadcast(false)} showToast={showToast} />
        )}
        {showContact && (
          <ErrorBoundary><Suspense fallback={null}>
            <ContactForm currentUser={currentUser} onClose={handleCloseContact} />
          </Suspense></ErrorBoundary>
        )}

        {/* 音声通話 */}
        {voiceCall && (voiceCall._accepted || !voiceCall.isIncoming) && (
          <ErrorBoundary><Suspense fallback={null}>
            <VoiceCall
              socket={socket}
              currentUser={currentUser}
              targetUser={voiceCall.targetUser}
              roomId={voiceCall.roomId}
              isIncoming={voiceCall.isIncoming}
              callId={voiceCall.callId}
              incomingOffer={voiceCall.incomingOffer}
              onClose={handleCloseVoiceCall}
            />
          </Suspense></ErrorBoundary>
        )}
        {/* 音声通話着信UI（未応答時） */}
        {voiceCall && voiceCall.isIncoming && !voiceCall._accepted && (
          <div style={{ position:'fixed', inset:0, background:'linear-gradient(180deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <style>{`
              @keyframes ripple { 0%{transform:scale(1);opacity:0.4} 100%{transform:scale(2.4);opacity:0} }
              @keyframes voicePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
              .v-ripple { position:absolute; border-radius:50%; border:2px solid rgba(6,199,85,0.5); animation:ripple 2s ease-out infinite; }
            `}</style>
            {/* 波紋 */}
            <div style={{ position:'relative', width:140, height:140, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:32 }}>
              <div className="v-ripple" style={{ width:140, height:140, animationDelay:'0s' }} />
              <div className="v-ripple" style={{ width:140, height:140, animationDelay:'0.6s' }} />
              <div className="v-ripple" style={{ width:140, height:140, animationDelay:'1.2s' }} />
              <div style={{ position:'relative', width:88, height:88, borderRadius:'50%', background:'linear-gradient(135deg,#06c755,#03a040)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, fontWeight:700, border:'3px solid rgba(255,255,255,0.25)', zIndex:1, animation:'voicePulse 1.5s ease-in-out infinite' }}>
                {voiceCall.targetUser?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', letterSpacing:2, marginBottom:8 }}>音声通話</div>
            <div style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:8 }}>{voiceCall.targetUser?.displayName || '不明'}</div>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)', marginBottom:56 }}>着信中…</div>
            <div style={{ display:'flex', gap:48, justifyContent:'center', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <button onClick={handleRejectVoice} style={{ width:72, height:72, borderRadius:'50%', background:'#e74c3c', fontSize:30, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(231,76,60,0.6)' }}>📵</button>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>拒否</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <button onClick={handleAcceptVoice} style={{ width:72, height:72, borderRadius:'50%', background:'#06c755', fontSize:30, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(6,199,85,0.6)', animation:'voicePulse 1.2s ease-in-out infinite' }}>📞</button>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>応答</span>
              </div>
            </div>
          </div>
        )}
        {/* ビデオ通話着信フルスクリーンUI */}
        {incomingCall && (
          <div style={{ position:'fixed', inset:0, background:'linear-gradient(180deg,#0d0d1a 0%,#1a0a2e 50%,#0a1628 100%)', zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <style>{`
              @keyframes vcRipple { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(2.6);opacity:0} }
              @keyframes vcPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
              .vc-ripple { position:absolute; border-radius:50%; border:2px solid rgba(99,102,241,0.5); animation:vcRipple 2s ease-out infinite; }
            `}</style>
            <div style={{ position:'relative', width:150, height:150, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:36 }}>
              <div className="vc-ripple" style={{ width:150, height:150, animationDelay:'0s' }} />
              <div className="vc-ripple" style={{ width:150, height:150, animationDelay:'0.7s' }} />
              <div className="vc-ripple" style={{ width:150, height:150, animationDelay:'1.4s' }} />
              <div style={{ position:'relative', width:92, height:92, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, fontWeight:700, color:'#fff', border:'3px solid rgba(255,255,255,0.2)', zIndex:1, animation:'vcPulse 1.5s ease-in-out infinite' }}>
                {incomingCall.fromName?.[0]?.toUpperCase() || '?'}
              </div>
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', letterSpacing:2, marginBottom:8 }}>ビデオ通話</div>
            <div style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:8 }}>{incomingCall.fromName}</div>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', marginBottom:60 }}>着信中…</div>
            <div style={{ display:'flex', gap:52, justifyContent:'center', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <button onClick={handleRejectCall} style={{ width:72, height:72, borderRadius:'50%', background:'#e74c3c', fontSize:30, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 24px rgba(231,76,60,0.6)' }}>📵</button>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>拒否</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <button onClick={handleAcceptCall} style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', fontSize:30, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 24px rgba(99,102,241,0.6)', animation:'vcPulse 1.2s ease-in-out infinite' }}>📹</button>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>応答</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}
