require("dotenv").config();
const express = require('express');
const compression = require('compression');
const webpush = require('web-push');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary設定（環境変数から読み込み）
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME);
const path = require('path');
const fs = require('fs');
const { join } = require('path');
const { v4: uuidv4 } = require('uuid');
const { User, Room, Message, Friend, FriendRequest, Post, Note, ScheduledMessage, Poll, Task } = require('./db');

const app = express();

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAwzRukb1C_xX8RFR2Luln0HcUEDsAgrimF1njzr2t4952nvpwfkrQ6yvSHE4z9wqXXpnp3tMhwzIBKuuvd5Xkk';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'NYWHWUJij3EUcOYPmq17yMihomww6SmBpvQe4ZTsDI0';
webpush.setVapidDetails('mailto:admin@line-killer.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// push購読をメモリで管理（再起動でリセットされるが無料プランでは許容）
const pushSubscriptions = new Map(); // userId -> subscription
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);

app.use(cors());
app.get('/admin/reset-requests', async (req, res) => {
  await FriendRequest.deleteMany({});
  res.json({ ok: true });
});

app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const cloudStorage = useCloudinary ? new CloudinaryStorage({
  cloudinary,
  params: { folder: 'line-killer', allowed_formats: ['jpg','jpeg','png','gif','webp','mp4','pdf'] },
}) : null;

