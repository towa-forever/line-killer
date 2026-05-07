require("dotenv").config();
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

const { User, Room, Message, Friend, FriendRequest, Post, Note, ScheduledMessage, Poll, Task, Event, Favorite, GameScore, GameCoin, GameItem, Story, PushSubscription, News, OfficialRequest, OfficialAccount, ThreadMessage } = require('./db');

const app = express();
// Render等のリバースプロキシ対応（express-rate-limitのX-Forwarded-Forエラー解消）
app.set('trust proxy', 1);

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAwzRukb1C_xX8RFR2Luln0HcUEDsAgrimF1njzr2t4952nvpwfkrQ6yvSHE4z9wqXXpnp3tMhwzIBKuuvd5Xkk';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'NYWHWUJij3EUcOYPmq17yMihomww6SmBpvQe4ZTsDI0';
webpush.setVapidDetails('mailto:admin@line-killer.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// 管理者ユーザー名（お知らせ投稿・削除権限）
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'とわ';

// push購読をメモリで管理（再起動でリセットされるが無料プランでは許容）
const pushSubscriptions = new Map(); // userId -> subscription (メモリキャッシュ)
// 起動時にDBからpush subscriptionsを読み込む
(async () => {
  try {
    const subs = await PushSubscription.find().lean();
    subs.forEach(s => pushSubscriptions.set(s.user_id, s.subscription));
    console.log(`Push subscriptions loaded: ${subs.length}`);
  } catch(e) { console.error('Push subscription load error:', e); }
})();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL, 'http://localhost:3000'] : '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 20000,       // 20秒（デフォルト20000）
  pingInterval: 10000,      // 10秒ごとにping（デフォルト25000より短く）
  transports: ['websocket', 'polling'], // WebSocket優先
  upgradeTimeout: 5000,     // アップグレード待機5秒
  maxHttpBufferSize: 2e6,   // 2MB（メッセージバッファ）
  connectTimeout: 10000,    // 接続タイムアウト10秒
});
app.set('io', io);

app.use(cors({
  origin: process.env.CLIENT_URL
    ? [process.env.CLIENT_URL, 'http://localhost:3000']
    : true, // 開発環境では全オリジン許可
  credentials: true,
}));
app.use(compression()); // gzip圧縮（全ルートに有効）
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false })); // セキュリティヘッダー

// ログイン・登録のレートリミット（ブルートフォース対策）
// レートリミット（ブルートフォース対策のみ・緩め設定）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 500, // 十分に緩め
  message: { error: 'リクエストが多すぎます。しばらく待ってから試してください' },
  standardHeaders: true, legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false }, // Renderのプロキシ環境対応
  skip: (req) => !!req.headers.authorization, // 認証済みはスキップ
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
// 一般APIのレートリミットは無効化（Socket.ioと競合するため）
// 管理エンドポイント（ADMIN_KEY必須）
app.get('/admin/reset-requests', async (req, res) => {
  try {
    const key = req.query.key || req.headers['x-admin-key'];
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
    await FriendRequest.deleteMany({});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

app.use(express.json({ limit: '2mb' })); // メッセージ・投稿のbody制限

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

const ALLOWED_EXTENSIONS = new Set([
  '.jpg','.jpeg','.png','.gif','.webp','.mp4','.mov','.avi','.webm',
  '.pdf','.zip','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt',
  '.mp3','.wav','.ogg','.m4a','.aac',
]);
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) { cb(null, true); }
  else { cb(new Error('このファイル形式はアップロードできません'), false); }
};

const storage = cloudStorage || diskStorage;
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter });
const getFileUrl = (req) => {
  if (useCloudinary && req.file?.path) return req.file.path; // Cloudinaryは絶対URL
  return req.file ? `/uploads/${req.file.filename}` : null;
};
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

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
  { id: 20, name: 'お疲れ様セット', icon: '😴', stamps: [
    { emoji: '😴', label: 'お疲れ〜' }, { emoji: '🛌', label: 'もう寝る！' },
    { emoji: '☕', label: 'コーヒー休憩' }, { emoji: '🍵', label: 'お茶しよ' },
    { emoji: '😮‍💨', label: 'やれやれ…' }, { emoji: '🤕', label: 'つかれた〜' },
    { emoji: '💤', label: 'zzz…' }, { emoji: '🧘', label: 'リラックス' },
    { emoji: '🛁', label: 'お風呂入る！' }, { emoji: '🌙', label: 'おやすみ！' },
  ]},
  { id: 21, name: 'お腹すいたセット', icon: '🍜', stamps: [
    { emoji: '🍜', label: 'ラーメン食べたい！' }, { emoji: '🍣', label: 'お寿司！' },
    { emoji: '🍔', label: 'バーガー！' }, { emoji: '🍦', label: 'アイス！' },
    { emoji: '🍰', label: 'ケーキ！' }, { emoji: '🍕', label: 'ピザ！' },
    { emoji: '🥟', label: '餃子！' }, { emoji: '🍩', label: 'ドーナツ！' },
    { emoji: '🌮', label: 'タコス！' }, { emoji: '😋', label: 'うまそ〜！' },
  ]},
  { id: 22, name: 'リアクションセット', icon: '👍', stamps: [
    { emoji: '👍', label: 'いいね！' }, { emoji: '👎', label: 'よくない' },
    { emoji: '👏', label: 'パチパチ！' }, { emoji: '🙌', label: 'やったー！' },
    { emoji: '🤝', label: 'よろしく！' }, { emoji: '✌️', label: 'ピース！' },
    { emoji: '🤟', label: 'ラブ！' }, { emoji: '💪', label: 'ガンバ！' },
    { emoji: '🫶', label: 'ありがとう！' }, { emoji: '🤜', label: 'よっしゃ！' },
  ]},
  { id: 23, name: '天才・バカセット', icon: '🤓', stamps: [
    { emoji: '🤓', label: '天才！' }, { emoji: '🤡', label: 'バカ！' },
    { emoji: '🧠', label: '頭いい〜' }, { emoji: '💡', label: 'ひらめいた！' },
    { emoji: '🤔', label: 'うーん…' }, { emoji: '😵', label: 'わからん！' },
    { emoji: '🫠', label: 'とけそう' }, { emoji: '🤯', label: '頭爆発！' },
    { emoji: '😤', label: 'なめんな！' }, { emoji: '🙃', label: 'まあいいか' },
  ]},
  { id: 24, name: '返事セット', icon: '💬', stamps: [
    { emoji: '✅', label: 'OK！' }, { emoji: '❌', label: 'NG！' },
    { emoji: '❓', label: '？' }, { emoji: '❗', label: '！' },
    { emoji: '🆗', label: 'オーケー' }, { emoji: '🆘', label: 'たすけて！' },
    { emoji: '📢', label: '注目！' }, { emoji: '🔕', label: 'しずかに！' },
    { emoji: '💯', label: '100点！' }, { emoji: '🚫', label: 'ダメ！' },
  ]},
  { id: 25, name: 'ネコセット', icon: '🐱', stamps: [
    { emoji: '🐱', label: 'にゃ〜' }, { emoji: '😺', label: 'うれしい猫' },
    { emoji: '😸', label: '笑ってる猫' }, { emoji: '😹', label: '泣き笑い猫' },
    { emoji: '😻', label: 'ときめき猫' }, { emoji: '😼', label: 'ドヤ猫' },
    { emoji: '😽', label: 'チュー猫' }, { emoji: '🙀', label: 'びっくり猫' },
    { emoji: '😿', label: '悲しい猫' }, { emoji: '😾', label: 'おこ猫' },
  ]},
  { id: 26, name: '天気・自然セット', icon: '🌈', stamps: [
    { emoji: '🌈', label: '虹！' }, { emoji: '⛈️', label: '嵐だ！' },
    { emoji: '🌊', label: '波！' }, { emoji: '🌸', label: '桜！' },
    { emoji: '🍂', label: '秋！' }, { emoji: '❄️', label: '雪！' },
    { emoji: '🌺', label: '花！' }, { emoji: '🌻', label: 'ひまわり！' },
    { emoji: '🍀', label: 'ラッキー！' }, { emoji: '🌙', label: '月夜' },
  ]},
  { id: 27, name: 'パーティーセット', icon: '🥳', stamps: [
    { emoji: '🥳', label: 'パーティー！' }, { emoji: '🎂', label: 'お誕生日！' },
    { emoji: '🎁', label: 'プレゼント！' }, { emoji: '🎆', label: '花火！' },
    { emoji: '🍾', label: 'かんぱい！' }, { emoji: '🎤', label: 'カラオケ！' },
    { emoji: '🕺', label: 'ダンス！' }, { emoji: '💃', label: 'ノリノリ！' },
    { emoji: '🎉', label: 'やったー！' }, { emoji: '🥂', label: 'おめでとう！' },
  ]},
  { id: 28, name: '乗り物セット', icon: '🚗', stamps: [
    { emoji: '🚗', label: 'ドライブ！' }, { emoji: '🚆', label: '電車！' },
    { emoji: '✈️', label: '旅行！' }, { emoji: '🚢', label: 'クルーズ！' },
    { emoji: '🚲', label: 'サイクリング！' }, { emoji: '🏍️', label: 'バイク！' },
    { emoji: '🚁', label: 'ヘリ！' }, { emoji: '🛸', label: 'UFO！' },
    { emoji: '🚀', label: 'ロケット！' }, { emoji: '⛵', label: 'ヨット！' },
  ]},
  { id: 29, name: 'お金セット', icon: '💰', stamps: [
    { emoji: '💰', label: 'お金！' }, { emoji: '💸', label: 'お金飛ぶ！' },
    { emoji: '🤑', label: 'お金欲しい！' }, { emoji: '💳', label: 'カード払い' },
    { emoji: '🏦', label: '銀行！' }, { emoji: '📈', label: '株上がれ！' },
    { emoji: '📉', label: '下がった…' }, { emoji: '🎰', label: 'ギャンブル！' },
    { emoji: '💎', label: 'ダイヤ！' }, { emoji: '🏆', label: '一等賞！' },
  ]},
  { id: 30, name: '健康・運動セット', icon: '🏋️', stamps: [
    { emoji: '🏋️', label: '筋トレ！' }, { emoji: '🧗', label: 'クライミング！' },
    { emoji: '🏊', label: '水泳！' }, { emoji: '🚴', label: 'サイクリング！' },
    { emoji: '🧘', label: 'ヨガ！' }, { emoji: '🤸', label: '体操！' },
    { emoji: '🏄', label: 'サーフィン！' }, { emoji: '⛷️', label: 'スキー！' },
    { emoji: '🥊', label: 'ボクシング！' }, { emoji: '💪', label: '鍛えてる！' },
  ]},
  { id: 31, name: 'ホビーセット', icon: '🎯', stamps: [
    { emoji: '🎯', label: '的中！' }, { emoji: '♟️', label: 'チェス！' },
    { emoji: '🎲', label: 'サイコロ！' }, { emoji: '🧩', label: 'パズル！' },
    { emoji: '🎭', label: '演劇！' }, { emoji: '🖼️', label: '絵！' },
    { emoji: '📸', label: '写真！' }, { emoji: '✍️', label: '書道！' },
    { emoji: '🪆', label: 'マトリョーシカ！' }, { emoji: '🎋', label: '七夕！' },
  ]},
  { id: 32, name: 'SFセット', icon: '🤖', stamps: [
    { emoji: '🤖', label: 'ロボット！' }, { emoji: '👾', label: 'エイリアン！' },
    { emoji: '🛸', label: 'UFO来た！' }, { emoji: '🌌', label: '宇宙！' },
    { emoji: '⚡', label: 'エネルギー！' }, { emoji: '🔮', label: '予言！' },
    { emoji: '🧬', label: 'DNA！' }, { emoji: '💻', label: 'ハッキング！' },
    { emoji: '🕹️', label: 'コントローラー！' }, { emoji: '🦾', label: 'サイボーグ！' },
  ]},
  { id: 33, name: '恐竜・生き物セット', icon: '🦕', stamps: [
    { emoji: '🦕', label: 'ブラキオ！' }, { emoji: '🦖', label: 'ティラノ！' },
    { emoji: '🐉', label: 'ドラゴン！' }, { emoji: '🦋', label: '蝶！' },
    { emoji: '🐝', label: 'ハチ！' }, { emoji: '🦈', label: 'サメ！' },
    { emoji: '🐬', label: 'イルカ！' }, { emoji: '🦁', label: 'ライオン！' },
    { emoji: '🐺', label: 'オオカミ！' }, { emoji: '🦅', label: '鷹！' },
  ]},
  { id: 34, name: '魔法・ファンタジーセット', icon: '🧙', stamps: [
    { emoji: '🧙', label: '魔法使い！' }, { emoji: '🧚', label: '妖精！' },
    { emoji: '🧛', label: '吸血鬼！' }, { emoji: '🧜', label: '人魚！' },
    { emoji: '🧝', label: 'エルフ！' }, { emoji: '🧞', label: 'ジーニー！' },
    { emoji: '🪄', label: '魔法の杖！' }, { emoji: '🔮', label: '水晶玉！' },
    { emoji: '⚔️', label: '剣！' }, { emoji: '🛡️', label: '盾！' },
  ]},
  { id: 35, name: '日本文化セット', icon: '⛩️', stamps: [
    { emoji: '⛩️', label: '神社！' }, { emoji: '🗻', label: '富士山！' },
    { emoji: '🌸', label: '桜！' }, { emoji: '🍱', label: 'お弁当！' },
    { emoji: '🥷', label: '忍者！' }, { emoji: '🎐', label: '風鈴！' },
    { emoji: '🏮', label: 'ちょうちん！' }, { emoji: '🎍', label: '門松！' },
    { emoji: '👘', label: '着物！' }, { emoji: '🥁', label: '和太鼓！' },
  ]},
  { id: 36, name: 'ミーム・インターネットセット', icon: '💀', stamps: [
    { emoji: '💀', label: '草生えた' }, { emoji: '🗿', label: 'モアイ' },
    { emoji: '🤌', label: 'マンマミーア' }, { emoji: '😭', label: 'マジ泣ける' },
    { emoji: '🫡', label: 'ラジャ！' }, { emoji: '🥴', label: 'やばい' },
    { emoji: '😈', label: 'やってやる！' }, { emoji: '🧌', label: 'トロール！' },
    { emoji: '🫵', label: 'お前やな！' }, { emoji: '🤣', label: '爆笑' },
  ]},
  { id: 37, name: 'ビジネス敬語セット', icon: '💼', stamps: [
    { emoji: '🙇', label: 'お世話になります' }, { emoji: '📊', label: 'ご報告します' },
    { emoji: '📋', label: 'ご確認ください' }, { emoji: '✉️', label: 'ご連絡します' },
    { emoji: '🤝', label: 'よろしくお願いします' }, { emoji: '📌', label: 'ご注意ください' },
    { emoji: '⏰', label: 'お時間ください' }, { emoji: '🙏', label: 'ご了承ください' },
    { emoji: '📞', label: 'お電話します' }, { emoji: '💪', label: '全力で取り組みます' },
  ]},
  { id: 38, name: 'ベビー・こどもセット', icon: '👶', stamps: [
    { emoji: '👶', label: 'あかちゃん！' }, { emoji: '🍼', label: 'ミルク！' },
    { emoji: '🧸', label: 'ぬいぐるみ！' }, { emoji: '🎠', label: '遊園地！' },
    { emoji: '🪀', label: 'ヨーヨー！' }, { emoji: '🎪', label: 'サーカス！' },
    { emoji: '🎡', label: 'メリゴー！' }, { emoji: '🍭', label: 'アメ！' },
    { emoji: '🎈', label: '風船！' }, { emoji: '😊', label: 'えへへ' },
  ]},
  { id: 39, name: '天気・感情セット', icon: '🌤️', stamps: [
    { emoji: '🌤️', label: '晴れ！' }, { emoji: '🌧️', label: '雨だ…' },
    { emoji: '⛅', label: '曇り' }, { emoji: '🌩️', label: '雷！' },
    { emoji: '🌪️', label: '台風！' }, { emoji: '🌈', label: '虹！' },
    { emoji: '❄️', label: '雪だ！' }, { emoji: '🔥', label: '熱い！' },
    { emoji: '💧', label: 'しずく' }, { emoji: '🌊', label: '大波！' },
  ]},
  { id: 40, name: 'LINE Killerオリジナルセット', icon: '💬', stamps: [
    { emoji: '💬', label: 'LINE Killer！' }, { emoji: '🚀', label: 'LINEを超えた！' },
    { emoji: '👑', label: '俺が王者！' }, { emoji: '🔥', label: '燃えてるぜ！' },
    { emoji: '💎', label: 'プレミアム！' }, { emoji: '⚡', label: '爆速！' },
    { emoji: '🎯', label: '完璧！' }, { emoji: '🌟', label: '最高！' },
    { emoji: '🎊', label: 'みんなありがとう！' }, { emoji: '💚', label: 'LINE Killer愛してる！' },
  ]},
  { id: 41, name: 'ねこセット', icon: '🐱', stamps: [
    { emoji: '🐱', label: 'にゃ〜！' }, { emoji: '😸', label: 'うれしいにゃ！' },
    { emoji: '😹', label: 'わらえるにゃ！' }, { emoji: '😻', label: 'だいすきにゃ！' },
    { emoji: '😿', label: 'かなしいにゃ…' }, { emoji: '🙀', label: 'びっくりにゃ！' },
    { emoji: '😾', label: 'おこにゃ！' }, { emoji: '🐾', label: 'あしあとにゃ' },
    { emoji: '🐟', label: 'おさかな！' }, { emoji: '🧶', label: 'あそびたいにゃ' },
  ]},
  { id: 42, name: 'いぬセット', icon: '🐶', stamps: [
    { emoji: '🐶', label: 'わんわん！' }, { emoji: '🐕', label: 'おさんぽしたい！' },
    { emoji: '🦴', label: 'ほねだ！' }, { emoji: '🐾', label: 'あしあと！' },
    { emoji: '🐩', label: 'おしゃれ犬！' }, { emoji: '😊', label: 'しっぽふりふり' },
    { emoji: '🎾', label: 'ボールなげて！' }, { emoji: '😴', label: 'ねてるわん' },
    { emoji: '🍖', label: 'おやつほしい！' }, { emoji: '🏠', label: 'おうちかえろ！' },
  ]},
  { id: 43, name: 'ゆるふわセット', icon: '🌸', stamps: [
    { emoji: '🌸', label: 'ふわふわ〜' }, { emoji: '🍡', label: 'あまいもの食べたい' },
    { emoji: '🧸', label: 'くまのぬいぐるみ' }, { emoji: '🍰', label: 'ケーキ食べよ！' },
    { emoji: '🌺', label: 'はなが咲いたよ' }, { emoji: '☁️', label: 'くもみたいにふわふわ' },
    { emoji: '🦋', label: 'ちょうちょ〜' }, { emoji: '🍭', label: 'あめちゃん！' },
    { emoji: '🌙', label: 'おやすみなさい' }, { emoji: '⭐', label: 'きらきら〜' },
  ]},
  { id: 44, name: '敬語・ビジネスセット', icon: '💼', stamps: [
    { emoji: '🙇', label: 'よろしくお願いします' }, { emoji: '👔', label: 'お疲れ様です' },
    { emoji: '📋', label: '確認しました' }, { emoji: '✅', label: '了解いたしました' },
    { emoji: '🤝', label: 'お世話になります' }, { emoji: '📞', label: 'ご連絡ください' },
    { emoji: '⏰', label: '少々お待ちください' }, { emoji: '🔔', label: 'ご報告します' },
    { emoji: '📊', label: '資料を確認します' }, { emoji: '🙏', label: 'ありがとうございます' },
  ]},
  { id: 45, name: 'リアクション大全セット', icon: '🎭', stamps: [
    { emoji: '🤣', label: '爆笑！！' }, { emoji: '😱', label: 'まじか！！' },
    { emoji: '🥺', label: 'たのむ〜' }, { emoji: '😤', label: 'ぜったいやる！' },
    { emoji: '🤔', label: 'うーん…' }, { emoji: '😎', label: 'かっこいい！' },
    { emoji: '🥳', label: 'やったー！！' }, { emoji: '😭', label: 'もうだめだ…' },
    { emoji: '🤯', label: '頭爆発！！' }, { emoji: '💪', label: 'がんばるで！' },
  ]},
];

// ===== 新機能エンドポイント（パスワードリセット・PIN・後で読む・ギフト・下書き） =====
// ===== パスワードリセット =====

// 秘密の質問を設定
// リカバリーメールアドレス設定
app.post('/api/auth/recovery-email', async (req, res) => {
  try {
    const decoded = auth(req);
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: '正しいメールアドレスを入力してください' });
    await User.findOneAndUpdate({ id: decoded.id }, { recovery_email: email.trim().toLowerCase() }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// リカバリーメール確認（パスワードリセット用）
app.get('/api/auth/recovery-email/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }, { id: 1, username: 1, secret_question: 1, secret_answer: 1, recovery_email: 1 }).lean();
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (!user.recovery_email) return res.status(404).json({ error: 'リカバリーメールが設定されていません' });
    // セキュリティのためマスクして返す
    const email = user.recovery_email;
    const [local, domain] = email.split('@');
    const masked = local.slice(0, 2) + '***@' + domain;
    res.json({ maskedEmail: masked });
  } catch { res.status(500).json({ error: 'エラー' }); }
});

// パスワードリセット（メールアドレス確認）
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, email, newPassword } = req.body;
    if (!username || !email || !newPassword) return res.status(400).json({ error: '必須項目が不足しています' });
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (!user.recovery_email) return res.status(400).json({ error: 'リカバリーメールが設定されていません' });
    if (user.recovery_email.toLowerCase() !== email.trim().toLowerCase()) return res.status(401).json({ error: 'メールアドレスが違います' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ username }, { password: hashed }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'リセットに失敗しました' }); }
});

// 後方互換：秘密の質問（旧）
app.post('/api/auth/secret-question', async (req, res) => {
  try {
    const decoded = auth(req);
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: '質問と答えは必須です' });
    const hashed = await bcrypt.hash(answer.trim().toLowerCase(), 10);
    await User.findOneAndUpdate({ id: decoded.id }, { secret_question: question, secret_answer: hashed }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== 2段階認証（PIN） =====
app.post('/api/auth/pin/setup', async (req, res) => {
  try {
    const decoded = auth(req);
    const { pin } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PINは4〜6桁の数字にしてください' });
    const hashed = await bcrypt.hash(pin, 10);
    await User.findOneAndUpdate({ id: decoded.id }, { pin_code: hashed, pin_enabled: true }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/auth/pin/disable', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { pin_code: '', pin_enabled: false }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/auth/pin/verify', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { display_name: 1, username: 1, avatar: 1 }).lean();
    if (!user || !user.pin_enabled) return res.json({ ok: true }); // PIN未設定は通過
    const ok = await bcrypt.compare(String(req.body.pin), user.pin_code);
    if (!ok) return res.status(401).json({ error: 'PINが違います' });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== パスワード変更 =====
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const decoded = auth(req);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
    
    const user = await User.findOne({ id: decoded.id });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: '現在のパスワードが違います' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ id: decoded.id }, { password: hashed }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'サーバーエラー' }); }
});

// ===== ログイン履歴 =====
app.get('/api/auth/login-history', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json(user?.login_history?.slice(-10).reverse() || []);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== 認証 =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    const uname = username.trim();
    if (uname.length < 1) return res.status(400).json({ error: 'ユーザー名を入力してください' });
    if (uname.length > 30) return res.status(400).json({ error: 'ユーザー名は30文字以内にしてください' });
    if (password.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
    if (password.length > 100) return res.status(400).json({ error: 'パスワードが長すぎます' });
    // スペースと制御文字のみ禁止（日本語・記号はOK）
    if (/[\s\x00-\x1f]/.test(uname)) return res.status(400).json({ error: 'ユーザー名にスペースや制御文字は使えません' });
    const exists = await User.findOne({ username: uname }, { id: 1 }).lean();
    if (exists) return res.status(400).json({ error: 'このユーザー名は既に使われてます' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await User.create({ id, username: uname, password: hashed });
    const token = jwt.sign({ id, username: uname }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: {
      id, username: uname, avatar: null, displayName: uname,
      coverImage: '', bio: '', status: '',
      avatarFrame: 'none', soundTheme: 'default',
      pinEnabled: false, secretQuestion: '', blockedUsers: [],
      mutedRooms: [], bookmarks: [], coins: 100, parentAccountId: null,
    }});
  } catch(e) { console.error('register error:', e); res.status(500).json({ error: 'サーバーエラー' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    const user = await User.findOne({ username: username.trim() }).lean();
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'パスワードが違います' });
    // ログイン履歴を記録
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    await User.findOneAndUpdate({ id: user.id }, { $push: { login_history: { $each: [{ ip, ua, at: new Date() }], $slice: -20 } } }, {returnDocument:'after'});
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    User.findOneAndUpdate({ id: user.id }, { $inc: { login_count: 1 } }).then(() => checkAndAwardBadges(user.id));
    res.json({ token, user: {
      id: user.id, username: user.username, avatar: user.avatar || null,
      displayName: user.display_name || user.username,
      coverImage: user.cover_image || '',
      bio: user.bio || '', status: user.status || '',
      avatarFrame: user.avatar_frame || 'none',
      soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false,
      secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [],
      mutedRooms: user.muted_rooms || [],
      bookmarks: user.bookmarked_messages || [],
      coins: user.coins || 0,
      parentAccountId: user.parent_account_id || null,
      isOfficial: user.is_official || false,
      officialCategory: user.official_category || '',
      isAdmin: user.username.trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase(),
      pinnedRooms: user.pinned_rooms || [],
    }});
  } catch(e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { password: 0 }).lean();
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    res.json({ user: {
      id: user.id, username: user.username, avatar: user.avatar,
      coverImage: user.cover_image || '', displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      mutedRooms: user.muted_rooms || [], bookmarks: user.bookmarked_messages || [],
      avatarFrame: user.avatar_frame || 'none', soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false, secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [], showOnline: user.show_online !== false,
      coins: user.coins || 0,
      isOfficial: user.is_official || false,
      officialCategory: user.official_category || '',
      isAdmin: user.username.trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase(),
      pinnedRooms: user.pinned_rooms || [],
    }});
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});


// ===== バッジシステム =====
const BADGE_DEFINITIONS = [
  { id: 'first_message',  label: '初メッセージ',   emoji: '💬', desc: '初めてメッセージを送った',         check: u => u.message_count >= 1 },
  { id: 'chatter_100',    label: 'おしゃべり屋',   emoji: '🗣️', desc: 'メッセージを100件送った',          check: u => u.message_count >= 100 },
  { id: 'chatter_1000',   label: 'トーク王',       emoji: '👑', desc: 'メッセージを1000件送った',         check: u => u.message_count >= 1000 },
  { id: 'login_7',        label: '週間ログイン',   emoji: '📅', desc: '7回ログインした',                  check: u => u.login_count >= 7 },
  { id: 'login_30',       label: '皆勤賞',         emoji: '🏅', desc: '30回ログインした',                 check: u => u.login_count >= 30 },
  { id: 'gift_sender',    label: 'ギフト職人',     emoji: '🎁', desc: 'ギフトを送った',                  check: u => u.gift_sent >= 1 },
  { id: 'gift_popular',   label: 'モテモテ',       emoji: '💝', desc: 'ギフトを5個以上もらった',         check: u => u.gift_received >= 5 },
  { id: 'early_adopter',  label: 'アーリーアダプター', emoji: '🚀', desc: 'WakkaChatの初期ユーザー',    check: u => true }, // 登録済み全員
];

async function checkAndAwardBadges(userId) {
  try {
    const user = await User.findOne({ id: userId }).lean();
    if (!user) return [];
    const currentBadges = new Set(user.badges || []);
    const newBadges = BADGE_DEFINITIONS
      .filter(b => !currentBadges.has(b.id) && b.check(user))
      .map(b => b.id);
    if (newBadges.length > 0) {
      await User.findOneAndUpdate({ id: userId }, { $push: { badges: { $each: newBadges } } });
    }
    return newBadges;
  } catch(e) { return []; }
}

// /api/users/me のエイリアス（GETのみ）
app.get('/api/users/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { password: 0 }).lean();
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    res.json({
      id: user.id, username: user.username, avatar: user.avatar,
      coverImage: user.cover_image || '', displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      mutedRooms: user.muted_rooms || [], bookmarks: user.bookmarked_messages || [],
      avatarFrame: user.avatar_frame || 'none', soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false, secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [], coins: user.coins || 0,
      badges: user.badges || [], messageCount: user.message_count || 0,
    });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});


// ===== バッジAPI =====
app.get('/api/badges', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }).lean();
    const acquired = new Set(user?.badges || []);
    const result = BADGE_DEFINITIONS.map(b => ({
      ...b,
      check: undefined,
      acquired: acquired.has(b.id)
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: 'サーバーエラー' }); }
});