const storage = cloudStorage || diskStorage;
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const getFileUrl = (req) => {
  if (useCloudinary && req.file?.path) return req.file.path; // Cloudinaryは絶対URL
  return req.file ? \`/uploads/\${req.file.filename}\` : null;
};
const JWT_SECRET = 'super-secret-key';

const auth = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  return jwt.verify(token, JWT_SECRET);
};

// スタンプセット定義
const STAMP_SETS = [
  { id: 1, name: '野球キャラクターセット', icon: '⚾', stamps: [
    { emoji: '⚾', label: 'ナイスバッティング！' }, { emoji: '🏆', label: '優勝！' },
    { emoji: '💪', label: '全力プレー！' }, { emoji: '🔥', label: '燃えてるぜ！' },
    { emoji: '👊', label: 'ファイト！' }, { emoji: '🎯', label: 'ストライク！' },
    { emoji: '🙌', label: 'やったー！' }, { emoji: '😤', label: '負けへんで！' },
    { emoji: '🥇', label: 'チャンピオン！' }, { emoji: '⚡', label: '一撃必殺！' },
  ]},
  { id: 2, name: '動物キャラセット', icon: '🐶', stamps: [
    { emoji: '🐶', label: 'わんわん！' }, { emoji: '🐱', label: 'にゃー！' },
    { emoji: '🐻', label: 'よろしく！' }, { emoji: '🐼', label: 'のんびりね' },
    { emoji: '🦊', label: 'ずるがしこい！' }, { emoji: '🐯', label: 'がおー！' },
    { emoji: '🐸', label: 'けろけろ！' }, { emoji: '🐨', label: 'まったりしよ' },
    { emoji: '🦁', label: '王様だ！' }, { emoji: '🐙', label: 'ぐにゃぐにゃ！' },
  ]},
  { id: 3, name: '面白い表情セット', icon: '😂', stamps: [
    { emoji: '😂', label: '爆笑！' }, { emoji: '🤣', label: '草ァ！' },
    { emoji: '😅', label: 'あせあせ…' }, { emoji: '🤪', label: 'いかれてる！' },
    { emoji: '😈', label: 'いたずら中！' }, { emoji: '💀', label: '死んだ笑' },
    { emoji: '🤯', label: '頭爆発！' }, { emoji: '😵', label: 'くらくら…' },
    { emoji: '🥴', label: 'ふらふら…' }, { emoji: '🤡', label: 'ピエロだよ！' },
  ]},
  { id: 4, name: '食べ物キャラセット', icon: '🍕', stamps: [
    { emoji: '🍕', label: 'ピザ食べたい！' }, { emoji: '🍔', label: 'バーガー最高！' },
    { emoji: '🍣', label: 'お寿司食べよ！' }, { emoji: '🍜', label: 'ラーメン行こ！' },
    { emoji: '🍩', label: 'ドーナツ食べたい' }, { emoji: '🍰', label: 'ケーキ！' },
    { emoji: '🍦', label: 'アイス食べたい' }, { emoji: '🍫', label: 'チョコ好き！' },
    { emoji: '🌮', label: 'タコス食べたい！' }, { emoji: '🍱', label: 'お弁当食べよ！' },
  ]},
  { id: 5, name: '季節・イベントセット', icon: '🎉', stamps: [
    { emoji: '🌸', label: 'お花見しよ！' }, { emoji: '🎆', label: '花火きれい！' },
    { emoji: '🍁', label: '紅葉シーズン！' }, { emoji: '⛄', label: '雪だるま！' },
    { emoji: '🎉', label: 'やったー！' }, { emoji: '🎊', label: 'おめでとう！' },
    { emoji: '🎋', label: '七夕だよ！' }, { emoji: '🎃', label: 'ハロウィン！' },
    { emoji: '🎄', label: 'メリクリ！' }, { emoji: '🧧', label: 'お年玉！' },
  ]},
  { id: 6, name: 'ゆるキャラセット', icon: '👾', stamps: [
    { emoji: '👾', label: 'ゆるゆる～' }, { emoji: '🤖', label: 'ロボットだよ！' },
    { emoji: '👽', label: '宇宙人だよ！' }, { emoji: '👻', label: 'ばあ！' },
    { emoji: '🎭', label: 'どっちの顔？' }, { emoji: '🧸', label: 'ぬいぐるみ！' },
    { emoji: '🪆', label: 'マトリョーシカ' }, { emoji: '🎠', label: 'くるくる～' },
    { emoji: '🎪', label: 'サーカスだよ！' }, { emoji: '🎨', label: 'アート！' },
  ]},
  { id: 7, name: '恋愛・気持ちセット', icon: '❤️', stamps: [
    { emoji: '❤️', label: '大好き！' }, { emoji: '💕', label: 'ラブラブ！' },
    { emoji: '💖', label: 'ドキドキ！' }, { emoji: '💘', label: '一目惚れ！' },
    { emoji: '🥰', label: 'めちゃ好き！' }, { emoji: '😍', label: '最高！' },
    { emoji: '💝', label: '贈り物！' }, { emoji: '💞', label: 'ずっと一緒！' },
    { emoji: '🫶', label: 'ハートハンド！' }, { emoji: '💓', label: 'ときめき！' },
  ]},
  { id: 8, name: '日常会話セット', icon: '💬', stamps: [
    { emoji: '👋', label: 'やあ！' }, { emoji: '🤝', label: 'よろしく！' },
    { emoji: '👍', label: 'いいね！' }, { emoji: '👎', label: 'それはダメ！' },
    { emoji: '🙏', label: 'お願い！' }, { emoji: '💪', label: 'がんばれ！' },
    { emoji: '✌️', label: 'ピース！' }, { emoji: '👌', label: 'オッケー！' },
    { emoji: '🤙', label: 'またね！' }, { emoji: '☝️', label: 'ちょっと待って！' },
  ]},
  { id: 9, name: 'スポーツセット', icon: '⚽', stamps: [
    { emoji: '⚽', label: 'ゴール！' }, { emoji: '🏀', label: 'ダンク！' },
    { emoji: '🏈', label: 'タッチダウン！' }, { emoji: '🎾', label: 'サーブ！' },
    { emoji: '🏊', label: '泳ぐぞ！' }, { emoji: '🚴', label: 'レッツゴー！' },
    { emoji: '🥊', label: 'ファイト！' }, { emoji: '🏆', label: '優勝！' },
    { emoji: '🤸', label: '体操！' }, { emoji: '⛷️', label: 'スキー！' },
  ]},
  { id: 10, name: '音楽セット', icon: '🎵', stamps: [
    { emoji: '🎵', label: 'ラララ～！' }, { emoji: '🎸', label: 'ギター！' },
    { emoji: '🎹', label: 'ピアノ！' }, { emoji: '🥁', label: 'ドンドン！' },
    { emoji: '🎤', label: '歌うよ！' }, { emoji: '🎧', label: '音楽聴こ！' },
    { emoji: '🎺', label: 'ラッパ！' }, { emoji: '🎻', label: 'バイオリン！' },
    { emoji: '🎷', label: 'サックス！' }, { emoji: '🎼', label: '作曲中！' },
  ]},
  { id: 11, name: 'ゲームセット', icon: '🎮', stamps: [
    { emoji: '🎮', label: 'ゲームしよ！' }, { emoji: '🕹️', label: 'レトロゲー！' },
    { emoji: '🏆', label: 'ゲームクリア！' }, { emoji: '💀', label: 'やられた！' },
    { emoji: '⚔️', label: 'バトル！' }, { emoji: '🧩', label: 'パズル！' },
    { emoji: '🎲', label: 'サイコロ！' }, { emoji: '♟️', label: 'チェス！' },
    { emoji: '🎯', label: 'ねらい撃ち！' }, { emoji: '🥇', label: 'ランク１位！' },
  ]},
  { id: 12, name: '旅行セット', icon: '✈️', stamps: [
    { emoji: '✈️', label: '旅行行こ！' }, { emoji: '🏖️', label: 'ビーチ！' },
    { emoji: '🏔️', label: '山登り！' }, { emoji: '🗼', label: '東京タワー！' },
    { emoji: '🌍', label: '世界旅行！' }, { emoji: '🧳', label: '旅の準備！' },
    { emoji: '🗺️', label: '地図見よ！' }, { emoji: '🚂', label: '電車旅！' },
    { emoji: '🚢', label: 'クルーズ！' }, { emoji: '🏯', label: 'お城！' },
  ]},
  { id: 13, name: '天気セット', icon: '☀️', stamps: [
    { emoji: '☀️', label: '晴れだよ！' }, { emoji: '🌧️', label: '雨だよ！' },
    { emoji: '⛈️', label: '嵐だ！' }, { emoji: '❄️', label: '雪だよ！' },
    { emoji: '🌈', label: '虹が出た！' }, { emoji: '⚡', label: '雷！' },
    { emoji: '🌊', label: '波が高い！' }, { emoji: '🌪️', label: '竜巻！' },
    { emoji: '🌤️', label: '曇り時々晴れ' }, { emoji: '🌙', label: 'お月さま！' },
  ]},
  { id: 14, name: '勉強セット', icon: '📚', stamps: [
    { emoji: '📚', label: '勉強するぞ！' }, { emoji: '✏️', label: 'メモメモ！' },
    { emoji: '💡', label: 'ひらめいた！' }, { emoji: '🔬', label: '実験中！' },
    { emoji: '🎓', label: '卒業！' }, { emoji: '📝', label: 'テスト中！' },
    { emoji: '🏅', label: '満点！' }, { emoji: '📐', label: '数学！' },
    { emoji: '🔭', label: '観察中！' }, { emoji: '📖', label: '読書中！' },
  ]},
  { id: 15, name: '仕事セット', icon: '💼', stamps: [
    { emoji: '💼', label: '仕事行くぞ！' }, { emoji: '💻', label: 'PC作業中！' },
    { emoji: '📊', label: 'データ分析！' }, { emoji: '📈', label: '右肩上がり！' },
    { emoji: '☎️', label: '電話中！' }, { emoji: '📧', label: 'メール送った！' },
    { emoji: '🗂️', label: 'ファイル整理！' }, { emoji: '⏰', label: '締め切り！' },
    { emoji: '🖨️', label: '印刷中！' }, { emoji: '📋', label: '報告書！' },
  ]},
  { id: 16, name: 'お祝いセット', icon: '🎊', stamps: [
    { emoji: '🎊', label: 'おめでとう！' }, { emoji: '🎉', label: 'やったー！' },
    { emoji: '🎈', label: '風船！' }, { emoji: '🎁', label: 'プレゼント！' },
    { emoji: '🥳', label: 'パーティー！' }, { emoji: '🍾', label: 'シャンパン！' },
    { emoji: '🥂', label: '乾杯！' }, { emoji: '🌟', label: 'スター！' },
    { emoji: '🎀', label: 'リボン！' }, { emoji: '🧨', label: '爆竹！' },
  ]},
  { id: 17, name: 'ホラーセット', icon: '👻', stamps: [
    { emoji: '👻', label: 'ばあ！' }, { emoji: '💀', label: 'ガイコツ！' },
    { emoji: '🕷️', label: 'クモ！' }, { emoji: '🦇', label: 'コウモリ！' },
    { emoji: '😱', label: 'こわい！' }, { emoji: '🎃', label: 'ハロウィン！' },
    { emoji: '🌑', label: '暗闇！' }, { emoji: '🔮', label: '占い！' },
    { emoji: '⚰️', label: 'お墓！' }, { emoji: '🪦', label: 'R.I.P！' },
  ]},
  { id: 18, name: '宇宙セット', icon: '🚀', stamps: [
    { emoji: '🚀', label: '発射！' }, { emoji: '🛸', label: 'UFO！' },
    { emoji: '🌙', label: 'お月さま！' }, { emoji: '⭐', label: 'スター！' },
    { emoji: '☄️', label: '彗星！' }, { emoji: '🌌', label: '銀河！' },
    { emoji: '👨‍🚀', label: '宇宙飛行士！' }, { emoji: '🪐', label: '土星！' },
    { emoji: '🌠', label: '流れ星！' }, { emoji: '🔭', label: '望遠鏡！' },
  ]},
  { id: 19, name: '学校セット', icon: '🏫', stamps: [
    { emoji: '🏫', label: '学校行くぞ！' }, { emoji: '🎒', label: 'ランドセル！' },
    { emoji: '✏️', label: '授業中！' }, { emoji: '🎓', label: '卒業！' },
    { emoji: '👨‍🏫', label: '先生！' }, { emoji: '📝', label: 'テスト！' },
    { emoji: '🏅', label: '表彰！' }, { emoji: '🖍️', label: 'お絵かき！' },
    { emoji: '📌', label: '掲示板！' }, { emoji: '🔔', label: 'チャイム！' },
  ]},
];

// Push通知API
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証エラー' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    pushSubscriptions.set(decoded.id, req.body);
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/push/subscribe', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証エラー' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    pushSubscriptions.delete(decoded.id);
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/stamps', (req, res) => res.json(STAMP_SETS));

app.post('/api/stamps/acquire', async (req, res) => {
  try {
    const decoded = auth(req);
    const { setId } = req.body;
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { acquired_stamps: setId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/stamps/mysets', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json({ acquired: user.acquired_stamps || [] });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 認証
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
  const exists = await User.findOne({ username });
  if (exists) return res.status(400).json({ error: 'このユーザー名は既に使われてます' });
  const hashed = await bcrypt.hash(password, 10);
  const id = uuidv4();
  await User.create({ id, username, password: hashed });
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, avatar: null, displayName: username, bio: '', status: '' } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'パスワードが違います' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, displayName: user.display_name || user.username, bio: user.bio || '', status: user.status || '' } });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { password: 0 });
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, displayName: user.display_name || user.username, bio: user.bio || '', status: user.status || '', mutedRooms: user.muted_rooms || [], bookmarks: user.bookmarked_messages || [] } });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const { authorization } = req.headers;
    const token = authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const q = req.query.q || '';
    const users = await User.find(
      { username: { $regex: q, $options: 'i' }, id: { $ne: decoded.id } },
      { password: 0 }
    ).limit(20);
    res.json(users);
  } catch { res.status(401).json({ error: 'unauthorized' }); }
});

app.get('/api/users', async (req, res) => {
  const users = await User.find({}, { password: 0 });
  res.json(users);
});

app.patch('/api/users/me', upload.single('avatar'), async (req, res) => {
  try {
    const decoded = auth(req);
    const { status, displayName, bio } = req.body;
    const update = {};
    if (req.file) update.avatar = getFileUrl(req);
    if (status !== undefined) update.status = status;
    if (displayName !== undefined) update.display_name = displayName;
    if (bio !== undefined) update.bio = bio;
    const user = await User.findOneAndUpdate({ id: decoded.id }, update, { new: true, projection: { password: 0 } });
    const userRes = {
      id: user.id, username: user.username, avatar: user.avatar,
      displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
    };
    io.emit('user:updated', userRes);
    res.json(userRes);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 友だち申請
app.get('/api/friend-requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const requests = await FriendRequest.find({ to_id: decoded.id, status: 'pending' });
    res.json(requests);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/friend-requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const { toId } = req.body;
    if (toId === decoded.id) return res.status(400).json({ error: '自分には送れません' });
    const existing = await FriendRequest.findOne({ from_id: decoded.id, to_id: toId, status: 'pending' });
    if (existing) return res.status(400).json({ error: '既に申請済みです' });
    const alreadyFriend = await Friend.findOne({ user_id: decoded.id, friend_id: toId });
    if (alreadyFriend) return res.status(400).json({ error: '既に友だちです' });
    const id = uuidv4();
    const request = await FriendRequest.create({ id, from_id: decoded.id, from_name: decoded.username, to_id: toId });
    io.to('user_' + toId).emit('friend:request', { id, from_id: decoded.id, from_name: decoded.username });
    res.json(request);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/friend-requests/:requestId/accept', async (req, res) => {
  try {
    const decoded = auth(req);
    const request = await FriendRequest.findOne({ id: req.params.requestId, to_id: decoded.id });
    if (!request) return res.status(404).json({ error: '申請が見つかりません' });
    await FriendRequest.findOneAndUpdate({ id: req.params.requestId }, { status: 'accepted' });
    await Friend.findOneAndUpdate({ user_id: decoded.id, friend_id: request.from_id }, {}, { upsert: true });
    await Friend.findOneAndUpdate({ user_id: request.from_id, friend_id: decoded.id }, {}, { upsert: true });
    io.to('user_' + request.from_id).emit('friend:accepted', { by_id: decoded.id, by_name: decoded.username });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/friend-requests/:requestId/reject', async (req, res) => {
  try {
    const decoded = auth(req);
    await FriendRequest.findOneAndUpdate({ id: req.params.requestId, to_id: decoded.id }, { status: 'rejected' });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 友だち
app.get('/api/friends', async (req, res) => {
  try {
    const decoded = auth(req);
    const friends = await Friend.find({ user_id: decoded.id });
    const users = await User.find({ id: { $in: friends.map(f => f.friend_id) } }, { password: 0 });
    res.json(users);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/friends/:friendId', async (req, res) => {
  try {
    const decoded = auth(req);
    await Friend.deleteOne({ user_id: decoded.id, friend_id: req.params.friendId });
    await Friend.deleteOne({ user_id: req.params.friendId, friend_id: decoded.id });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ブロック
app.post('/api/users/:userId/block', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { blocked_users: req.params.userId } });
    await Friend.deleteOne({ user_id: decoded.id, friend_id: req.params.userId });
    await Friend.deleteOne({ user_id: req.params.userId, friend_id: decoded.id });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/users/:userId/block', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { blocked_users: req.params.userId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/users/blocked', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const blocked = await User.find({ id: { $in: user.blocked_users || [] } }, { password: 0 });
    res.json(blocked);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 通知OFF
app.post('/api/rooms/:roomId/mute', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { muted_rooms: req.params.roomId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ブックマーク追加・削除
app.post('/api/bookmarks/:messageId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { bookmarked_messages: req.params.messageId } });
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});
app.delete('/api/bookmarks/:messageId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { bookmarked_messages: req.params.messageId } });
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});
app.get('/api/bookmarks', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const msgs = await Message.find({ id: { $in: user.bookmarked_messages || [] } });
    res.json(msgs.map(m => ({ id: m.id, content: m.content, type: m.type, senderId: m.sender_id, senderName: m.sender_name, roomId: m.room_id, createdAt: m.created_at })));
  } catch { res.status(400).json({ error: 'エラー' }); }
});

// アナウンス設定・取得
app.post('/api/rooms/:roomId/announcement', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'ルームが見つかりません' });
    // 作成者またはメンバーなら設定可能
    await Room.findOneAndUpdate({ id: req.params.roomId }, { announcement: req.body.text });
    io.to(req.params.roomId).emit('room:announcement', { roomId: req.params.roomId, text: req.body.text, by: decoded.id });
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});

app.delete('/api/rooms/:roomId/mute', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { muted_rooms: req.params.roomId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// タイムライン
app.get('/api/posts', async (req, res) => {
  try {
    auth(req);
    const posts = await Post.find().sort({ created_at: -1 }).limit(50);
    res.json(posts);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: '内容を入力してください' });
    const id = uuidv4();
    const post = await Post.create({
      id, user_id: decoded.id, username: decoded.username,
      avatar: user.avatar || null,
      content: content || '',
      image: req.file ? getFileUrl(req) : null
    });
    io.emit('post:new', post);
    res.json(post);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/posts/:postId/like', async (req, res) => {
  try {
    const decoded = auth(req);
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    const liked = post.likes.includes(decoded.id);
    if (liked) {
      await Post.findOneAndUpdate({ id: req.params.postId }, { $pull: { likes: decoded.id } });
    } else {
      await Post.findOneAndUpdate({ id: req.params.postId }, { $addToSet: { likes: decoded.id } });
    }
    const updated = await Post.findOne({ id: req.params.postId });
    io.emit('post:liked', { postId: req.params.postId, likes: updated.likes });
    res.json({ likes: updated.likes });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content } = req.body;
    const comment = { id: uuidv4(), user_id: decoded.id, username: decoded.username, content, created_at: new Date() };
    await Post.findOneAndUpdate({ id: req.params.postId }, { $push: { comments: comment } });
    io.emit('post:commented', { postId: req.params.postId, comment });
    const updatedPost = await Post.findOne({ id: req.params.postId });
    res.json({ comments: updatedPost.comments });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/posts/:postId', async (req, res) => {
  try {
    const decoded = auth(req);
    await Post.deleteOne({ id: req.params.postId, user_id: decoded.id });
    io.emit('post:deleted', { postId: req.params.postId });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 部屋
app.get('/api/rooms', async (req, res) => {
  try {
    const decoded = auth(req);
    const rooms = await Room.find({ members: decoded.id });
    res.json(rooms.map(r => ({
      id: r.id, name: r.name, icon: r.icon, members: r.members,
      pinned_message_id: r.pinned_message_id,
      announcement: r.announcement || null,
      creator_id: r.creator_id || null,
    })));
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const decoded = auth(req);
    const { name, memberIds } = req.body;
    console.log("room create:", { name, memberIds, decodedId: decoded.id });
    const friends = await Friend.find({ user_id: decoded.id });
    const friendIds = friends.map(f => f.friend_id);
    const validMembers = memberIds.filter(id => friendIds.includes(id));
    console.log("friends:", friendIds, "valid:", validMembers);
    const members = [...new Set([decoded.id, ...validMembers])];
    const id = 'room_' + uuidv4();
    const room = await Room.create({ id, name, members, creator_id: decoded.id });
    members.forEach(mid => io.to('user_' + mid).emit('room:new', room));
    res.json(room);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.patch('/api/rooms/:roomId/name', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { name: req.body.name }, { new: true }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:updated', { roomId: room.id, name: room.name, icon: room.icon });
    res.json(room);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/rooms/:roomId/icon', upload.single('icon'), async (req, res) => {
  try {
    const decoded = auth(req);
    const icon = getFileUrl(req);
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { icon }, { new: true }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:updated', { roomId: req.params.roomId, icon });
    res.json({ icon });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/rooms/:roomId/members', async (req, res) => {
  try {
    const decoded = auth(req);
    const { memberIds } = req.body;
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { $addToSet: { members: { $each: memberIds } } }, { new: true }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    memberIds.forEach(mid => io.to('user_' + mid).emit('room:new', room));
    io.to(req.params.roomId).emit('room:members_updated', { roomId: req.params.roomId, members: room.members });
    res.json({ members: room.members });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// メッセージ転送API
app.post('/api/rooms/:roomId/forward', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content, type, fileData } = req.body;
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const id = uuidv4();
    const msg = await Message.create({
      id, room_id: req.params.roomId, sender_id: decoded.id, sender_name: decoded.username,
      content, type: type || 'text', file_data: fileData || null,
      read_by: [decoded.id], reactions: [], forwarded: true
    });
    const user = await User.findOne({ id: decoded.id });
    io.to(req.params.roomId).emit('message:receive', {
      id, roomId: req.params.roomId, senderId: decoded.id, senderName: decoded.username,
      senderAvatar: user?.avatar || null,
      content, type: type || 'text', fileData: fileData || null,
      forwarded: true, edited: false, deleted: false,
      read_by: [decoded.id], reactions: [], createdAt: msg.created_at
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(401).json({ error: '認証エラー' }); }
});

app.patch('/api/rooms/:roomId/pin', async (req, res) => {
  try {
    const decoded = auth(req);
    const { messageId } = req.body;
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { pinned_message_id: messageId || null }, { new: true }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:pinned', { roomId: req.params.roomId, messageId: messageId || null });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// メッセージ
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const msgs = await Message.find({ room_id: req.params.roomId }).sort({ created_at: 1 });
    res.json(msgs);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/rooms/:roomId/search', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const q = req.query.q || '';
    const query = {
      room_id: req.params.roomId, deleted: false,
      $or: [
        { content: new RegExp(q, 'i') },
        { sender_name: new RegExp(q, 'i') },
      ]
    };
    const msgs = await Message.find(query).sort({ created_at: 1 }).limit(50);
    res.json(msgs.map(m => ({
      id: m.id, content: m.content, type: m.type,
      senderId: m.sender_id, senderName: m.sender_name,
      createdAt: m.created_at, roomId: m.room_id,
      highlight: q,
    })));
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ノートAPI
// 共有ノート取得
app.get('/api/rooms/:roomId/note/shared', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOne({ room_id: req.params.roomId, user_id: null });
    res.json({ content: note?.content || '', updatedBy: note?.updated_by || null, updatedAt: note?.updated_at || null });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 共有ノート保存
app.put('/api/rooms/:roomId/note/shared', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOneAndUpdate(
      { room_id: req.params.roomId, user_id: null },
      { content: req.body.content, updated_by: decoded.username, updated_at: new Date(), $setOnInsert: { id: require('uuid').v4() } },
      { upsert: true, new: true }
    );
    // リアルタイムで他メンバーに通知
    req.app.get('io').to(req.params.roomId).emit('note:updated', { roomId: req.params.roomId, type: 'shared', content: note.content, updatedBy: decoded.username });
    res.json({ content: note.content, updatedBy: decoded.username, updatedAt: note.updated_at });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 個人ノート取得
app.get('/api/rooms/:roomId/note/mine', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOne({ room_id: req.params.roomId, user_id: decoded.id });
    res.json({ content: note?.content || '' });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 個人ノート保存
app.put('/api/rooms/:roomId/note/mine', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    await Note.findOneAndUpdate(
      { room_id: req.params.roomId, user_id: decoded.id },
      { content: req.body.content, updated_at: new Date(), $setOnInsert: { id: require('uuid').v4() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/rooms/:roomId/album', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const imgs = await Message.find({ room_id: req.params.roomId, type: 'image', deleted: false }).sort({ created_at: -1 });
    res.json(imgs);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    auth(req);
    if (!req.file) return res.status(400).json({ error: 'ファイルなし' });
    const isImage = /jpeg|jpg|png|gif/.test(req.file.mimetype);
    const isAudio = /webm|ogg|mp3|wav/.test(req.file.mimetype);
    res.json({
      url: getFileUrl(req),
      filename: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
      mimetype: req.file.mimetype,
      size: req.file.size,
      isImage, isAudio
    });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/debug-path', (req, res) => {
  res.json({ __dirname, clientBuild: join(__dirname, '../client/build') });
});

// Socket.io
io.use(async (socket, next) => {
  try {
    const decoded = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    // DBから最新のavatar情報を取得
    const user = await User.findOne({ id: decoded.id }, { password: 0 });
    socket.user = { ...decoded, avatar: user?.avatar || null };
    next();
  } catch { next(new Error('認証エラー')); }
});

io.on('connection', async (socket) => {
  console.log('接続:', socket.user.username);
  socket.join('user_' + socket.user.id);
  // オンライン状態をブロードキャスト
  if (!io.onlineUsers) io.onlineUsers = new Map();
  io.onlineUsers.set(socket.user.id, { name: socket.user.username, since: Date.now() });
  io.emit('user:online', { userId: socket.user.id });
  const myRooms = await Room.find({ members: socket.user.id });
  myRooms.forEach(r => socket.join(r.id));

  socket.on('room:join', (roomId) => socket.join(roomId));

  socket.on('message:send', async ({ roomId, content, type = 'text', fileData, replyTo, stampLabel }) => {
    const room = await Room.findOne({ id: roomId, members: socket.user.id });
    if (!room) return;
    if (room.members.length === 2) {
      const otherId = room.members.find(m => m !== socket.user.id);
      const isFriend = await Friend.findOne({ user_id: socket.user.id, friend_id: otherId });
      if (!isFriend) return;
    }
    const id = uuidv4();
    const msg = await Message.create({
      id, room_id: roomId, sender_id: socket.user.id, sender_name: socket.user.username,
      content, type, file_data: fileData || null, reply_to: replyTo || null, stamp_label: stampLabel || null,
      read_by: [socket.user.id], reactions: []
    });
    io.to(roomId).emit('message:receive', {
      id, roomId, senderId: socket.user.id, senderName: socket.user.username,
      senderAvatar: socket.user.avatar || null,
      content, type, fileData: fileData || null, replyTo: replyTo || null, stampLabel: stampLabel || null,
      edited: false, deleted: false, readBy: [socket.user.id], reactions: [], read_by: [socket.user.id],
      createdAt: msg.created_at
    });

    // Push通知: ルームにいない他のメンバーに通知
    const notifyBody = type === 'stamp' ? `${socket.user.username}: ${content}` : `${socket.user.username}: ${content}`;
    for (const memberId of room.members) {
      if (memberId === socket.user.id) continue;
      const sub = pushSubscriptions.get(memberId);
      if (!sub) continue;
      webpush.sendNotification(sub, JSON.stringify({
        title: room.name || socket.user.username,
        body: notifyBody.length > 50 ? notifyBody.slice(0, 50) + '...' : notifyBody,
        tag: roomId,
        url: '/',
      })).catch(() => pushSubscriptions.delete(memberId));
    }
  });

  socket.on('message:edit', async ({ roomId, messageId, content }) => {
    const msg = await Message.findOneAndUpdate(
      { id: messageId, sender_id: socket.user.id },
      { content, edited: true }, { new: true }
    );
    if (!msg) return;
    io.to(roomId).emit('message:edited', { messageId, content, roomId });
  });

  socket.on('message:delete', async ({ roomId, messageId }) => {
    const msg = await Message.findOneAndUpdate(
      { id: messageId, sender_id: socket.user.id },
      { deleted: true, content: 'このメッセージは削除されました' }
    );
    if (!msg) return;
    io.to(roomId).emit('message:deleted', { messageId, roomId });
  });

  socket.on('message:read', async ({ messageId, roomId }) => {
    await Message.findOneAndUpdate({ id: messageId }, { $addToSet: { read_by: socket.user.id } });
    const msg = await Message.findOne({ id: messageId });
    io.to(roomId).emit('message:read_update', { messageId, readBy: msg.read_by, roomId });
  });

  socket.on('message:react', async ({ roomId, messageId, emoji }) => {
    const msg = await Message.findOne({ id: messageId });
    if (!msg) return;
    const existing = msg.reactions.find(r => r.user_id === socket.user.id);
    if (existing) {
      if (existing.emoji === emoji) {
        await Message.findOneAndUpdate({ id: messageId }, { $pull: { reactions: { user_id: socket.user.id } } });
      } else {
        await Message.findOneAndUpdate({ id: messageId, 'reactions.user_id': socket.user.id }, { $set: { 'reactions.$.emoji': emoji } });
      }
    } else {
      await Message.findOneAndUpdate({ id: messageId }, { $push: { reactions: { emoji, user_id: socket.user.id } } });
    }
    const updated = await Message.findOne({ id: messageId });
    io.to(roomId).emit('message:reacted', { messageId, reactions: updated.reactions, roomId });
  });

  socket.on('room:leave', async ({ roomId }) => {
    await Room.findOneAndUpdate({ id: roomId }, { $pull: { members: socket.user.id } });
    socket.leave(roomId);
    const room = await Room.findOne({ id: roomId });
    io.to(roomId).emit('room:members_updated', { roomId, members: room.members });
    const sysId = uuidv4();
    await Message.create({
      id: sysId, room_id: roomId, sender_id: 'system', sender_name: 'system',
      content: `${socket.user.username} がグループを退出しました`, type: 'system'
    });
    io.to(roomId).emit('message:receive', {
      id: sysId, roomId, senderId: 'system', senderName: 'system',
      content: `${socket.user.username} がグループを退出しました`,
      type: 'system', replyTo: null, edited: false, deleted: false, readBy: [], reactions: [],
      createdAt: new Date().toISOString()
    });
    socket.emit('room:left', { roomId });
  });

  socket.on('typing:start', ({ roomId }) => {
    socket.to(roomId).emit('typing:update', { username: socket.user.username, isTyping: true });
  });

  socket.on('call:start', ({ roomId, offer, to }) => {
    // toが指定されていればそのユーザーに直接送る、なければroomにブロードキャスト
    if (to) {
      io.to('user_' + to).emit('call:incoming', { from: socket.user.id, fromName: socket.user.username, offer, roomId });
    } else {
      socket.to(roomId).emit('call:incoming', { from: socket.user.id, fromName: socket.user.username, offer, roomId });
    }
  });

  socket.on('call:answer', ({ answer, to }) => {
    io.to('user_' + to).emit('call:answered', { answer, from: socket.user.id });
  });

  socket.on('call:ice', ({ candidate, to }) => {
    io.to('user_' + to).emit('call:ice', { candidate, from: socket.user.id });
  });

  socket.on('call:end', ({ roomId, to }) => {
    if (to) {
      io.to('user_' + to).emit('call:ended', { from: socket.user.id });
    } else {
      socket.to(roomId).emit('call:ended', { from: socket.user.id });
    }
  });

  // ===== グループ通話シグナリング =====
  // gcallRooms: roomId -> Set of { userId, socketId, name }
  // グローバルに管理（再起動でリセット）
  socket.on('gcall:join', ({ roomId, name }) => {
    if (!io.gcallRooms) io.gcallRooms = {};
    if (!io.gcallRooms[roomId]) io.gcallRooms[roomId] = new Map();
    // 既存メンバー全員に通知
    for (const [uid, info] of io.gcallRooms[roomId]) {
      io.to(info.socketId).emit('gcall:peer_joined', { userId: socket.user.id, name });
    }
    io.gcallRooms[roomId].set(socket.user.id, { socketId: socket.id, name });
    socket.join('gcall_' + roomId);
  });

  socket.on('gcall:offer', ({ offer, to, roomId, fromName }) => {
    io.to('user_' + to).emit('gcall:offer', { offer, from: socket.user.id, fromName });
  });

  socket.on('gcall:answer', ({ answer, to, roomId }) => {
    io.to('user_' + to).emit('gcall:answer', { answer, from: socket.user.id });
  });

  socket.on('gcall:ice', ({ candidate, to, roomId }) => {
    io.to('user_' + to).emit('gcall:ice', { candidate, from: socket.user.id });
  });

  socket.on('gcall:leave', ({ roomId }) => {
    if (io.gcallRooms?.[roomId]) {
      io.gcallRooms[roomId].delete(socket.user.id);
      if (io.gcallRooms[roomId].size === 0) delete io.gcallRooms[roomId];
    }
    socket.to('gcall_' + roomId).emit('gcall:peer_left', { userId: socket.user.id });
    socket.leave('gcall_' + roomId);
  });

  socket.on('gcall:end', ({ roomId }) => {
    if (io.gcallRooms?.[roomId]) delete io.gcallRooms[roomId];
    socket.to('gcall_' + roomId).emit('gcall:ended');
    io.socketsLeave('gcall_' + roomId);
  });

  socket.on('call:reject', ({ to }) => {
    io.to('user_' + to).emit('call:rejected', { from: socket.user.id });
  });

  socket.on('disconnect', () => {
    console.log('切断:', socket.user.username);
    if (io.onlineUsers) {
      io.onlineUsers.delete(socket.user.id);
      io.emit('user:offline', { userId: socket.user.id, lastSeen: Date.now() });
    }
  });
});

// オンラインユーザー一覧
app.get('/api/users/online', authenticateToken, (req, res) => {
  const list = io.onlineUsers ? Array.from(io.onlineUsers.keys()) : [];
  res.json(list);
});

// ===== AI アシスタント =====
app.post('/api/ai/assist', async (req, res) => {
  try {
    auth(req);
    const { type, messages: msgs, text, targetLang } = req.body;
    let prompt = '';
    if (type === 'summary') {
      const chatText = msgs.map(m => `${m.senderName}: ${m.content}`).join('\n');
      prompt = `以下のチャット会話を日本語で3〜5行に要約してください。\n\n${chatText}`;
    } else if (type === 'translate') {
      prompt = `次のテキストを${targetLang || '英語'}に翻訳してください。翻訳結果だけ返してください。\n\n${text}`;
    } else if (type === 'suggest') {
      const chatText = msgs.slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');
      prompt = `以下の会話の流れを読んで、自然な返信案を3つ提案してください。番号付きリストで返してください。\n\n${chatText}`;
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || 'エラーが発生したで' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== スケジュール送信 =====
app.post('/api/rooms/:roomId/schedule', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content, sendAt } = req.body;
    const { v4: uuidv4 } = require('uuid');
    const user = await User.findOne({ id: decoded.id });
    const msg = await ScheduledMessage.create({
      id: 'sched_' + uuidv4(), room_id: req.params.roomId,
      sender_id: decoded.id, sender_name: user.display_name || user.username,
      content, send_at: new Date(sendAt)
    });
    res.json(msg);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/rooms/:roomId/scheduled', async (req, res) => {
  try {
    const decoded = auth(req);
    const msgs = await ScheduledMessage.find({ room_id: req.params.roomId, sender_id: decoded.id, sent: false }).sort({ send_at: 1 });
    res.json(msgs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/scheduled/:id', async (req, res) => {
  try {
    const decoded = auth(req);
    await ScheduledMessage.deleteOne({ id: req.params.id, sender_id: decoded.id });
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== 投票 =====
app.post('/api/rooms/:roomId/polls', async (req, res) => {
  try {
    const decoded = auth(req);
    const { v4: uuidv4 } = require('uuid');
    const { question, options, multi } = req.body;
    const poll = await Poll.create({
      id: 'poll_' + uuidv4(), room_id: req.params.roomId,
      creator_id: decoded.id, question, multi: !!multi,
      options: options.map((t, i) => ({ id: 'opt_' + i, text: t, voters: [] }))
    });
    // メッセージとして送信
    const user = await User.findOne({ id: decoded.id });
    const { v4: uuid2 } = require('uuid');
    const msg = await Message.create({
      id: 'msg_' + uuid2(), room_id: req.params.roomId,
      sender_id: decoded.id, sender_name: user.display_name || user.username,
      type: 'poll', content: poll.question,
      file_data: { pollId: poll.id },
      created_at: new Date()
    });
    io.to(req.params.roomId).emit('message:receive', {
      id: msg.id, roomId: req.params.roomId, senderId: msg.sender_id,
      senderName: msg.sender_name, type: 'poll', content: poll.question,
      fileData: { pollId: poll.id }, createdAt: msg.created_at, poll
    });
    res.json({ poll, message: msg });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/polls/:pollId', async (req, res) => {
  try {
    auth(req);
    const poll = await Poll.findOne({ id: req.params.pollId });
    res.json(poll);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/polls/:pollId/vote', async (req, res) => {
  try {
    const decoded = auth(req);
    const { optionId } = req.body;
    const poll = await Poll.findOne({ id: req.params.pollId });
    if (!poll || poll.closed) return res.status(400).json({ error: '投票できません' });
    // 既存の票を取り消し（複数選択でない場合）
    if (!poll.multi) {
      poll.options.forEach(o => { o.voters = o.voters.filter(v => v !== decoded.id); });
    }
    const opt = poll.options.find(o => o.id === optionId);
    if (!opt) return res.status(400).json({ error: '選択肢が見つかりません' });
    const already = opt.voters.includes(decoded.id);
    if (already) opt.voters = opt.voters.filter(v => v !== decoded.id);
    else opt.voters.push(decoded.id);
    await poll.save();
    io.to(poll.room_id).emit('poll:updated', poll);
    res.json(poll);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/polls/:pollId/close', async (req, res) => {
  try {
    const decoded = auth(req);
    const poll = await Poll.findOneAndUpdate({ id: req.params.pollId, creator_id: decoded.id }, { closed: true }, { new: true });
    io.to(poll.room_id).emit('poll:updated', poll);
    res.json(poll);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== タスク =====
app.post('/api/rooms/:roomId/tasks', async (req, res) => {
  try {
    const decoded = auth(req);
    const { v4: uuidv4 } = require('uuid');
    const { title, assigneeId, assigneeName, due } = req.body;
    const task = await Task.create({
      id: 'task_' + uuidv4(), room_id: req.params.roomId,
      creator_id: decoded.id, title, assignee_id: assigneeId,
      assignee_name: assigneeName, due: due ? new Date(due) : null
    });
    io.to(req.params.roomId).emit('task:new', task);
    res.json(task);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/rooms/:roomId/tasks', async (req, res) => {
  try {
    auth(req);
    const tasks = await Task.find({ room_id: req.params.roomId }).sort({ created_at: -1 });
    res.json(tasks);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    auth(req);
    const task = await Task.findOneAndUpdate({ id: req.params.taskId }, req.body, { new: true });
    io.to(task.room_id).emit('task:updated', task);
    res.json(task);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/tasks/:taskId', async (req, res) => {
  try {
    const decoded = auth(req);
    const task = await Task.findOne({ id: req.params.taskId });
    await Task.deleteOne({ id: req.params.taskId });
    io.to(task.room_id).emit('task:deleted', { taskId: req.params.taskId });
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== 期限付きメッセージ =====
// (通常メッセージのexpiresAtフィールドを使用、クリーンアップはcronで)
app.post('/api/rooms/:roomId/ephemeral', async (req, res) => {
  try {
    const decoded = auth(req);
    const { v4: uuidv4 } = require('uuid');
    const { content, ttlSeconds } = req.body;
    const user = await User.findOne({ id: decoded.id });
    const expiresAt = new Date(Date.now() + (ttlSeconds || 30) * 1000);
    const msg = await Message.create({
      id: 'msg_' + uuidv4(), room_id: req.params.roomId,
      sender_id: decoded.id, sender_name: user.display_name || user.username,
      content, type: 'ephemeral', expires_at: expiresAt, created_at: new Date()
    });
    io.to(req.params.roomId).emit('message:receive', {
      id: msg.id, roomId: req.params.roomId, senderId: msg.sender_id,
      senderName: msg.sender_name, type: 'ephemeral', content,
      expiresAt, createdAt: msg.created_at
    });
    // TTL後に自動削除
    setTimeout(async () => {
      await Message.deleteOne({ id: msg.id });
      io.to(req.params.roomId).emit('message:deleted', { messageId: msg.id, roomId: req.params.roomId });
    }, ttlSeconds * 1000);
    res.json(msg);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== スケジュール送信の実行（1分ごとにチェック） =====
setInterval(async () => {
  try {
    const now = new Date();
    const due = await ScheduledMessage.find({ sent: false, send_at: { $lte: now } });
    for (const sm of due) {
      const { v4: uuidv4 } = require('uuid');
      const msg = await Message.create({
        id: 'msg_' + uuidv4(), room_id: sm.room_id,
        sender_id: sm.sender_id, sender_name: sm.sender_name,
        content: sm.content, type: 'text', created_at: now
      });
      io.to(sm.room_id).emit('message:receive', {
        id: msg.id, roomId: sm.room_id, senderId: sm.sender_id,
        senderName: sm.sender_name, content: sm.content,
        type: 'text', createdAt: now
      });
      await ScheduledMessage.findOneAndUpdate({ id: sm.id }, { sent: true });
    }
  } catch(e) { console.error('スケジュール送信エラー:', e); }
}, 60000);

// gzip圧縮（全レスポンスに適用）
app.use(compression());

const clientBuild = join(__dirname, '../client/build');

// JS/CSSは1年キャッシュ（ファイル名にハッシュが入るので安全）
app.use('/static', express.static(join(clientBuild, 'static'), {
  maxAge: '1y',
  immutable: true,
}));

// index.htmlはキャッシュしない
app.use(express.static(clientBuild, { maxAge: 0 }));

app.get('/{*path}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(join(clientBuild, 'index.html'));
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => console.log('Server: http://localhost:' + PORT));