// ===== スレッド返信API =====
app.get('/api/threads/:parentId', async (req, res) => {
  try {
    auth(req);
    const threads = await ThreadMessage.find({ parent_id: req.params.parentId })
      .sort({ created_at: 1 }).limit(200).lean();
    res.json(threads.map(t => ({
      id: t.id, parentId: t.parent_id, roomId: t.room_id,
      senderId: t.sender_id, senderName: t.sender_name, senderAvatar: t.sender_avatar,
      content: t.content, createdAt: t.created_at
    })));
  } catch(e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

// ===== 下書き保存 =====
app.put('/api/drafts/:roomId', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content } = req.body;
    // $set/$unset で1回のDBアクセスに最適化
    const update = content
      ? { $set: { [`drafts.${req.params.roomId}`]: content } }
      : { $unset: { [`drafts.${req.params.roomId}`]: '' } };
    await User.findOneAndUpdate({ id: decoded.id }, update);
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/drafts', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json(user?.drafts || {});
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== 後で読む =====
app.post('/api/read-later/:msgId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { read_later: req.params.msgId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.delete('/api/read-later/:msgId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { read_later: req.params.msgId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/read-later', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const msgs = await Message.find({ id: { $in: user?.read_later || [] } }).limit(100).lean();
    res.json(msgs);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== ギフト送信 =====
app.post('/api/users/:userId/gift', async (req, res) => {
  try {
    const decoded = auth(req);
    const { amount, stampId } = req.body;
    if (!amount || amount < 1 || amount > 1000) return res.status(400).json({ error: 'ギフト量が不正です' });
    const receiver = await User.findOne({ id: req.params.userId }, { id: 1 }).lean();
    if (!receiver) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    // 原子的にコインを減算（コインが足りない場合はnullが返る）
    const sender = await User.findOneAndUpdate(
      { id: decoded.id, coins: { $gte: amount } },
      { $inc: { coins: -amount, gift_sent: amount } },
      { returnDocument: 'after', projection: { coins: 1 } }
    );
    if (!sender) return res.status(400).json({ error: 'コインが不足しています' });
    await User.findOneAndUpdate({ id: req.params.userId }, { $inc: { coins: amount, gift_received: amount } });
    // ギフト通知
    io.to('user_' + req.params.userId).emit('gift:received', {
      from: decoded.username, amount, stampId,
    });
    res.json({ ok: true, newBalance: sender.coins });
  } catch { res.status(500).json({ error: 'ギフト送信に失敗しました' }); }
});

// コイン残高取得
app.get('/api/users/me/coins', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json({ coins: user?.coins || 0, gift_sent: user?.gift_sent || 0, gift_received: user?.gift_received || 0 });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// Push通知API
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証エラー' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    pushSubscriptions.set(decoded.id, req.body);
    // DBにも保存（再起動対策）
    PushSubscription.findOneAndUpdate({ user_id: decoded.id }, { user_id: decoded.id, subscription: req.body, updated_at: new Date() }, { upsert: true,returnDocument:'after'}).catch(() => {});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.delete('/api/push/subscribe', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証エラー' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    pushSubscriptions.delete(decoded.id);
    PushSubscription.deleteOne({ user_id: decoded.id }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/stamps', (req, res) => res.json(STAMP_SETS));

app.post('/api/stamps/acquire', async (req, res) => {
  try {
    const decoded = auth(req);
    const { setId } = req.body;
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { acquired_stamps: setId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/stamps/mysets', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    // デフォルトで最初の3セットを全員に付与
    const defaultStamps = [1, 2, 3];
    const acquired = [...new Set([...defaultStamps, ...(user.acquired_stamps || [])])];
    // DBにも保存（初回のみ）
    if (!user.acquired_stamps || user.acquired_stamps.length === 0) {
      await User.findOneAndUpdate({ id: decoded.id }, { acquired_stamps: acquired }, {returnDocument:'after'});
    }
    res.json({ acquired });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ICEサーバー情報を提供（将来的に動的TURN認証に差し替え可能）
app.get('/api/ice-servers', (req, res) => {
  // METERED_API_KEY環境変数があれば動的取得、なければ静的リストを返す
  const iceServers = [
    // STUN（P2P直接接続の試行 - 高速）
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // TURN（NAT越え用 - Cloudflare、低遅延）
    {
      urls: 'turn:turn.cloudflare.com:3478?transport=udp',
      username: '${process.env.CF_TURN_TOKEN_ID || "cloudflare"}',
      credential: '${process.env.CF_TURN_API_TOKEN || "cloudflare"}',
    },
    // TURN fallback（TCP、ファイアウォール越え）
    { urls: 'turn:openrelay.metered.ca:80',            username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',          username: 'openrelayproject', credential: 'openrelayproject' },
  ];
  res.json({ iceServers });
});

// ===== グループ招待リンク =====
app.post('/api/rooms/:roomId/invite', async (req, res) => {
  try {
    const decoded = auth(req);
    let room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1, invite_code: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    if (!room.invite_code) {
      const code = uuidv4().replace(/-/g, '').slice(0, 12);
      await Room.updateOne({ id: req.params.roomId }, { $set: { invite_code: code } });
      room = { ...room, invite_code: code };
    }
    res.json({ inviteCode: room.invite_code, inviteUrl: `${process.env.CLIENT_URL || 'https://line-killer.onrender.com'}/invite/${room.invite_code}` });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/invite/:code/join', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ invite_code: req.params.code, invite_enabled: true });
    if (!room) return res.status(404).json({ error: '招待リンクが無効です' });
    if (room.members.includes(decoded.id)) return res.json({ ok: true, roomId: room.id, message: 'すでに参加しています' });
    room.members.push(decoded.id);
    await room.save();
    io.to('room_' + room.id).emit('room:member_joined', { roomId: room.id, userId: decoded.id, username: decoded.username });
    res.json({ ok: true, roomId: room.id, roomName: room.name });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== ユーザープロフィール表示 =====
app.get('/api/users/:username/profile', async (req, res) => {
  try {
    auth(req); // 認証必須
    const user = await User.findOne({ username: req.params.username }, { password: 0 });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json({
      id: user.id, username: user.username,
      displayName: user.display_name || user.username,
      avatar: user.avatar, coverImage: user.cover_image || '',
      bio: user.bio || '', status: user.status || '',
      avatarFrame: user.avatar_frame || 'none',
      isOnline: !!(io.onlineUsers?.has(user.id)),
      lastSeen: user.last_seen,
      showOnline: user.show_online !== false,
    });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== チャットテーマカラー =====
app.patch('/api/rooms/:roomId/theme', async (req, res) => {
  try {
    const decoded = auth(req);
    const { themeColor } = req.body;
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { theme_color: themeColor || '' },
      { returnDocument: 'after' }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to('room_' + req.params.roomId).emit('room:theme_changed', { roomId: req.params.roomId, themeColor: themeColor || '' });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== サブアカウント =====

// サブアカ一覧取得
app.get('/api/sub-accounts', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { sub_accounts: 1 }).lean();
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const subs = await User.find({ id: { $in: user.sub_accounts || [] } }, { password: 0 }).lean();
    res.json(subs.map(s => ({ id: s.id, username: s.username, displayName: s.display_name || s.username, avatar: s.avatar, bio: s.bio })));
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// サブアカ作成
app.post('/api/sub-accounts', async (req, res) => {
  try {
    const decoded = auth(req);
    const parent = await User.findOne({ id: decoded.id });
    if (!parent) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    // 親アカ自体もサブアカの場合は作成不可
    if (parent.parent_account_id) return res.status(400).json({ error: 'サブアカウントからはサブアカを作成できません' });
    // 上限チェック（最大5個）
    if ((parent.sub_accounts || []).length >= 5) return res.status(400).json({ error: 'サブアカウントは最大5個までです' });

    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'IDとパスワードは必須です' });
    
    

    const exists = await User.findOne({ username }, { id: 1 }).lean();
    if (exists) return res.status(400).json({ error: 'このIDはすでに使われています' });

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    const sub = await User.create({
      id, username, password: hashed,
      display_name: displayName || username,
      parent_account_id: parent.id,
    });
    parent.sub_accounts = [...(parent.sub_accounts || []), id];
    await parent.save();
    res.json({ ok: true, sub: { id: sub.id, username: sub.username, displayName: sub.display_name } });
  } catch (e) {
    console.error('[サブアカ作成]', e);
    res.status(500).json({ error: '作成に失敗しました' });
  }
});

// サブアカに切り替え（トークンを発行）
app.post('/api/sub-accounts/:subId/switch', async (req, res) => {
  try {
    const decoded = auth(req);
    const parent = await User.findOne({ id: decoded.id });
    // 親アカかサブアカ本人のみ切り替え可能
    const isParent = parent && (parent.sub_accounts || []).includes(req.params.subId);
    const isSelf   = decoded.id === req.params.subId;
    if (!isParent && !isSelf) return res.status(403).json({ error: '権限がありません' });

    const sub = await User.findOne({ id: req.params.subId });
    if (!sub) return res.status(404).json({ error: 'サブアカが見つかりません' });
    const token = jwt.sign({ id: sub.id, username: sub.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: {
      id: sub.id, username: sub.username,
      displayName: sub.display_name || sub.username,
      avatar: sub.avatar, bio: sub.bio || '', status: sub.status || '',
      parentAccountId: sub.parent_account_id,
    }});
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// サブアカ削除
app.delete('/api/sub-accounts/:subId', async (req, res) => {
  try {
    const decoded = auth(req);
    const parent = await User.findOne({ id: decoded.id });
    if (!parent || !(parent.sub_accounts || []).includes(req.params.subId)) return res.status(403).json({ error: '権限がありません' });
    await User.deleteOne({ id: req.params.subId });
    parent.sub_accounts = (parent.sub_accounts || []).filter(id => id !== req.params.subId);
    await parent.save();
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== お問い合わせ =====
const contactSchema = new mongoose.Schema({
  id: String,
  user_id: String,
  username: String,
  category: String,
  title: String,
  body: String,
  status: { type: String, default: 'open' }, // open | in_progress | closed
  created_at: { type: Date, default: Date.now },
});
const Contact = mongoose.model('Contact', contactSchema);

// お問い合わせ送信
app.post('/api/contact', async (req, res) => {
  try {
    const decoded = auth(req);
    const { category, title, body } = req.body;
    if (!category || !title?.trim() || !body?.trim()) return res.status(400).json({ error: '必須項目を入力してください' });
    if (body.trim().length < 10) return res.status(400).json({ error: '内容を10文字以上入力してください' });
    
    await Contact.create({ id: uuidv4(), user_id: decoded.id, username: decoded.username, category, title: title.trim(), body: body.trim() });
    // 管理者に通知
    io.emit('admin:contact_new', { username: decoded.username, category, title });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: '送信に失敗しました' }); }
});

// お問い合わせ一覧（管理者のみ）
app.get('/api/contact', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    if (!user || user.username !== ADMIN_USERNAME) return res.status(403).json({ error: '権限がありません' });
    const contacts = await Contact.find().sort({ created_at: -1 }).limit(100).lean();
    res.json(contacts);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== パスワード照合（管理者投稿前確認用）=====
app.post('/api/auth/verify-password', async (req, res) => {
  try {
    const decoded = auth(req);
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
    const user = await User.findOne({ id: decoded.id });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'パスワードが違います' });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// QRコードで友達追加（ユーザー名で検索して申請）
app.post('/api/friends/by-qr', async (req, res) => {
  try {
    const decoded = auth(req);
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'ユーザー名が必要です' });
    const target = await User.findOne({ username }, { id: 1, username: 1, display_name: 1, avatar: 1, status: 1 }).lean();
    if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (target.id === decoded.id) return res.status(400).json({ error: '自分自身には送れません' });
    const already = await Friend.findOne({ user_id: decoded.id, friend_id: target.id }).lean();
    if (already) return res.json({ ok: true, message: 'すでに友達です' });
    
    const id = uuidv4();
    await FriendRequest.create({ id, from_id: decoded.id, from_name: decoded.username, to_id: target.id });
    io.to('user_' + target.id).emit('friend:request', { id, from_id: decoded.id, from_name: decoded.username });
    res.json({ ok: true, message: '友達申請を送りました' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const { authorization } = req.headers;
    const token = authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const q = (req.query.q || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 50);
    if (!q) return res.json([]);
    const users = await User.find(
      {
        $or: [
          { username: { $regex: q, $options: 'i' } },
          { id: { $regex: q, $options: 'i' } }
        ],
        id: { $ne: decoded.id }
      },
      { id: 1, username: 1, display_name: 1, avatar: 1, status: 1, bio: 1, is_official: 1 }
    ).limit(20).lean();
    res.json(users);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/users', async (req, res) => {
  try {
    auth(req); // 認証必須
    const users = await User.find({}, { id: 1, username: 1, display_name: 1, avatar: 1, status: 1, is_official: 1 }).limit(500).lean();
    res.json(users);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.patch('/api/users/me', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  try {
    const decoded = auth(req);
    const { status, displayName, bio, avatarFrame, soundTheme, secretQuestion, secretAnswer, showOnline } = req.body;
    const update = {};
    if (req.files?.avatar?.[0]) update.avatar = getFileUrl({ file: req.files.avatar[0] });
    if (req.files?.cover?.[0])  update.cover_image = getFileUrl({ file: req.files.cover[0] });
    if (status !== undefined)      update.status = status;
    if (displayName !== undefined) update.display_name = displayName;
    if (bio !== undefined)         update.bio = bio;
    if (avatarFrame !== undefined) update.avatar_frame = avatarFrame;
    if (soundTheme !== undefined)  update.sound_theme = soundTheme;
    if (showOnline !== undefined)  update.show_online = showOnline === 'true' || showOnline === true;
    if (secretQuestion !== undefined) update.secret_question = secretQuestion;
    if (secretAnswer !== undefined && secretAnswer.trim()) {
      update.secret_answer = await bcrypt.hash(secretAnswer.trim().toLowerCase(), 10);
    }
    const user = await User.findOneAndUpdate({ id: decoded.id }, update, { returnDocument:'after', projection: { password: 0 } });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const userRes = {
      id: user.id, username: user.username, avatar: user.avatar || null,
      coverImage: user.cover_image || '',
      displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      avatarFrame: user.avatar_frame || 'none',
      soundTheme: user.sound_theme || 'default',
      secretQuestion: user.secret_question || '',
      pinEnabled: user.pin_enabled || false,
      showOnline: user.show_online !== false,
      blockedUsers: user.blocked_users || [],
      mutedRooms: user.muted_rooms || [],
      bookmarks: user.bookmarked_messages || [],
      coins: user.coins || 0,
      parentAccountId: user.parent_account_id || null,
      isOfficial: user.is_official || false,
      officialCategory: user.official_category || '',
      isAdmin: user.username.trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase(),
    };
    io.to('user_' + decoded.id).emit('user:updated', userRes);
    res.json(userRes);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 設定専用エンドポイント（JSON送信・ファイルなし）
app.patch('/api/users/me/settings', async (req, res) => {
  try {
    const decoded = auth(req);
    const { status, displayName, bio, avatarFrame, soundTheme, showOnline, autoStatusRules } = req.body;
    const update = {};
    if (status !== undefined)          update.status = status;
    if (displayName !== undefined)     update.display_name = displayName;
    if (bio !== undefined)             update.bio = bio;
    if (avatarFrame !== undefined)     update.avatar_frame = avatarFrame;
    if (soundTheme !== undefined)      update.sound_theme = soundTheme;
    if (showOnline !== undefined)      update.show_online = showOnline === 'true' || showOnline === true;
    if (autoStatusRules !== undefined) update.auto_status_rules = autoStatusRules;
    const user = await User.findOneAndUpdate({ id: decoded.id }, update, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const userRes = {
      id: user.id, username: user.username, avatar: user.avatar || null,
      coverImage: user.cover_image || '', displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      avatarFrame: user.avatar_frame || 'none', soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false, showOnline: user.show_online !== false,
      secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [], mutedRooms: user.muted_rooms || [],
      bookmarks: user.bookmarked_messages || [], coins: user.coins || 0,
      parentAccountId: user.parent_account_id || null,
      isOfficial: user.is_official || false,
      officialCategory: user.official_category || '',
      isAdmin: user.username.trim().toLowerCase() === ADMIN_USERNAME.trim().toLowerCase(),
    };
    res.json(userRes);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/friend-requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const requests = await FriendRequest.find({ to_id: decoded.id, status: 'pending' }).lean();
    // 申請者のアバターを一括取得（N+1解消）
    const fromIds = requests.map(r => r.from_id);
    const fromUsers = await User.find({ id: { $in: fromIds } }, { id: 1, avatar: 1, display_name: 1 }).lean();
    const fromUserMap = Object.fromEntries(fromUsers.map(u => [u.id, u]));
    const withAvatar = requests.map(r => {
      const fromUser = fromUserMap[r.from_id];
      return { ...r, from_avatar: fromUser?.avatar || null, from_display_name: fromUser?.display_name || r.from_name };
    });
    res.json(withAvatar);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/friend-requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const { toId } = req.body;
    if (toId === decoded.id) return res.status(400).json({ error: '自分には送れません' });
    const existing = await FriendRequest.findOne({ from_id: decoded.id, to_id: toId, status: 'pending' }).lean();
    if (existing) return res.status(400).json({ error: '既に申請済みです' });
    const alreadyFriend = await Friend.findOne({ user_id: decoded.id, friend_id: toId }).lean();
    if (alreadyFriend) return res.status(400).json({ error: '既に友だちです' });
    const id = uuidv4();
    const request = await FriendRequest.create({ id, from_id: decoded.id, from_name: decoded.username, to_id: toId });
    io.to('user_' + toId).emit('friend:request', { id, from_id: decoded.id, from_name: decoded.username });
    res.json(request);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/friend-requests/:requestId/accept', async (req, res) => {
  try {
    const decoded = auth(req);
    const request = await FriendRequest.findOne({ id: req.params.requestId, to_id: decoded.id }).lean();
    if (!request) return res.status(404).json({ error: '申請が見つかりません' });
    await FriendRequest.findOneAndUpdate({ id: req.params.requestId }, { status: 'accepted' }, {returnDocument:'after'});
    await Friend.findOneAndUpdate(
      { user_id: decoded.id, friend_id: request.from_id },
      { $setOnInsert: { user_id: decoded.id, friend_id: request.from_id } },
      { upsert: true, returnDocument: 'after' }
    );
    await Friend.findOneAndUpdate(
      { user_id: request.from_id, friend_id: decoded.id },
      { $setOnInsert: { user_id: request.from_id, friend_id: decoded.id } },
      { upsert: true, returnDocument: 'after' }
    );
    io.to('user_' + request.from_id).emit('friend:accepted', { by_id: decoded.id, by_name: decoded.username });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/friend-requests/:requestId/reject', async (req, res) => {
  try {
    const decoded = auth(req);
    await FriendRequest.findOneAndUpdate({ id: req.params.requestId, to_id: decoded.id }, { status: 'rejected' }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 友だち
app.get('/api/friends', async (req, res) => {
  try {
    const decoded = auth(req);
    const friends = await Friend.find({ user_id: decoded.id }).lean();
    const users = await User.find({ id: { $in: friends.map(f => f.friend_id) } }, { password: 0 }).lean();
    // idフィールドを確実に含める（MongoDBの_idとカスタムidを両方返す）
    const result = users.map(u => ({
      id: u.id,
      _id: u._id,
      username: u.username,
      display_name: u.display_name || u.username,
      avatar: u.avatar || null,
      status: u.status || '',
      bio: u.bio || '',
    }));
    res.json(result);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.delete('/api/friends/:friendId', async (req, res) => {
  try {
    const decoded = auth(req);
    await Friend.deleteOne({ user_id: decoded.id, friend_id: req.params.friendId });
    await Friend.deleteOne({ user_id: req.params.friendId, friend_id: decoded.id });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ブロック
app.post('/api/users/:userId/block', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { blocked_users: req.params.userId } }, {returnDocument:'after'});
    await Friend.deleteOne({ user_id: decoded.id, friend_id: req.params.userId });
    await Friend.deleteOne({ user_id: req.params.userId, friend_id: decoded.id });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.delete('/api/users/:userId/block', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { blocked_users: req.params.userId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/users/blocked', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const blocked = await User.find({ id: { $in: user.blocked_users || [] } }, { password: 0 }).lean();
    res.json(blocked);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 通知OFF
app.post('/api/rooms/:roomId/mute', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { muted_rooms: req.params.roomId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ブックマーク追加・削除
app.post('/api/bookmarks/:messageId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { bookmarked_messages: req.params.messageId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});
app.delete('/api/bookmarks/:messageId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { bookmarked_messages: req.params.messageId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});
app.get('/api/bookmarks', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const msgs = await Message.find({ id: { $in: user.bookmarked_messages || [] } }).limit(100).lean();
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
    const annText = (req.body.text || '').slice(0, 200); // 200文字まで
    await Room.findOneAndUpdate({ id: req.params.roomId }, { announcement: annText }, {returnDocument:'after'});
    io.to(req.params.roomId).emit('room:announcement', { roomId: req.params.roomId, text: annText, by: decoded.id });
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'エラー' }); }
});

app.delete('/api/rooms/:roomId/mute', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { muted_rooms: req.params.roomId } }, {returnDocument:'after'});
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// タイムライン
app.get('/api/posts', async (req, res) => {
  try {
    auth(req);
    const posts = await Post.find().sort({ created_at: -1 }).limit(50).lean();
    res.json(posts);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const decoded = auth(req);
    // JWTにusernameがない古いトークン対策：DBから必ず取得
    const user = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません。ログインし直してください' });
    const actualUsername = user.username;
    // 管理者のみ投稿可能
    if (actualUsername.trim().toLowerCase() !== ADMIN_USERNAME.trim().toLowerCase()) {
      return res.status(403).json({ error: `お知らせの投稿は管理者のみです（あなたのID: ${actualUsername}）` });
    }
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: '内容を入力してください' });
    const id = uuidv4();
    const post = await Post.create({
      id, user_id: user.id, username: actualUsername,
      avatar: user.avatar || null,
      content: content || '',
      image: req.file ? getFileUrl(req) : null
    });
    io.emit('post:new', post);
    res.json(post);
  } catch (e) {
    console.error('[投稿API] エラー:', e.message);
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'ログインし直してください' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts/:postId/like', async (req, res) => {
  try {
    const decoded = auth(req);
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    const liked = post.likes.includes(decoded.id);
    if (liked) {
      await Post.findOneAndUpdate({ id: req.params.postId }, { $pull: { likes: decoded.id } }, {returnDocument:'after'});
    } else {
      await Post.findOneAndUpdate({ id: req.params.postId }, { $addToSet: { likes: decoded.id } }, {returnDocument:'after'});
    }
    const updated = await Post.findOne({ id: req.params.postId });
    io.emit('post:liked', { postId: req.params.postId, likes: updated.likes });
    res.json({ likes: updated.likes });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'コメントを入力してください' });
    const comment = { id: uuidv4(), user_id: decoded.id, username: decoded.username, content: content.trim().slice(0, 500), created_at: new Date() };
    await Post.findOneAndUpdate({ id: req.params.postId }, { $push: { comments: comment } }, {returnDocument:'after'});
    io.emit('post:commented', { postId: req.params.postId, comment });
    const updatedPost = await Post.findOne({ id: req.params.postId });
    res.json({ comments: updatedPost.comments });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.delete('/api/posts/:postId', async (req, res) => {
  try {
    const decoded = auth(req);
    await Post.deleteOne({ id: req.params.postId, user_id: decoded.id });
    io.emit('post:deleted', { postId: req.params.postId });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// コメント削除（自分のコメントのみ）
app.delete('/api/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    const decoded = auth(req);
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    const comment = post.comments.find(c => c.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'コメントが見つかりません' });
    if (comment.user_id !== decoded.id) return res.status(403).json({ error: '削除できるのは自分のコメントのみです' });
    await Post.findOneAndUpdate(
      { id: req.params.postId },
      { $pull: { comments: { id: req.params.commentId } } },
      { returnDocument: 'after' }
    );
    io.emit('post:comment_deleted', { postId: req.params.postId, commentId: req.params.commentId });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== トークピン留めAPI =====
app.post('/api/rooms/:roomId/pin', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { pinned_rooms: 1 }).lean();
    const isPinned = (user.pinned_rooms || []).includes(req.params.roomId);
    const update = isPinned
      ? { $pull: { pinned_rooms: req.params.roomId } }
      : { $addToSet: { pinned_rooms: req.params.roomId } };
    await User.findOneAndUpdate({ id: decoded.id }, update);
    res.json({ pinned: !isPinned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ===== 公式アカウント（ボット）API =====

// 公式アカウント一覧（全ユーザー見られる）
app.get('/api/official-accounts', async (req, res) => {
  try {
    const accounts = await OfficialAccount.find().sort({ created_at: -1 }).lean();
    // フォロワー数だけ返す（全IDは不要）
    const result = accounts.map(a => ({ ...a, followerCount: a.followers.length, isFollowing: false }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式アカウント一覧（ログイン済み・自分のフォロー状態付き）
app.get('/api/official-accounts/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const accounts = await OfficialAccount.find().sort({ created_at: -1 }).lean();
    const result = accounts.map(a => ({
      ...a,
      followerCount: a.followers.length,
      isFollowing: a.followers.includes(decoded.id),
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式アカウント作成（管理者のみ）
app.post('/api/official-accounts', upload.single('avatar'), async (req, res) => {
  try {
    const decoded = await adminAuth(req);
    const { name, description, category } = req.body;
    if (!name) return res.status(400).json({ error: '名前を入力してください' });
    const account = await OfficialAccount.create({
      id: uuidv4(),
      name,
      description: description || '',
      avatar: req.file ? getFileUrl(req) : null,
      category: category || 'その他',
      created_by: decoded.id,
    });
    res.json(account);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 公式アカウント更新（管理者のみ）
app.patch('/api/official-accounts/:accountId', upload.single('avatar'), async (req, res) => {
  try {
    await adminAuth(req);
    const { name, description, category } = req.body;
    const update = {};
    if (name) update.name = name;
    if (description !== undefined) update.description = description;
    if (category) update.category = category;
    if (req.file) update.avatar = getFileUrl(req);
    const account = await OfficialAccount.findOneAndUpdate({ id: req.params.accountId }, update, { returnDocument: 'after' }).lean();
    res.json(account);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 公式アカウント削除（管理者のみ）
app.delete('/api/official-accounts/:accountId', async (req, res) => {
  try {
    await adminAuth(req);
    await OfficialAccount.deleteOne({ id: req.params.accountId });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 友達追加/解除
app.post('/api/official-accounts/:accountId/follow', async (req, res) => {
  try {
    const decoded = auth(req);
    const account = await OfficialAccount.findOne({ id: req.params.accountId });
    if (!account) return res.status(404).json({ error: 'アカウントが見つかりません' });
    const isFollowing = account.followers.includes(decoded.id);
    if (isFollowing) {
      await OfficialAccount.findOneAndUpdate({ id: req.params.accountId }, { $pull: { followers: decoded.id } });
    } else {
      await OfficialAccount.findOneAndUpdate({ id: req.params.accountId }, { $addToSet: { followers: decoded.id } });
      // 友達追加時にウェルカムメッセージをDM送信
      const user = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
      const welcomeRoom = await getOrCreateDMRoom(decoded.id, account.id, account.name, account.avatar);
      if (welcomeRoom && account.description) {
        const msg = await Message.create({
          id: uuidv4(),
          room_id: welcomeRoom.id,
          sender_id: account.id,
          sender_name: account.name,
          sender_avatar: account.avatar,
          content: account.description,
          type: 'text',
        });
        io.to(welcomeRoom.id).emit('message:new', msg);
        io.to('user_' + decoded.id).emit('message:new', msg);
        // ウェルカムメッセージのPush通知
        const sub = pushSubscriptions.get(decoded.id);
        if (sub) {
          webpush.sendNotification(sub, JSON.stringify({
            title: account.name,
            body: account.description.slice(0, 80),
            tag: welcomeRoom.id,
            url: '/',
          })).catch(() => {});
        }
      }
    }
    res.json({ isFollowing: !isFollowing });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式アカウントから一斉DM送信（管理者のみ）
app.post('/api/official-accounts/:accountId/broadcast', upload.single('image'), async (req, res) => {
  try {
    await adminAuth(req);
    const account = await OfficialAccount.findOne({ id: req.params.accountId }).lean();
    if (!account) return res.status(404).json({ error: 'アカウントが見つかりません' });
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'メッセージを入力してください' });
    let sentCount = 0;
    for (const followerId of account.followers) {
      try {
        const room = await getOrCreateDMRoom(followerId, account.id, account.name, account.avatar);
        if (!room) continue;
        const msg = await Message.create({
          id: uuidv4(),
          room_id: room.id,
          sender_id: account.id,
          sender_name: account.name,
          sender_avatar: account.avatar,
          content: content || '',
          image: req.file ? getFileUrl(req) : null,
          type: 'text',
        });
        io.to(room.id).emit('message:new', msg);
        io.to('user_' + followerId).emit('message:new', msg);
        // Push通知
        const sub = pushSubscriptions.get(followerId);
        if (sub) {
          webpush.sendNotification(sub, JSON.stringify({
            title: account.name,
            body: (content || '').slice(0, 80) || '📎 ファイル',
            tag: room.id,
            url: '/',
          })).catch(() => {});
        }
        sentCount++;
      } catch (_) {}
    }
    res.json({ sent: sentCount, total: account.followers.length });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// DMルーム取得 or 作成（公式アカウント用ヘルパー）
async function getOrCreateDMRoom(userId, officialId, officialName, officialAvatar) {
  const membersSorted = [userId, officialId].sort();
  let room = await Room.findOne({ type: 'dm', members: { $all: membersSorted, $size: 2 } }).lean();
  if (!room) {
    room = await Room.create({
      id: uuidv4(),
      name: officialName,
      type: 'dm',
      members: membersSorted,
      avatar: officialAvatar,
      created_by: officialId,
    });
  }
  return room;
}


// ===== VOOM API =====
// VOOM投稿一覧
app.get('/api/voom', async (req, res) => {
  try {
    auth(req);
    const posts = await Post.find({ type: 'voom' }).sort({ created_at: -1 }).limit(50).lean();
    res.json(posts);
  } catch (e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

// VOOM投稿（誰でも可）
app.post('/api/voom', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { username: 1, display_name: 1, avatar: 1 }).lean();
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    const { content } = req.body;
    if (!content && !req.files?.image && !req.files?.video) return res.status(400).json({ error: '内容を入力してください' });
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];
    const post = await Post.create({
      id: uuidv4(), user_id: decoded.id,
      username: user.username, display_name: user.display_name || user.username,
      avatar: user.avatar || null,
      content: content || '', type: 'voom',
      image: imageFile ? `/uploads/${imageFile.filename}` : null,
      video: videoFile ? `/uploads/${videoFile.filename}` : null,
    });
    io.emit('voom:new', post);
    res.json(post);
  } catch (e) { const s = (e?.name?.includes('JsonWebToken') || e?.name?.includes('TokenExpired')) ? 401 : 500; res.status(s).json({ error: s === 401 ? '認証エラー' : e.message }); }
});

// VOOMリポスト
app.post('/api/voom/:postId/repost', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { username: 1, display_name: 1, avatar: 1 }).lean();
    const original = await Post.findOne({ id: req.params.postId }).lean();
    if (!original) return res.status(404).json({ error: '投稿が見つかりません' });
    // すでにリポスト済みチェック
    const already = await Post.findOne({ repost_of: req.params.postId, user_id: decoded.id });
    if (already) {
      await Post.deleteOne({ id: already.id });
      await Post.findOneAndUpdate({ id: req.params.postId }, { $pull: { reposts: decoded.id } });
      io.emit('voom:unreposted', { postId: req.params.postId, userId: decoded.id });
      return res.json({ reposted: false });
    }
    const repost = await Post.create({
      id: uuidv4(), user_id: decoded.id,
      username: user.username, display_name: user.display_name || user.username,
      avatar: user.avatar, content: req.body.comment || '',
      type: 'voom', repost_of: original.id,
      repost_user: { id: original.user_id, username: original.username, display_name: original.display_name, avatar: original.avatar },
    });
    await Post.findOneAndUpdate({ id: req.params.postId }, { $addToSet: { reposts: decoded.id } });
    io.emit('voom:reposted', { postId: req.params.postId, repost, userId: decoded.id });
    res.json({ reposted: true, repost });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VOOM いいね（既存のpost:likeと共用）
app.post('/api/voom/:postId/like', async (req, res) => {
  try {
    const decoded = auth(req);
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    const liked = post.likes.includes(decoded.id);
    const update = liked ? { $pull: { likes: decoded.id } } : { $addToSet: { likes: decoded.id } };
    await Post.findOneAndUpdate({ id: req.params.postId }, update);
    const updated = await Post.findOne({ id: req.params.postId }).lean();
    io.emit('voom:liked', { postId: req.params.postId, likes: updated.likes });
    res.json({ likes: updated.likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VOOM削除
app.delete('/api/voom/:postId', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    if (post.user_id !== decoded.id && user.username !== ADMIN_USERNAME) return res.status(403).json({ error: '削除権限がありません' });
    await Post.deleteOne({ id: req.params.postId });
    io.emit('voom:deleted', { postId: req.params.postId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 管理者API =====
const adminAuth = async (req) => {
  const decoded = auth(req);
  const user = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
  if (!user || user.username.trim().toLowerCase() !== ADMIN_USERNAME.trim().toLowerCase())
    throw Object.assign(new Error('管理者のみアクセス可能'), { status: 403 });
  return decoded;
};

// ユーザー一覧（管理者）
app.get('/api/admin/users', async (req, res) => {
  try {
    await adminAuth(req);
    const { q } = req.query;
    const filter = q ? { $or: [{ username: { $regex: q, $options: 'i' } }, { display_name: { $regex: q, $options: 'i' } }, { id: { $regex: q, $options: 'i' } }] } : {};
    const users = await User.find(filter, { password: 0 }).sort({ created_at: -1 }).limit(100).lean();
    res.json(users);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ユーザーに公式マーク付与/剥奪（管理者）
app.patch('/api/admin/users/:userId/official', async (req, res) => {
  try {
    await adminAuth(req);
    const { official, category } = req.body;
    const user = await User.findOneAndUpdate(
      { id: req.params.userId },
      { is_official: !!official, official_verified: !!official, official_category: category || '' },
      { returnDocument: 'after' }
    ).lean();
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ユーザー削除（管理者）
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const decoded = await adminAuth(req);
    if (req.params.userId === decoded.id) return res.status(400).json({ error: '自分自身は削除できません' });
    await User.deleteOne({ id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 公式申請一覧（管理者）- 既存と統合
app.get('/api/admin/official-requests', async (req, res) => {
  try {
    await adminAuth(req);
    const requests = await OfficialRequest.find({ status: 'pending' }).sort({ created_at: -1 }).lean();
    res.json(requests);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 公式申請 承認/拒否（管理者）
app.patch('/api/admin/official-requests/:id', async (req, res) => {
  try {
    await adminAuth(req);
    const { action } = req.body;
    const request = await OfficialRequest.findOne({ id: req.params.id });
    if (!request) return res.status(404).json({ error: '申請が見つかりません' });
    await OfficialRequest.findOneAndUpdate({ id: req.params.id }, { status: action === 'approve' ? 'approved' : 'rejected' });
    if (action === 'approve') {
      await User.findOneAndUpdate({ id: request.user_id }, { is_official: true, official_verified: true, official_category: request.category });
    }
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 管理者自身を即時公式化
app.post('/api/admin/self-official', async (req, res) => {
  try {
    const decoded = await adminAuth(req);
    const { official, category } = req.body;
    await User.findOneAndUpdate({ id: decoded.id }, { is_official: !!official, official_verified: !!official, official_category: category || '管理者' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});


// ===== 公式アカウント 一斉送信API =====
// 公式アカウントから友達全員にDMを一斉送信
app.post('/api/official/broadcast', upload.single('image'), async (req, res) => {
  try {
    const decoded = auth(req);
    const sender = await User.findOne({ id: decoded.id }, { username: 1, display_name: 1, avatar: 1, is_official: 1 }).lean();
    if (!sender.is_official) return res.status(403).json({ error: '公式アカウントのみ使用できます' });

    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'メッセージを入力してください' });

    // 送信者の友達を全員取得
    const friends = await Friend.find({ user_id: decoded.id }, { friend_id: 1 }).lean();
    if (friends.length === 0) return res.json({ sent: 0 });

    let sentCount = 0;
    for (const f of friends) {
      try {
        // DMルームを取得 or 作成
        const membersSorted = [decoded.id, f.friend_id].sort();
        let room = await Room.findOne({ type: 'dm', members: { $all: membersSorted, $size: 2 } }).lean();
        if (!room) {
          const friendUser = await User.findOne({ id: f.friend_id }, { username: 1, display_name: 1 }).lean();
          room = await Room.create({
            id: uuidv4(),
            name: friendUser?.display_name || friendUser?.username || f.friend_id,
            type: 'dm',
            members: membersSorted,
            created_by: decoded.id,
          });
        }

        // メッセージ作成
        const msgId = uuidv4();
        const msg = await Message.create({
          id: msgId,
          room_id: room.id,
          sender_id: decoded.id,
          sender_name: sender.display_name || sender.username,
          sender_avatar: sender.avatar || null,
          content: content || '',
          image: req.file ? getFileUrl(req) : null,
          type: 'text',
        });

        // リアルタイム送信
        io.to(room.id).emit('message:new', msg);
        io.to('user_' + f.friend_id).emit('message:new', msg);
        sentCount++;
      } catch (_) {}
    }

    res.json({ sent: sentCount });
  } catch (e) {
    const s = (e?.name?.includes('JsonWebToken') || e?.name?.includes('TokenExpired')) ? 401 : 500;
    res.status(s).json({ error: s === 401 ? '認証エラー' : e.message });
  }
});

// ===== 公式アカウント API =====
// 公式アカウント付与（管理者が即時付与）
app.post('/api/users/:userId/official', async (req, res) => {
  try {
    const decoded = auth(req);
    const admin = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
    if (admin.username.trim().toLowerCase() !== ADMIN_USERNAME.trim().toLowerCase()) return res.status(403).json({ error: '管理者のみ操作できます' });
    const { official, category } = req.body;
    await User.findOneAndUpdate({ id: req.params.userId }, { is_official: !!official, official_verified: !!official, official_category: category || '' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式アカウント申請（一般ユーザー）
app.post('/api/official/apply', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { username: 1, is_official: 1 }).lean();
    if (user.is_official) return res.status(400).json({ error: 'すでに公式アカウントです' });
    const existing = await OfficialRequest.findOne({ user_id: decoded.id, status: 'pending' });
    if (existing) return res.status(400).json({ error: '申請中です。承認をお待ちください' });
    const { reason, category } = req.body;
    if (!reason) return res.status(400).json({ error: '申請理由を入力してください' });
    const req_ = await OfficialRequest.create({
      id: uuidv4(), user_id: decoded.id, username: user.username,
      reason, category: category || 'その他',
    });
    res.json(req_);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式申請一覧（管理者のみ）
app.get('/api/official/requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const admin = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
    if (admin.username.trim().toLowerCase() !== ADMIN_USERNAME.trim().toLowerCase()) return res.status(403).json({ error: '管理者のみ閲覧できます' });
    const requests = await OfficialRequest.find({ status: 'pending' }).sort({ created_at: -1 }).lean();
    res.json(requests);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 公式申請 承認/拒否（管理者のみ）
app.patch('/api/official/requests/:id', async (req, res) => {
  try {
    const decoded = auth(req);
    const admin = await User.findOne({ id: decoded.id }, { username: 1 }).lean();
    if (admin.username.trim().toLowerCase() !== ADMIN_USERNAME.trim().toLowerCase()) return res.status(403).json({ error: '管理者のみ操作できます' });
    const { action } = req.body; // 'approve' | 'reject'
    const request = await OfficialRequest.findOne({ id: req.params.id });
    if (!request) return res.status(404).json({ error: '申請が見つかりません' });
    await OfficialRequest.findOneAndUpdate({ id: req.params.id }, { status: action === 'approve' ? 'approved' : 'rejected' });
    if (action === 'approve') {
      await User.findOneAndUpdate({ id: request.user_id }, { is_official: true, official_verified: true, official_category: request.category });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// 部屋
app.get('/api/rooms', async (req, res) => {
  try {
    const decoded = auth(req);
    const rooms = await Room.find({ members: decoded.id }).lean();
    if (rooms.length === 0) return res.json([]);

    const roomIds = rooms.map(r => r.id);

    // 全メンバーIDを収集して一括取得（N+1解消）
    const allMemberIds = [...new Set(rooms.flatMap(r => r.members))];
    const [allUsers, allOfficialAccounts, lastMsgs] = await Promise.all([
      User.find({ id: { $in: allMemberIds } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean(),
      OfficialAccount.find({ id: { $in: allMemberIds } }, { id: 1, name: 1, avatar: 1, description: 1 }).lean(),
      // 各ルームの最新メッセージを集約で一括取得
      Message.aggregate([
        { $match: { room_id: { $in: roomIds }, deleted: false } },
        { $sort: { created_at: -1 } },
        { $group: { _id: '$room_id', content: { $first: '$content' }, type: { $first: '$type' }, sender_name: { $first: '$sender_name' }, created_at: { $first: '$created_at' } } }
      ])
    ]);

    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    const officialMap = Object.fromEntries(allOfficialAccounts.map(a => [a.id, a]));
    const lastMsgMap = Object.fromEntries(lastMsgs.map(m => [m._id, m]));

    const roomsWithLast = rooms.map(r => {
      const memberDetails = r.members.map(mid => {
        const u = userMap[mid];
        if (u) return { id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar };
        const oa = officialMap[mid];
        if (oa) return { id: oa.id, username: oa.name, displayName: oa.name, avatar: oa.avatar, isOfficial: true };
        return { id: mid, username: mid, displayName: mid, avatar: null };
      });
      const lastMsg = lastMsgMap[r.id];
      return {
        id: r.id, name: r.name, icon: r.icon, members: r.members,
        memberDetails,
        pinned_message_id: r.pinned_message_id,
        announcement: r.announcement || null,
        creator_id: r.creator_id || null,
        theme_color: r.theme_color || '',
        invite_code: r.invite_code || null,
        lastMessage: lastMsg ? { content: lastMsg.content, type: lastMsg.type, senderName: lastMsg.sender_name, createdAt: lastMsg.created_at } : null,
        lastActivity: lastMsg ? lastMsg.created_at : r.created_at,
      };
    });
    roomsWithLast.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    res.json(roomsWithLast);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== DM: 友達とのトークルームを取得または作成 =====
app.post('/api/rooms/dm', async (req, res) => {
  try {
    const decoded = auth(req);
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserIdが必要です' });

    // 2人だけのルームが既に存在するか探す
    const existing = await Room.findOne({
      members: { $all: [decoded.id, targetUserId], $size: 2 }
    }).lean();
    if (existing) {
      const memberUsers = await User.find({ id: { $in: existing.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean();
      const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
      return res.json({ ...existing, id: existing.id, memberDetails });
    }

    // なければ作成
    const targetUser = await User.findOne({ id: targetUserId });
    if (!targetUser) return res.status(404).json({ error: 'ユーザーが見つかりません' });

    const id = 'room_' + uuidv4();
    const room = await Room.create({
      id,
      name: targetUser.display_name || targetUser.username,
      members: [decoded.id, targetUserId],
      creator_id: decoded.id,
    });
    const memberUsers = await User.find({ id: { $in: room.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean();
    const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
    const roomObj = { id: room.id, name: room.name, icon: room.icon, members: room.members, memberDetails, pinned_message_id: null, lastMessage: null };
    [decoded.id, targetUserId].forEach(mid => io.to('user_' + mid).emit('room:new', roomObj));
    res.json(roomObj);
  } catch (e) { res.status(500).json({ error: 'DM作成に失敗しました: ' + e.message }); }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const decoded = auth(req);
    const { name, memberIds } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'ルーム名を入力してください' });
    if (name.trim().length > 50) return res.status(400).json({ error: 'ルーム名は50文字以内にしてください' });
    const safeIds = Array.isArray(memberIds) ? memberIds.filter(id => typeof id === 'string') : [];
    // 自分を含めたメンバーリスト（フレンドチェックなし・誰でも招待可能）
    const members = [...new Set([decoded.id, ...safeIds])];
    const id = 'room_' + uuidv4();
    const room = await Room.create({ id, name: name.trim(), members, creator_id: decoded.id });
    const memberUsers = await User.find({ id: { $in: members } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean();
    const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
    const roomObj = { id: room.id, name: room.name, icon: room.icon, members: room.members, memberDetails, pinned_message_id: null, lastMessage: null };
    members.forEach(mid => io.to('user_' + mid).emit('room:new', roomObj));
    res.json(roomObj);
  } catch(e) { res.status(500).json({ error: 'ルーム作成に失敗しました: ' + e.message }); }
});

app.patch('/api/rooms/:roomId/name', async (req, res) => {
  try {
    const decoded = auth(req);
    const name = (req.body.name || '').trim().slice(0, 50);
    if (!name) return res.status(400).json({ error: 'ルーム名を入力してください' });
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { name }, { returnDocument: 'after' }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:updated', { roomId: room.id, name: room.name, icon: room.icon });
    res.json(room);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/rooms/:roomId/icon', upload.single('icon'), async (req, res) => {
  try {
    const decoded = auth(req);
    const icon = getFileUrl(req);
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { icon }, { returnDocument: 'after' }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:updated', { roomId: req.params.roomId, icon });
    res.json({ icon });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/rooms/:roomId/members', async (req, res) => {
  try {
    const decoded = auth(req);
    const { memberIds } = req.body;
    if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: 'メンバーIDが必要です' });
    if (memberIds.length > 50) return res.status(400).json({ error: '一度に追加できるメンバーは50人までです' });
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { $addToSet: { members: { $each: memberIds } } }, { returnDocument: 'after' }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    // memberDetailsを含めてroom:newを送信
    const memberUsers = await User.find({ id: { $in: room.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean();
    const officialMembers = await OfficialAccount.find({ id: { $in: room.members } }, { id: 1, name: 1, avatar: 1 }).lean();
    const officialMemberMap = Object.fromEntries(officialMembers.map(a => [a.id, a]));
    const memberDetails = room.members.map(mid => {
      const u = memberUsers.find(u => u.id === mid);
      if (u) return { id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar };
      const oa = officialMemberMap[mid];
      if (oa) return { id: oa.id, username: oa.name, displayName: oa.name, avatar: oa.avatar, isOfficial: true };
      return { id: mid, username: mid, displayName: mid, avatar: null };
    });
    const roomObj = { id: room.id, name: room.name, icon: room.icon, members: room.members, memberDetails, pinned_message_id: room.pinned_message_id, lastMessage: null };
    memberIds.forEach(mid => io.to('user_' + mid).emit('room:new', roomObj));
    io.to(req.params.roomId).emit('room:members_updated', { roomId: req.params.roomId, members: room.members });
    res.json({ members: room.members });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// メンバー削除API
app.delete('/api/rooms/:roomId/members/:userId', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId }, { id: 1, members: 1, creator_id: 1 }).lean();
    if (!room) return res.status(404).json({ error: 'ルームが見つかりません' });
    // 自分自身を退出 or 作成者が他のメンバーを削除
    if (decoded.id !== req.params.userId && room.creator_id !== decoded.id)
      return res.status(403).json({ error: '権限なし' });
    const updated = await Room.findOneAndUpdate(
      { id: req.params.roomId },
      { $pull: { members: req.params.userId } }, { returnDocument: 'after' }
    );
    io.to(req.params.roomId).emit('room:members_updated', { roomId: req.params.roomId, members: updated.members, removedId: req.params.userId });
    res.json({ members: updated.members });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// メッセージ転送API
app.post('/api/rooms/:roomId/forward', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content, type, fileData } = req.body;
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const id = uuidv4();
    const msg = await Message.create({
      id, room_id: req.params.roomId, sender_id: decoded.id, sender_name: decoded.username,
      content, type: type || 'text', file_data: fileData || null,
      read_by: [decoded.id], reactions: [], forwarded: true
    });
    const user = await User.findOne({ id: decoded.id }, { avatar: 1 }).lean();
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
      { pinned_message_id: messageId || null }, { returnDocument: 'after' }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to(req.params.roomId).emit('room:pinned', { roomId: req.params.roomId, messageId: messageId || null });
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// メッセージ
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // ページネーション用
    const query = { room_id: req.params.roomId };
    if (before) query.created_at = { $lt: new Date(before) };
    const msgs = await Message.find(query).sort({ created_at: -1 }).limit(limit).lean().then(r => r.reverse());
    // senderId/senderNameに統一して返す（clietとの整合性）
    res.json(msgs.map(m => ({
      id: m.id, room_id: m.room_id,
      senderId: m.sender_id, senderName: m.sender_name,
      senderAvatar: m.sender_avatar || null,
      sender_id: m.sender_id, sender_name: m.sender_name, // 後方互換
      content: m.content, type: m.type || 'text',
      file_data: m.file_data, fileData: m.file_data,
      stamp_label: m.stamp_label, stampLabel: m.stamp_label,
      reply_to: m.reply_to, replyTo: m.reply_to,
      edited: m.edited, deleted: m.deleted,
      forwarded: m.forwarded || false,
      expires_at: m.expires_at || null,
      read_by: m.read_by, reactions: m.reactions,
      created_at: m.created_at, createdAt: m.created_at,
    })));
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/rooms/:roomId/search', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const q = req.query.q || '';
    const sender = req.query.sender || '';
    const date = req.query.date || '';
    const query = { room_id: req.params.roomId, deleted: false };
    // テキスト検索
    if (q) query.content = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // 送信者フィルター
    if (sender) query.sender_name = new RegExp(sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // 日付フィルター
    if (date) {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);
      query.created_at = { $gte: start, $lte: end };
    }
    const msgs = await Message.find(query).sort({ created_at: -1 }).limit(100).lean();
    res.json(msgs.reverse().map(m => ({
      id: m.id, content: m.content, type: m.type,
      senderId: m.sender_id, senderName: m.sender_name,
      createdAt: m.created_at, roomId: m.room_id,
      highlight: q,
    })));
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ノートAPI
// 共有ノート取得
app.get('/api/rooms/:roomId/note/shared', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOne({ room_id: req.params.roomId, user_id: null }).lean();
    res.json({ content: note?.content || '', updatedBy: note?.updated_by || null, updatedAt: note?.updated_at || null });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 共有ノート保存
app.put('/api/rooms/:roomId/note/shared', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOneAndUpdate(
      { room_id: req.params.roomId, user_id: null },
      { content: req.body.content, updated_by: decoded.username, updated_at: new Date(), $setOnInsert: { id: uuidv4() } },
      { upsert: true,returnDocument:'after'}
    );
    // リアルタイムで他メンバーに通知
    io.to(req.params.roomId).emit('note:updated', { roomId: req.params.roomId, type: 'shared', content: note.content, updatedBy: decoded.username });
    res.json({ content: note.content, updatedBy: decoded.username, updatedAt: note.updated_at });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 個人ノート取得
app.get('/api/rooms/:roomId/note/mine', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const note = await Note.findOne({ room_id: req.params.roomId, user_id: decoded.id }).lean();
    res.json({ content: note?.content || '' });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 個人ノート保存
app.put('/api/rooms/:roomId/note/mine', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    await Note.findOneAndUpdate(
      { room_id: req.params.roomId, user_id: decoded.id },
      { content: req.body.content, updated_at: new Date(), $setOnInsert: { id: uuidv4() } },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ ok: true });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// 全ルームの画像一括取得（アルバム用）
app.get('/api/album', async (req, res) => {
  try {
    const decoded = auth(req);
    const rooms = await Room.find({ members: decoded.id }).lean();
    const roomIds = rooms.map(r => r.id);
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.name || 'ルーム']));
    const imgs = await Message.find({ room_id: { $in: roomIds }, type: { $in: ['image', 'file'] }, deleted: false })
      .sort({ created_at: -1 }).limit(500).lean();
    res.json(imgs.map(img => ({ ...img, roomName: roomMap[img.room_id] || 'ルーム' })));
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.get('/api/rooms/:roomId/album', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const imgs = await Message.find({ room_id: req.params.roomId, type: { $in: ['image', 'file'] }, deleted: false }).sort({ created_at: -1 }).limit(200).lean();
    res.json(imgs);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
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
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
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
  socket.join('user_' + socket.user.id);
  // オンライン状態をブロードキャスト
  if (!io.onlineUsers) io.onlineUsers = new Map();
  io.onlineUsers.set(socket.user.id, { name: socket.user.username, since: Date.now() });
  io.emit('user:online', { userId: socket.user.id });
  const myRooms = await Room.find({ members: socket.user.id }, { id: 1 }).lean();
  myRooms.forEach(r => socket.join(r.id));

  socket.on('room:join', async (roomId) => {
    try {
      const room = await Room.findOne({ id: roomId, members: socket.user.id }).lean();
      if (room) socket.join(roomId);
    } catch (e) { console.error('room:join error:', e); }
  });

  // メッセージ送信レートリミット（10秒間に20件まで）
  const msgRateMap = new Map();
  socket.on('message:send', async ({ roomId, content, type = 'text', fileData, replyTo, stampLabel }) => {
    try {
    const now = Date.now();
    const key = socket.user.id;
    if (!msgRateMap.has(key)) msgRateMap.set(key, []);
    const times = msgRateMap.get(key).filter(t => now - t < 10000);
    if (times.length >= 20) return; // レートリミット
    times.push(now);
    msgRateMap.set(key, times);
    if (!roomId) return;
    // バリデーション: テキストは4000文字まで、空メッセージはファイル系のみ許可
    if (type === 'text' && (!content || !content.trim())) return;
    if (content && content.length > 4000) return;
    const room = await Room.findOne({ id: roomId, members: socket.user.id }, { id: 1, members: 1, name: 1 }).lean();
    if (!room) return;
    const id = uuidv4();
    const msg = await Message.create({
      id, room_id: roomId, sender_id: socket.user.id, sender_name: socket.user.username,
      sender_avatar: socket.user.avatar || null,
      content: typeof content === 'string' ? content.trim() : content,
      type, file_data: fileData || null, reply_to: replyTo || null, stamp_label: stampLabel || null,
      read_by: [socket.user.id], reactions: [],
      expires_at: type === 'secret' && fileData?.timer ? new Date(Date.now() + fileData.timer * 1000) : null,
    });
    io.to(roomId).emit('message:receive', {
      id, roomId, senderId: socket.user.id, senderName: socket.user.username,
      senderAvatar: socket.user.avatar || null,
      content, type, fileData: fileData || null, replyTo: replyTo || null, stampLabel: stampLabel || null,
      edited: false, deleted: false, readBy: [socket.user.id], reactions: [], read_by: [socket.user.id],
      createdAt: msg.created_at,
      expiresAt: msg.expires_at || null, expires_at: msg.expires_at || null,
    });
    // バッジチェック（非同期・ノンブロッキング）
    User.findOneAndUpdate({ id: socket.user.id }, { $inc: { message_count: 1 } }).then(() => {
      checkAndAwardBadges(socket.user.id).then(newBadges => {
        if (newBadges.length > 0) socket.emit('badges:awarded', { badges: newBadges });
      });
    });

    // Push通知: ルームにいない他のメンバーに通知
    const notifyBody = (() => {
      const name = socket.user.username;
      if (type === 'stamp') return `${name}: スタンプ`;
      if (type === 'voice') return `${name}: 音声メッセージ 🎤`;
      if (type === 'location') return `${name}: 位置情報を共有 📍`;
      if (type === 'secret') return `${name}: 秘密メッセージ 🔐`;
      if (type === 'image') return `${name}: 画像 📷`;
      if (type === 'file') return `${name}: ファイル 📎`;
      return `${name}: ${content}`;
    })();
    for (const memberId of room.members) {
      if (memberId === socket.user.id) continue;
      const sub = pushSubscriptions.get(memberId);
      if (!sub) continue;
      webpush.sendNotification(sub, JSON.stringify({
        title: room.name || socket.user.username,
        body: notifyBody.length > 50 ? notifyBody.slice(0, 50) + '...' : notifyBody,
        tag: roomId,
        url: '/',
      })).catch(() => { pushSubscriptions.delete(memberId); PushSubscription.deleteOne({ user_id: memberId }).catch(() => {}); });
    }
    // @メンション検出・通知
    if (type === 'text' && content && typeof content === 'string') {
      const mentionMatches = content.match(/@(\S+)/g);
      if (mentionMatches) {
        const mentionedNames = mentionMatches.map(m => m.slice(1).toLowerCase());
        const mentionedUsers = await User.find({
          username: { $in: mentionedNames },
          id: { $in: room.members, $ne: socket.user.id }
        }).lean();
        mentionedUsers.forEach(u => {
          io.to('user_' + u.id).emit('mention:new', {
            from: socket.user.username, roomId, roomName: room.name,
            content: content.slice(0, 50), messageId: id
          });
        });
      }
    }
    } catch(e) { console.error('message:send error:', e); }
  });

  socket.on('message:edit', async ({ roomId, messageId, content }) => {
    try {
      if (!content || !content.trim() || content.length > 4000) return;
      const orig = await Message.findOne({ id: messageId, sender_id: socket.user.id });
      if (!orig) return;
      const historyEntry = { content: orig.content, edited_at: new Date() };
      const msg = await Message.findOneAndUpdate(
        { id: messageId, sender_id: socket.user.id },
        {
          content: content.trim(),
          edited: true,
          $push: { edit_history: { $each: [historyEntry], $slice: -10 } }
        },
        { returnDocument: 'after' }
      );
      if (!msg) return;
      io.to(roomId).emit('message:edited', {
        messageId,
        content: content.trim(),
        roomId,
        edit_history: msg.edit_history
      });
    } catch(e) {}
  });

  socket.on('message:edit_history', async ({ messageId }) => {
    try {
      const msg = await Message.findOne({ id: messageId });
      if (!msg) return;
      socket.emit('message:edit_history_result', {
        messageId,
        edit_history: msg.edit_history || []
      });
    } catch(e) {}
  });


  socket.on('thread:send', async ({ parentId, roomId, content }) => {
    try {
      if (!content || !content.trim() || content.length > 4000) return;
      const room = await Room.findOne({ id: roomId, members: socket.user.id }, { id: 1 }).lean();
      if (!room) return;
      const { v4: uuid4 } = require('uuid');
      const id = uuid4();
      const msg = await ThreadMessage.create({
        id, parent_id: parentId, room_id: roomId,
        sender_id: socket.user.id, sender_name: socket.user.username,
        sender_avatar: socket.user.avatar || null,
        content: content.trim()
      });
      io.to(roomId).emit('thread:new', {
        parentId,
        msg: {
          id: msg.id, parentId, roomId,
          senderId: socket.user.id, senderName: socket.user.username,
          senderAvatar: socket.user.avatar || null,
          content: content.trim(), createdAt: msg.created_at
        }
      });
    } catch(e) {}
  });

  socket.on('message:delete', async ({ roomId, messageId }) => {
    try {
      const msg = await Message.findOneAndUpdate(
        { id: messageId, sender_id: socket.user.id },
        { deleted: true, content: 'このメッセージは削除されました' },
        { returnDocument: 'after' }
      );
      if (!msg) return;
      io.to(roomId).emit('message:deleted', { messageId, roomId });
    } catch(e) {}
  });

  socket.on('message:read', async ({ messageId, roomId }) => {
    try {
      const msg = await Message.findOneAndUpdate(
        { id: messageId },
        { $addToSet: { read_by: socket.user.id } },
        { returnDocument: 'after' }
      );
      if (!msg) return;
      const readers = await User.find({ id: { $in: msg.read_by } }, { id: 1, username: 1, display_name: 1, avatar: 1 }).lean();
      const readByDetail = readers.map(u => ({ id: u.id, name: u.display_name || u.username, avatar: u.avatar }));
      io.to(roomId).emit('message:read_update', { messageId, readBy: msg.read_by, readByDetail, roomId });
    } catch(e) { console.error('message:read error:', e); }
  });

  socket.on('message:react', async ({ roomId, messageId, emoji }) => {
    try {
      if (!emoji || typeof emoji !== 'string' || emoji.length > 10) return;
      const msg = await Message.findOne({ id: messageId });
      if (!msg) return;
      const existing = msg.reactions.find(r => r.user_id === socket.user.id);
      let updated;
      if (existing) {
        if (existing.emoji === emoji) {
          updated = await Message.findOneAndUpdate({ id: messageId }, { $pull: { reactions: { user_id: socket.user.id } } }, { returnDocument: 'after' });
        } else {
          updated = await Message.findOneAndUpdate({ id: messageId, 'reactions.user_id': socket.user.id }, { $set: { 'reactions.$.emoji': emoji } }, { returnDocument: 'after' });
        }
      } else {
        updated = await Message.findOneAndUpdate({ id: messageId }, { $push: { reactions: { emoji, user_id: socket.user.id } } }, { returnDocument: 'after' });
      }
      if (!updated) return;
      io.to(roomId).emit('message:reacted', { messageId, reactions: updated.reactions, roomId });
    } catch(e) { console.error('message:react error:', e); }
  });

  socket.on('room:leave', async ({ roomId }) => {
    try {
      await Room.findOneAndUpdate({ id: roomId }, { $pull: { members: socket.user.id } }, {returnDocument:'after'});
      socket.leave(roomId);
      const room = await Room.findOne({ id: roomId });
      if (room) {
        io.to(roomId).emit('room:members_updated', { roomId, members: room.members });
      }
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
    } catch(e) { console.error('room:leave error:', e); }
  });

  socket.on('typing:start', ({ roomId }) => {
    socket.to(roomId).emit('typing:update', { username: socket.user.username, isTyping: true });
  });
  socket.on('typing:stop', ({ roomId }) => {
    socket.to(roomId).emit('typing:update', { username: socket.user.username, isTyping: false });
  });

  socket.on('call:start', async ({ roomId, offer, to }) => {
    try {
    if (!offer) return;
    if (to) {
      io.to('user_' + to).emit('call:incoming', { from: socket.user.id, fromName: socket.user.username, offer, roomId });
    } else if (roomId) {
      socket.to(roomId).emit('call:incoming', { from: socket.user.id, fromName: socket.user.username, offer, roomId });
    }
    if (roomId) {
      try {
        
        const msg = await Message.create({
          id: uuidv4(), room_id: roomId,
          sender_id: socket.user.id, sender_name: socket.user.username,
          content: '📞 通話を開始しました', type: 'call_start',
        });
        io.to(roomId).emit('message:receive', { id: msg.id, roomId: msg.room_id, senderId: msg.sender_id, senderName: msg.sender_name, content: msg.content, type: msg.type, createdAt: msg.created_at, read_by: msg.read_by || [], reactions: [] });
      } catch (_) {}
    }
    } catch (e) { console.error('call:start error:', e); }
  });

  socket.on('call:answer', ({ answer, to }) => {
    if (!answer || !to) return;
    io.to('user_' + to).emit('call:answered', { answer, from: socket.user.id });
  });

  socket.on('call:ice', ({ candidate, to }) => {
    if (!candidate || !to) return;
    io.to('user_' + to).emit('call:ice', { candidate, from: socket.user.id });
  });

  socket.on('call:chat', ({ to, text, from }) => {
    if (!to || !text) return;
    io.to('user_' + to).emit('call:chat', { from: from || socket.user.id, text });
  });

  socket.on('call:end', async ({ roomId, to, duration }) => {
    if (to) {
      io.to('user_' + to).emit('call:ended', { from: socket.user.id });
    } else {
      socket.to(roomId).emit('call:ended', { from: socket.user.id });
    }
    // 通話終了メッセージをチャットに保存
    if (roomId) {
      try {
        
        const dur = duration > 0 ? formatDuration(duration) : null;
        const content = dur ? `📵 通話終了（${dur}）` : '📵 通話終了（応答なし）';
        const msg = await Message.create({
          id: uuidv4(), room_id: roomId,
          sender_id: socket.user.id, sender_name: socket.user.username,
          content, type: 'call_end',
        });
        io.to(roomId).emit('message:receive', { id: msg.id, roomId: msg.room_id, senderId: msg.sender_id, senderName: msg.sender_name, content: msg.content, type: msg.type, createdAt: msg.created_at, read_by: msg.read_by || [], reactions: [] });
      } catch (_) {}
    }
  });

  // ===== 音声通話シグナリング =====
  socket.on('voice:start', ({ to, from, offer, callId, roomId }) => {
    io.to('user_' + to).emit('voice:incoming', {
      from: { id: socket.user.id, username: socket.user.username, avatar: socket.user.avatar },
      offer, callId, roomId
    });
  });

  socket.on('voice:answer', ({ to, answer, callId }) => {
    io.to('user_' + to).emit('voice:answer', { answer, from: socket.user.id, callId });
  });

  socket.on('voice:reject', ({ to, callId }) => {
    io.to('user_' + to).emit('voice:reject', { from: socket.user.id, callId });
  });

  socket.on('voice:end', async ({ to, callId, duration, roomId }) => {
    io.to('user_' + to).emit('voice:end', { from: socket.user.id, callId });
    // 音声通話終了メッセージ
    if (roomId) {
      try {
        
        const dur = duration > 0 ? formatDuration(duration) : null;
        const content = dur ? `📵 音声通話終了（${dur}）` : '📵 音声通話（応答なし）';
        await Message.create({
          id: uuidv4(), room_id: roomId,
          sender_id: socket.user.id, sender_name: socket.user.username,
          content, type: 'call_end',
        });
      } catch (_) {}
    }
  });

  socket.on('voice:ice', ({ to, candidate, callId }) => {
    io.to('user_' + to).emit('voice:ice', { candidate, from: socket.user.id, callId });
  });

// 通話時間フォーマット
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

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

  // 自分だけ退出（他の人は続けられる）
  socket.on('gcall:end', ({ roomId }) => {
    if (io.gcallRooms?.[roomId]) {
      io.gcallRooms[roomId].delete(socket.user.id);
      if (io.gcallRooms[roomId].size === 0) delete io.gcallRooms[roomId];
    }
    socket.to('gcall_' + roomId).emit('gcall:peer_left', { userId: socket.user.id });
    socket.leave('gcall_' + roomId);
  });

  // 全員強制終話（主催者用）
  socket.on('gcall:end_all', ({ roomId }) => {
    if (io.gcallRooms?.[roomId]) delete io.gcallRooms[roomId];
    socket.to('gcall_' + roomId).emit('gcall:ended');
    io.socketsLeave('gcall_' + roomId);
  });

  socket.on('call:reject', async ({ to, roomId }) => {
    io.to('user_' + to).emit('call:rejected', { from: socket.user.id });
    if (roomId) {
      try {
        
        const msg = await Message.create({
          id: uuidv4(), room_id: roomId,
          sender_id: socket.user.id, sender_name: socket.user.username,
          content: '📵 通話を拒否しました', type: 'call_end',
        });
        io.to(roomId).emit('message:receive', { id: msg.id, roomId: msg.room_id, senderId: msg.sender_id, senderName: msg.sender_name, content: msg.content, type: msg.type, createdAt: msg.created_at, read_by: msg.read_by || [], reactions: [] });
      } catch (_) {}
    }
  });

  socket.on('disconnect', () => {
    if (io.onlineUsers) {
      io.onlineUsers.delete(socket.user.id);
      User.findOneAndUpdate({ id: socket.user.id }, { last_seen: new Date() }, { returnDocument: 'after' }).catch(() => {});
      io.emit('user:offline', { userId: socket.user.id, lastSeen: Date.now() });
    }
    // 入力中インジケーターをクリア（参加してた全ルームに通知）
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit('typing:update', { username: socket.user.username, isTyping: false });
      }
    });
    // グループ通話から自動退出
    if (io.gcallRooms) {
      for (const [roomId, members] of Object.entries(io.gcallRooms)) {
        if (members.has(socket.user.id)) {
          members.delete(socket.user.id);
          socket.to('gcall_' + roomId).emit('gcall:peer_left', { userId: socket.user.id });
          if (members.size === 0) delete io.gcallRooms[roomId];
        }
      }
    }
  });
});

// ===== 全トーク横断検索 =====
app.get('/api/search', async (req, res) => {
  try {
    const decoded = auth(req);
    const q = req.query.q || '';
    if (!q.trim()) return res.json([]);
    // 自分が参加しているルームを取得
    const rooms = await Room.find({ members: decoded.id }).lean();
    const roomIds = rooms.map(r => r.id);
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r]));
    // 全ルームのメッセージを検索
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const msgs = await Message.find({
      room_id: { $in: roomIds }, deleted: false,
      $or: [{ content: new RegExp(safeQ, 'i') }, { sender_name: new RegExp(safeQ, 'i') }]
    }).sort({ created_at: -1 }).limit(50).lean();
    res.json(msgs.map(m => ({
      id: m.id, content: m.content, type: m.type,
      senderId: m.sender_id, senderName: m.sender_name,
      roomId: m.room_id, roomName: roomMap[m.room_id]?.name || '',
      createdAt: m.created_at
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ダッシュボード =====
app.get('/api/dashboard', async (req, res) => {
  try {
    const decoded = auth(req);
    const rooms = await Room.find({ members: decoded.id }).lean();
    const roomIds = rooms.map(r => r.id);
    // 未読メッセージ数（ルームごと）
    // 未読数をaggregateで一括取得（N+1解消）
    const unreadAgg = await Message.aggregate([
      { $match: { room_id: { $in: roomIds }, deleted: false, read_by: { $ne: decoded.id }, sender_id: { $ne: decoded.id } } },
      { $group: { _id: '$room_id', count: { $sum: 1 } } }
    ]);
    const unreadMap = Object.fromEntries(unreadAgg.map(r => [r._id, r.count]));
    const roomNameMap = Object.fromEntries(rooms.map(r => [r.id, r.name]));
    const unreadByRoom = Object.entries(unreadMap).map(([roomId, count]) => ({ roomId, roomName: roomNameMap[roomId] || '', count }));
    // 未完了タスク
    const tasks = await Task.find({ room_id: { $in: roomIds }, done: false }).sort({ due: 1 }).limit(5).lean();
    // 今後のイベント
    const events = await Event.find({ room_id: { $in: roomIds }, start_at: { $gte: new Date() } }).sort({ start_at: 1 }).limit(5).lean();
    // スケジュール送信
    const scheduled = await ScheduledMessage.find({ sender_id: decoded.id, sent: false }).sort({ send_at: 1 }).limit(3).lean();
    res.json({
      unread: unreadByRoom.filter(r => r.count > 0),
      tasks: tasks.map(t => ({ id: t.id, title: t.title, roomId: t.room_id, due: t.due, assigneeName: t.assignee_name })),
      events: events.map(e => ({ id: e.id, title: e.title, roomId: e.room_id, startAt: e.start_at })),
      scheduled: scheduled.map(s => ({ id: s.id, content: s.content, roomId: s.room_id, sendAt: s.send_at })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== お気に入り =====
app.post('/api/favorites', async (req, res) => {
  try {
    const decoded = auth(req);
    const { messageId, roomId, content, senderName } = req.body;
    
    const existing = await Favorite.findOne({ user_id: decoded.id, message_id: messageId }).lean();
    if (existing) { await Favorite.deleteOne({ _id: existing._id }); return res.json({ removed: true }); }
    const fav = await Favorite.create({ id: 'fav_' + uuidv4(), user_id: decoded.id, message_id: messageId, room_id: roomId, content, sender_name: senderName });
    res.json(fav);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/favorites', async (req, res) => {
  try {
    const decoded = auth(req);
    const favs = await Favorite.find({ user_id: decoded.id }).sort({ created_at: -1 }).lean();
    res.json(favs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== イベント・カレンダー =====
app.post('/api/rooms/:roomId/events', async (req, res) => {
  try {
    const decoded = auth(req);
    
    const { title, description, startAt, endAt } = req.body;
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const event = await Event.create({
      id: 'evt_' + uuidv4(), room_id: req.params.roomId, creator_id: decoded.id,
      title, description, start_at: new Date(startAt), end_at: endAt ? new Date(endAt) : null,
      attendees: room.members.map(uid => ({ user_id: uid, status: uid === decoded.id ? 'going' : 'pending' }))
    });
    io.to(req.params.roomId).emit('event:new', event);
    res.json(event);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/rooms/:roomId/events', async (req, res) => {
  try {
    auth(req);
    const events = await Event.find({ room_id: req.params.roomId }).sort({ start_at: 1 }).lean();
    res.json(events);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/events/:eventId/attend', async (req, res) => {
  try {
    const decoded = auth(req);
    const { status } = req.body;
    if (!['going','maybe','notgoing'].includes(status)) return res.status(400).json({ error: '不正なステータス' });
    const event = await Event.findOneAndUpdate(
      { id: req.params.eventId, 'attendees.user_id': decoded.id },
      { $set: { 'attendees.$.status': status } }, { returnDocument: 'after' }
    );
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });
    io.to(event.room_id).emit('event:updated', event);
    res.json(event);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== チャット統計API =====
app.get('/api/rooms/:roomId/stats', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const msgs = await Message.find({ room_id: req.params.roomId, deleted: false }).sort({ created_at: -1 }).limit(2000).lean();
    // 送信数ランキング
    const countMap = {};
    const typeMap = {};
    const hourMap = Array(24).fill(0);
    msgs.forEach(m => {
      countMap[m.sender_name] = (countMap[m.sender_name] || 0) + 1;
      typeMap[m.type] = (typeMap[m.type] || 0) + 1;
      hourMap[new Date(m.created_at).getHours()]++;
    });
    const ranking = Object.entries(countMap).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
    const mostActive = hourMap.indexOf(Math.max(...hourMap));
    res.json({
      total: msgs.length,
      ranking,
      types: typeMap,
      hourMap,
      mostActiveHour: mostActive,
      firstMessage: msgs[msgs.length - 1]?.created_at, // 降順ソートなので末尾が最古メッセージ
    });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== ストーリーAPI =====
app.get('/api/stories', async (req, res) => {
  try {
    auth(req);
    const stories = await Story.find({ expires_at: { $gt: new Date() } }).sort({ created_at: -1 }).lean();
    res.json(stories);
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

app.post('/api/stories', async (req, res) => {
  try {
    const decoded = auth(req);
    if (!req.body.url) return res.status(400).json({ error: 'URLが必要です' });
    const user = await User.findOne({ id: decoded.id });
    const story = await Story.create({
      id: 'st_' + uuidv4(),
      user_id: decoded.id,
      user_name: user?.display_name || user?.username,
      user_avatar: user?.avatar,
      type: req.body.type || 'image',
      url: req.body.url,
      text: (req.body.text || '').slice(0, 200),
    });
    res.json(story);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/stories/:id', async (req, res) => {
  try {
    const decoded = auth(req);
    await Story.deleteOne({ id: req.params.id, user_id: decoded.id });
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== ゲーム連携API =====
const GAME_ORIGINS = ['https://killer-games.onrender.com', 'http://localhost:3001'];

// ゲームアプリ用CORS（別オリジン許可）
app.use('/api/game', (req, res, next) => {
  const origin = req.headers.origin;
  if (GAME_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// コイン残高取得 / 初期化

// ===== ゲーム賭けAPI =====
app.post('/api/game/bet', async (req, res) => {
  try {
    const decoded = auth(req);
    const { coins } = req.body;
    if (!coins || coins <= 0) return res.json({ ok: true });
    const user = await User.findOneAndUpdate(
      { id: decoded.id, coins: { $gte: coins } },
      { $inc: { coins: -coins } },
      { returnDocument: 'after', projection: { coins: 1 } }
    );
    if (!user) return res.status(400).json({ error: 'コインが足りないで' });
    res.json({ ok: true, newBalance: user.coins });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ゲームショップ購入API =====
app.post('/api/game/buy-item', async (req, res) => {
  try {
    const decoded = auth(req);
    const { itemId, price } = req.body;
    if (!itemId || !price || price <= 0) return res.status(400).json({ error: '無効なリクエスト' });
    const user = await User.findOneAndUpdate(
      { id: decoded.id, coins: { $gte: price } },
      { $inc: { coins: -price } },
      { returnDocument: 'after', projection: { coins: 1 } }
    );
    if (!user) return res.status(400).json({ error: 'コインが足りないで' });
    res.json({ ok: true, newBalance: user.coins });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/game/coins', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { coins: 1 }).lean();
    res.json({ coins: user?.coins ?? 0 });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// スコア送信 → コイン付与
app.post('/api/game/score', async (req, res) => {
  try {
    const decoded = auth(req);
    const { game, score } = req.body;
    if (!game || typeof score !== 'number' || score < 0 || score > 999999) {
      return res.status(400).json({ error: 'スコアが不正です' });
    }
    const VALID_GAMES = ['puzzle', 'memory', 'quiz', 'runner', 'match', 'reflex', 'number', 'type', 'color', 'math'];
    if (!VALID_GAMES.includes(game)) return res.status(400).json({ error: '不正なゲーム名' });
    const user = await User.findOne({ id: decoded.id });
    const { bet = 0, multiplier = 1 } = req.body;
    const baseEarned = Math.min(Math.floor(score / 100), 100); // スコアベースのコイン
    const betReturn = Math.floor(bet * multiplier); // 賭けコインの返還
    const coinsEarned = baseEarned + betReturn; // 合計
    const id = 'gs_' + uuidv4();
    await GameScore.create({
      id, user_id: decoded.id,
      username: user?.display_name || user?.username,
      avatar: user?.avatar,
      game, score, coins_earned: coinsEarned
    });
    // コインをUser.coinsに加算（統合済み）
    const updatedUser = await User.findOneAndUpdate(
      { id: decoded.id },
      { $inc: { coins: coinsEarned } },
      { returnDocument: 'after', projection: { coins: 1 } }
    );
    // バッジチェック
    checkAndAwardBadges(decoded.id);
    res.json({ ok: true, coinsEarned, totalCoins: updatedUser?.coins ?? 0 });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ランキング取得
app.get('/api/game/ranking/:game', async (req, res) => {
  try {
    const scores = await GameScore.find({ game: req.params.game })
      .sort({ score: -1 }).lean().limit(20);
    // ユーザーごとのベストスコアのみ
    const best = {};
    scores.forEach(s => {
      if (!best[s.user_id] || best[s.user_id].score < s.score) best[s.user_id] = s;
    });
    res.json(Object.values(best).sort((a, b) => b.score - a.score).slice(0, 10));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 友達ランキング
app.get('/api/game/ranking/:game/friends', async (req, res) => {
  try {
    const decoded = auth(req);
    const friends = await Friend.find({ user_id: decoded.id }).lean();
    const friendIds = [...friends.map(f => f.friend_id), decoded.id];
    const scores = await GameScore.find({ game: req.params.game, user_id: { $in: friendIds } }).sort({ score: -1 }).lean();
    const best = {};
    scores.forEach(s => { if (!best[s.user_id] || best[s.user_id].score < s.score) best[s.user_id] = s; });
    res.json(Object.values(best).sort((a, b) => b.score - a.score));
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ショップアイテム購入
app.post('/api/game/shop/buy', async (req, res) => {
  try {
    const decoded = auth(req);
    const { itemType, itemId, price } = req.body;
    if (!itemType || !itemId || typeof price !== 'number' || price < 0) return res.status(400).json({ error: 'パラメータが不正です' });
    // 既に持っているか確認
    const existing = await GameItem.findOne({ user_id: decoded.id, item_id: itemId }).lean();
    if (existing) return res.status(400).json({ error: '既に持ってるで' });
    // 原子的にコインを減算（コインが足りない場合はnullが返る）
    const updatedUser = await User.findOneAndUpdate(
      { id: decoded.id, coins: { $gte: price } },
      { $inc: { coins: -price } },
      { returnDocument: 'after', projection: { coins: 1 } }
    );
    if (!updatedUser) return res.status(400).json({ error: 'コイン不足' });
    const item = await GameItem.create({ id: 'gi_' + uuidv4(), user_id: decoded.id, item_type: itemType, item_id: itemId });
    if (itemType === 'avatar_frame') await User.findOneAndUpdate({ id: decoded.id }, { avatar_frame: itemId });
    res.json({ ok: true, item, remainingCoins: updatedUser.coins });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// 所持アイテム一覧
app.get('/api/game/items', async (req, res) => {
  try {
    const decoded = auth(req);
    const items = await GameItem.find({ user_id: decoded.id }).lean();
    const user = await User.findOne({ id: decoded.id }, { coins: 1 }).lean();
    res.json({ items, coins: user?.coins || 0 });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// プレイヤー情報（ゲームアプリのログイン用）
app.get('/api/game/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json({
      id: decoded.id,
      username: user?.display_name || user?.username,
      avatar: user?.avatar,
      coins: user?.coins ?? 0,
      avatarFrame: user?.avatar_frame,
    });
  } catch (e) { const status = (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError' || e?.name === 'NotBeforeError') ? 401 : 500; res.status(status).json({ error: status === 401 ? '認証エラー' : 'サーバーエラー' }); }
});

// ===== ヘルスチェック =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0.0' });
});

// ===== SEO用エンドポイント =====
app.get('/sitemap.xml', (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${process.env.CLIENT_URL || "https://line-killer-server.onrender.com"}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.header('Content-Type', 'text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: ${process.env.CLIENT_URL || "https://line-killer-server.onrender.com"}/sitemap.xml');
});

// ===== TWA用 assetlinks.json =====
app.get('/.well-known/assetlinks.json', (req, res) => {
  const packageName = process.env.TWA_PACKAGE_NAME || 'com.example.linekiller';
  const sha256 = process.env.TWA_SHA256 || '';
  if (!sha256) return res.json([]); // 未設定の場合は空配列
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: [sha256]
    }
  }]);
});

// オンラインユーザー一覧
app.get('/api/users/online', (req, res) => {
  const list = io.onlineUsers ? Array.from(io.onlineUsers.keys()) : [];
  res.json(list);
});

// ===== AI アシスタント =====



// ===== グループ統計 =====
app.get('/api/rooms/:roomId/stats', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }).lean();
    if (!room) return res.status(403).json({ error: 'アクセス権なし' });

    const msgs = await Message.find({ room_id: req.params.roomId, deleted: false }).lean();
    const total = msgs.length;

    // 送信者別カウント
    const byUser = {};
    msgs.forEach(m => {
      if (!m.sender_id) return;
      byUser[m.sender_id] = byUser[m.sender_id] || { name: m.sender_name, count: 0 };
      byUser[m.sender_id].count++;
    });
    const ranking = Object.entries(byUser)
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    // 時間帯別
    const byHour = Array(24).fill(0);
    msgs.forEach(m => { if (m.created_at) byHour[new Date(m.created_at).getHours()]++; });

    // 曜日別
    const byDay = Array(7).fill(0);
    msgs.forEach(m => { if (m.created_at) byDay[new Date(m.created_at).getDay()]++; });

    res.json({ total, ranking, byHour, byDay });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== カスタム通知音設定 =====
app.patch('/api/rooms/:roomId/notification', async (req, res) => {
  try {
    const decoded = auth(req);
    const { sound } = req.body; // 'default'|'bell'|'chime'|'pop'|'none'
    await User.findOneAndUpdate(
      { id: decoded.id },
      { $set: { [`notification_sounds.${req.params.roomId}`]: sound } }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rooms/:roomId/notification', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { notification_sounds: 1 }).lean();
    const sound = user?.notification_sounds?.[req.params.roomId] || 'default';
    res.json({ sound });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== プロフィールテーマ =====
app.patch('/api/users/me/theme', async (req, res) => {
  try {
    const decoded = auth(req);
    const { primaryColor, bgColor, fontFamily } = req.body;
    await User.findOneAndUpdate(
      { id: decoded.id },
      { $set: { 'theme.primaryColor': primaryColor, 'theme.bgColor': bgColor, 'theme.fontFamily': fontFamily } }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ===== 消えるメッセージ（タイマーメッセージ）=====
// メッセージ送信時にexpires_atが設定されてれば既存の仕組みで動作
// 削除ジョブを追加
setInterval(async () => {
  try {
    const now = new Date();
    const expired = await Message.find({ expires_at: { $lte: now }, deleted: false }).lean();
    for (const msg of expired) {
      await Message.findOneAndUpdate({ id: msg.id }, { deleted: true, content: 'このメッセージは削除されました' });
      // ルームに通知
      if (msg.room_id) io.to(msg.room_id).emit('message:deleted', { messageId: msg.id, roomId: msg.room_id });
    }
  } catch(e) {}
}, 10000); // 10秒ごとにチェック

// ===== スパム報告 =====
app.post('/api/report', async (req, res) => {
  try {
    const decoded = auth(req);
    const { targetId, targetType, reason } = req.body; // targetType: 'user'|'message'|'post'
    if (!targetId || !targetType) return res.status(400).json({ error: '報告対象が不明やで' });
    // 管理者に通知（ここではDBに記録するだけ）
    await News.create({
      id: 'report_' + uuidv4(),
      type: 'report',
      content: `🚨 報告: ${targetType} ID=${targetId} by ${decoded.id} | 理由: ${reason || '未記入'}`,
      created_at: new Date()
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ログイン履歴 =====
app.get('/api/users/me/login-history', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { login_history: 1 }).lean();
    res.json(user?.login_history || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== メッセージ検索 =====
app.get('/api/rooms/:roomId/search', async (req, res) => {
  try {
    const decoded = auth(req);
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }).lean();
    if (!room) return res.status(403).json({ error: 'アクセス権なし' });
    const msgs = await Message.find({
      room_id: req.params.roomId,
      content: { $regex: q, $options: 'i' },
      deleted: false
    }).sort({ created_at: -1 }).limit(30).lean();
    res.json(msgs.map(m => ({ id: m.id, content: m.content, senderName: m.sender_name, createdAt: m.created_at })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ルーレット =====
app.get('/api/rooms/:roomId/roulette', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }).lean();
    if (!room || !room.members?.length) return res.status(403).json({ error: 'メンバーがおらん' });
    const members = room.members.filter(id => id !== decoded.id);
    const picked = members[Math.floor(Math.random() * members.length)] || decoded.id;
    const user = await User.findOne({ id: picked }, { username: 1, display_name: 1, avatar: 1 }).lean();
    res.json({ userId: picked, username: user?.display_name || user?.username || '不明' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== 誕生日 =====
app.patch('/api/users/me/birthday', async (req, res) => {
  try {
    const decoded = auth(req);
    const { birthday } = req.body; // 'MM-DD'形式
    await User.findOneAndUpdate({ id: decoded.id }, { birthday });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/friends/birthdays', async (req, res) => {
  try {
    const decoded = auth(req);
    const friends = await Friend.find({ user_id: decoded.id }).lean();
    const friendIds = friends.map(f => f.friend_id);
    const today = new Date();
    const todayStr = String(today.getMonth() + 1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const users = await User.find({ id: { $in: friendIds }, birthday: { $exists: true, $ne: null } },
      { id:1, username:1, display_name:1, avatar:1, birthday:1 }).lean();
    const todayBirthdays = users.filter(u => u.birthday === todayStr);
    res.json({ today: todayBirthdays, all: users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== AI占い =====
app.get('/api/ai/fortune', async (req, res) => {
  try {
    auth(req);
    const signs = ['牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座','天秤座','蠍座','射手座','山羊座','水瓶座','魚座'];
    const { sign } = req.query;
    const today = new Date().toLocaleDateString('ja-JP');
    const prompt = `あなたは占い師です。${sign || '全体'}の今日（${today}）の運勢を、ラッキーカラー・ラッキーナンバー・総合運・恋愛運・仕事運の5項目で、各1〜2文で楽しく占ってください。絵文字を使って読みやすくしてね。`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || '今日の運勢は不明やで', sign: sign || '全体', signs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== AI TLDR（1行要約）=====
app.post('/api/ai/tldr', async (req, res) => {
  try {
    auth(req);
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'テキストが空やで' });
    const prompt = `次のメッセージを「要するに：」で始まる1行（30字以内）で要約してください。

${text}`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== AI ToDo抽出 =====
app.post('/api/ai/extract-todos', async (req, res) => {
  try {
    auth(req);
    const { messages: msgs } = req.body;
    if (!msgs?.length) return res.json({ todos: [] });
    const text = msgs.map(m => `${m.senderName}: ${m.content}`).join('\n');
    const prompt = `次の会話からタスク・やること・約束事を抽出して、JSON配列で返してください。形式: [{"task":"タスク内容","who":"担当者（不明なら空）","deadline":"期限（不明なら空）"}]

${text}

JSONのみ返してください。`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
    try {
      const todos = JSON.parse(raw.replace(/```json|```/g, '').trim());
      res.json({ todos: Array.isArray(todos) ? todos : [] });
    } catch { res.json({ todos: [] }); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ハッシュタグ（VOOM）=====
app.get('/api/voom/hashtag/:tag', async (req, res) => {
  try {
    auth(req);
    const tag = decodeURIComponent(req.params.tag);
    const posts = await Post.find({ type: 'voom', content: { $regex: '#' + tag, $options: 'i' } })
      .sort({ created_at: -1 }).limit(30).lean();
    res.json(posts);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/voom/trending', async (req, res) => {
  try {
    auth(req);
    const since = new Date(Date.now() - 7 * 86400000);
    const posts = await Post.find({ type: 'voom', created_at: { $gte: since } }, { content: 1 }).lean();
    const tagCount = {};
    posts.forEach(p => {
      const tags = p.content?.match(/#[\w\u3000-\u9fff゠-ヿ぀-ゟ]+/g) || [];
      tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    const trending = Object.entries(tagCount).sort((a,b) => b[1]-a[1]).slice(0,10).map(([tag,count]) => ({ tag, count }));
    res.json(trending);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== オープンコミュニティ =====
app.post('/api/community/create', async (req, res) => {
  try {
    const decoded = auth(req);
    const { name, description, icon } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名前を入力してな' });
    const id = 'community_' + uuidv4();
    const room = await Room.create({
      id, name: name.trim(), type: 'community',
      members: [decoded.id], admin: decoded.id,
      description: description || '', icon: icon || '🌍',
      invite_code: Math.random().toString(36).substring(2,8).toUpperCase(),
      is_public: true, created_at: new Date()
    });
    res.json(room);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/community/join/:code', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOneAndUpdate(
      { invite_code: req.params.code.toUpperCase(), is_public: true },
      { $addToSet: { members: decoded.id } },
      { returnDocument: 'after' }
    );
    if (!room) return res.status(404).json({ error: '無効なコードやで' });
    res.json({ ok: true, roomId: room.id, roomName: room.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/community/list', async (req, res) => {
  try {
    auth(req);
    const communities = await Room.find({ is_public: true, type: 'community' },
      { id:1, name:1, description:1, icon:1, invite_code:1, members:1 }).limit(50).lean();
    res.json(communities.map(c => ({ ...c, memberCount: c.members?.length || 0, members: undefined })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== デイリーログインボーナス =====
app.post('/api/daily-bonus', async (req, res) => {
  try {
    const decoded = auth(req);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const user = await User.findOne({ id: decoded.id }).lean();
    if (!user) return res.status(404).json({ error: 'ユーザーが見つからん' });

    if (user.last_login_date === today) {
      return res.json({ already: true, coins: user.coins, streak: user.login_streak || 0 });
    }

    // 連続ログイン判定
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = user.last_login_date === yesterday ? (user.login_streak || 0) + 1 : 1;

    // ボーナスコイン計算（連続日数に応じてアップ）
    const baseCoins = 10;
    const streakBonus = Math.min(streak * 2, 50); // 最大50ボーナス
    const totalCoins = baseCoins + streakBonus;

    const updated = await User.findOneAndUpdate(
      { id: decoded.id },
      { $inc: { coins: totalCoins }, last_login_date: today, login_streak: streak },
      { returnDocument: 'after', projection: { coins: 1, login_streak: 1 } }
    );

    // バッジチェック
    checkAndAwardBadges(decoded.id);

    res.json({ ok: true, coinsEarned: totalCoins, coins: updated.coins, streak, baseCoins, streakBonus });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ランキング =====
app.get('/api/ranking', async (req, res) => {
  try {
    auth(req);
    const { type = 'message' } = req.query;
    let sortField = 'message_count';
    if (type === 'coins') sortField = 'coins';
    if (type === 'streak') sortField = 'login_streak';
    if (type === 'badges') sortField = 'badges';

    const users = await User.find({}, {
      id:1, username:1, avatar:1, message_count:1, coins:1, login_streak:1, badges:1
    }).sort({ [sortField]: -1 }).limit(20).lean();

    res.json(users.map((u, i) => ({
      rank: i + 1,
      id: u.id, username: u.username, avatar: u.avatar || null,
      message_count: u.message_count || 0,
      coins: u.coins || 0,
      login_streak: u.login_streak || 0,
      badge_count: (u.badges || []).length
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ファイル管理（送信済みファイル一覧） =====
app.get('/api/rooms/:roomId/files', async (req, res) => {
  try {
    auth(req);
    const files = await Message.find({
      room_id: req.params.roomId,
      type: { $in: ['image', 'file', 'video', 'audio'] },
      deleted: false
    }, {
      id:1, type:1, content:1, sender_id:1, created_at:1, fileData:1
    }).sort({ created_at: -1 }).limit(100).lean();
    res.json(files);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== WakkaBOT（@WakkaBOTメンションで返答） =====
app.post('/api/ai/wakkabot', async (req, res) => {
  try {
    auth(req);
    const { message, history } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'メッセージが空やで' });
    const historyText = (history || []).slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');
    const prompt = `あなたはWakkaChatのAIアシスタント「WakkaBOT」です。
少しだけ関西弁を使い、フレンドリーで明るく返答します。
長くなりすぎず、150字以内で返答してください。

${historyText ? `会話の流れ:
${historyText}

` : ''}ユーザーのメッセージ: ${message}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || 'うまく返答できんかったで…' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== 感情分析 =====
app.post('/api/ai/emotion', async (req, res) => {
  try {
    auth(req);
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ emoji: '😐' });
    const prompt = `次のメッセージの感情を分析して、最も当てはまる絵文字を1つだけ返してください。絵文字以外は何も返さないでください。
選択肢: 😊 😂 😢 😡 😍 😮 😰 🤔 👍 ❤️ 😐
メッセージ: ${text}`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const emoji = data.content?.[0]?.text?.trim() || '😐';
    res.json({ emoji });
  } catch(e) { res.status(500).json({ emoji: '😐' }); }
});

app.post('/api/ai/assist', async (req, res) => {
  try {
    auth(req);
    const { type, messages: msgs, text, targetLang } = req.body;
    let prompt = '';
    if (type === 'summary') {
      const chatText = (msgs || []).map(m => `${m.senderName}: ${m.content}`).join('\n');
      if (!chatText.trim()) return res.status(400).json({ error: 'メッセージがありません' });
      prompt = `以下のチャット会話を日本語で3〜5行に要約してください。\n\n${chatText}`;
    } else if (type === 'translate') {
      if (!text?.trim()) return res.status(400).json({ error: '翻訳するテキストがありません' });
      prompt = `次のテキストを${targetLang || '英語'}に翻訳してください。翻訳結果だけ返してください。\n\n${text}`;
    } else if (type === 'suggest') {
      const chatText = (msgs || []).slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');
      if (!chatText.trim()) return res.status(400).json({ error: 'メッセージがありません' });
      prompt = `以下の会話の流れを読んで、自然な返信案を3つ提案してください。番号付きリストで返してください。\n\n${chatText}`;
    } else {
      return res.status(400).json({ error: '不正なタイプです' });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: `AI APIエラー: ${err?.error?.message || response.status}` });
    }
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || 'AIからの返答が空やったで' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== メッセージ翻訳 =====
app.post('/api/translate', async (req, res) => {
  try {
    auth(req);
    const { text, targetLang } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300,
        messages: [{ role: 'user', content: `次のテキストを${targetLang || '日本語'}に翻訳してください。翻訳結果だけ返してください。\n\n${text}` }] })
    });
    const data = await response.json();
    res.json({ result: data.content?.[0]?.text || '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== スケジュール送信 =====
app.post('/api/rooms/:roomId/schedule', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content, sendAt } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'メッセージを入力してください' });
    if (!sendAt) return res.status(400).json({ error: '送信日時を指定してください' });
    const sendTime = new Date(sendAt);
    if (isNaN(sendTime.getTime())) return res.status(400).json({ error: '日時の形式が正しくありません' });
    if (sendTime <= new Date()) return res.status(400).json({ error: '送信日時は未来の日時を指定してください' });
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id }, { id: 1, members: 1 }).lean();
    if (!room) return res.status(403).json({ error: '権限なし' });
    const user = await User.findOne({ id: decoded.id }, { display_name: 1, username: 1, avatar: 1 }).lean();
    const msg = await ScheduledMessage.create({
      id: 'sched_' + uuidv4(), room_id: req.params.roomId,
      sender_id: decoded.id, sender_name: user.display_name || user.username,
      sender_avatar: user.avatar || null,
      content: content.trim(), send_at: sendTime
    });
    res.json(msg);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// スケジュール一覧（/schedules エイリアス）
app.get('/api/rooms/:roomId/schedules', async (req, res) => {
  try {
    const decoded = auth(req);
    const msgs = await ScheduledMessage.find({ room_id: req.params.roomId, sender_id: decoded.id, sent: false }).sort({ send_at: 1 }).lean();
    res.json(msgs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/rooms/:roomId/scheduled', async (req, res) => {
  try {
    const decoded = auth(req);
    const msgs = await ScheduledMessage.find({ room_id: req.params.roomId, sender_id: decoded.id, sent: false }).sort({ send_at: 1 }).lean();
    res.json(msgs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// スケジュールキャンセル（/schedules エイリアス）
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const decoded = auth(req);
    await ScheduledMessage.deleteOne({ id: req.params.id, sender_id: decoded.id });
    res.json({ ok: true });
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
    const { question, options, multi, allow_free_text } = req.body;
    if (!question || !question.trim()) return res.status(400).json({ error: '質問を入力してください' });
    if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: '選択肢は2つ以上必要です' });
    if (options.length > 10) return res.status(400).json({ error: '選択肢は10個までです' });
    if (question.length > 200) return res.status(400).json({ error: '質問は200文字以内にしてください' });
    const poll = await Poll.create({
      id: 'poll_' + uuidv4(), room_id: req.params.roomId,
      creator_id: decoded.id, question: question.trim(), multi: !!multi,
      allow_free_text: !!allow_free_text,
      free_text_answers: [],
      options: options.map((t, i) => ({ id: 'opt_' + i, text: (t || '').trim().slice(0, 100), voters: [] }))
    });
    // メッセージとして送信
    const user = await User.findOne({ id: decoded.id }, { display_name: 1, username: 1 }).lean();
    
    const msg = await Message.create({
      id: 'msg_' + uuidv4(), room_id: req.params.roomId,
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
    const poll = await Poll.findOne({ id: req.params.pollId }).lean();
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
    const poll = await Poll.findOneAndUpdate({ id: req.params.pollId, creator_id: decoded.id }, { closed: true }, { returnDocument: 'after' });
    if (!poll) return res.status(404).json({ error: '投票が見つかりません' });
    io.to(poll.room_id).emit('poll:updated', poll);
    res.json(poll);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// 記述回答の送信
app.post('/api/polls/:pollId/free-text', async (req, res) => {
  try {
    const decoded = auth(req);
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'テキストを入力してください' });
    const poll = await Poll.findOne({ id: req.params.pollId });
    if (!poll || poll.closed) return res.status(400).json({ error: '投票できません' });
    if (!poll.allow_free_text) return res.status(400).json({ error: '記述投票は許可されていません' });
    const user = await User.findOne({ id: decoded.id });
    // 同じユーザーの既存回答は上書き
    poll.free_text_answers = poll.free_text_answers.filter(a => a.user_id !== decoded.id);
    poll.free_text_answers.push({ user_id: decoded.id, username: user.display_name || user.username, text: text.trim(), created_at: new Date() });
    await poll.save();
    io.to(poll.room_id).emit('poll:updated', poll);
    res.json(poll);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== タスク =====
app.post('/api/rooms/:roomId/tasks', async (req, res) => {
  try {
    const decoded = auth(req);
    
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
    const tasks = await Task.find({ room_id: req.params.roomId }).sort({ created_at: -1 }).lean();
    res.json(tasks);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    const decoded = auth(req);
    const task = await Task.findOne({ id: req.params.taskId });
    if (!task) return res.status(404).json({ error: 'タスクが見つかりません' });
    // 作成者またはアサイニーのみ更新可
    if (task.creator_id !== decoded.id && task.assignee_id !== decoded.id) {
      return res.status(403).json({ error: '権限がありません' });
    }
    const allowed = {};
    if (req.body.done !== undefined) allowed.done = !!req.body.done;
    if (req.body.title) allowed.title = String(req.body.title).slice(0, 200);
    if (req.body.due !== undefined) allowed.due = req.body.due ? new Date(req.body.due) : null;
    const updated = await Task.findOneAndUpdate({ id: req.params.taskId }, allowed, { returnDocument: 'after' });
    io.to(updated.room_id).emit('task:updated', updated);
    res.json(updated);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/tasks/:taskId', async (req, res) => {
  try {
    const decoded = auth(req);
    const task = await Task.findOne({ id: req.params.taskId });
    if (!task) return res.status(404).json({ error: 'タスクが見つかりません' });
    // 作成者のみ削除可
    if (task.creator_id !== decoded.id) {
      return res.status(403).json({ error: '削除できるのは作成者のみです' });
    }
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
    
    const { content, ttlSeconds } = req.body;
    const user = await User.findOne({ id: decoded.id }, { display_name: 1, username: 1 }).lean();
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
    const safeTtl = Math.max(5, Math.min(Number(ttlSeconds) || 30, 3600)); // 5秒〜1時間
    setTimeout(async () => {
      await Message.deleteOne({ id: msg.id });
      io.to(req.params.roomId).emit('message:deleted', { messageId: msg.id, roomId: req.params.roomId });
    }, safeTtl * 1000);
    res.json(msg);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== スケジュール送信の実行（1分ごとにチェック） =====
setInterval(async () => {
  try {
    const now = new Date();
    const due = await ScheduledMessage.find({ sent: false, send_at: { $lte: now } }).lean();
    for (const sm of due) {
      
      const msg = await Message.create({
        id: 'msg_' + uuidv4(), room_id: sm.room_id,
        sender_id: sm.sender_id, sender_name: sm.sender_name,
        sender_avatar: sm.sender_avatar || null,
        content: sm.content, type: 'text', created_at: now,
        read_by: [sm.sender_id], reactions: [],
      });
      io.to(sm.room_id).emit('message:receive', {
        id: msg.id, roomId: sm.room_id, senderId: sm.sender_id,
        senderName: sm.sender_name, senderAvatar: sm.sender_avatar || null,
        content: sm.content,
        type: 'text', createdAt: now,
        readBy: [sm.sender_id], reactions: [],
      });
      await ScheduledMessage.findOneAndUpdate({ id: sm.id }, { sent: true }, {returnDocument:'after'});
    }
  } catch(e) { console.error('スケジュール送信エラー:', e); }
}, 60000);

// ステータス自動変更（1分ごと）
setInterval(async () => {
  try {
    const nowHour = new Date().getHours();
    const users = await User.find({ 'auto_status_rules.0': { $exists: true } }, { id: 1, auto_status_rules: 1 }).lean();
    for (const user of users) {
      const rule = user.auto_status_rules.find(r => {
        if (r.fromHour <= r.toHour) return nowHour >= r.fromHour && nowHour < r.toHour;
        return nowHour >= r.fromHour || nowHour < r.toHour; // 深夜をまたぐ場合
      });
      if (rule) {
        await User.findOneAndUpdate({ id: user.id }, { status: rule.status });
        io.emit('user:status_update', { userId: user.id, status: rule.status });
      }
    }
  } catch(e) { console.error('ステータス自動変更エラー:', e); }
}, 60000);

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
// 起動時: 壊れたFriendレコードをクリーンアップ
(async () => {
  try {
    const result = await Friend.deleteMany({ $or: [{ user_id: null }, { friend_id: null }, { user_id: '' }, { friend_id: '' }] });
    if (result.deletedCount > 0) console.log(`壊れたFriendレコード ${result.deletedCount} 件を削除`);
  } catch (e) {}
})();

httpServer.listen(PORT, '0.0.0.0', () => console.log('Server: http://localhost:' + PORT));

// 未処理のPromise拒否でサーバーが落ちないように
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
