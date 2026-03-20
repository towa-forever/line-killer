require("dotenv").config();
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
const { v4: uuidv4 } = require('uuid');
const { User, Room, Message, Friend, FriendRequest, Post, Note, ScheduledMessage, Poll, Task, Event, Favorite, GameScore, GameCoin, GameItem, Story, PushSubscription } = require('./db');

const app = express();

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
    const subs = await PushSubscription.find();
    subs.forEach(s => pushSubscriptions.set(s.user_id, s.subscription));
    console.log(`Push subscriptions loaded: ${subs.length}`);
  } catch(e) { console.error('Push subscription load error:', e); }
})();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,       // 20秒（デフォルト20000）
  pingInterval: 10000,      // 10秒ごとにping（デフォルト25000より短く）
  transports: ['websocket', 'polling'], // WebSocket優先
  upgradeTimeout: 5000,     // アップグレード待機5秒
  maxHttpBufferSize: 2e6,   // 2MB（メッセージバッファ）
  connectTimeout: 10000,    // 接続タイムアウト10秒
});
app.set('io', io);

app.use(cors());
app.use(compression()); // gzip圧縮（全ルートに有効）
app.use(helmet({ contentSecurityPolicy: false })); // セキュリティヘッダー

// ログイン・登録のレートリミット（ブルートフォース対策）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 100回まで（ログイン・登録・PIN確認など含む）
  message: { error: 'リクエストが多すぎます。しばらく待ってから試してください' },
  standardHeaders: true, legacyHeaders: false,
});
// APIのレートリミット（一般）
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 600, // 600回まで
  message: { error: 'リクエストが多すぎます' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);
// 管理エンドポイント（ADMIN_KEY必須）
app.get('/admin/reset-requests', async (req, res) => {
  try {
    const key = req.query.key || req.headers['x-admin-key'];
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
    await FriendRequest.deleteMany({});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'サーバーエラー' }); }
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
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
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
app.post('/api/auth/secret-question', async (req, res) => {
  try {
    const decoded = auth(req);
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: '質問と答えは必須です' });
    const hashed = await bcrypt.hash(answer.trim().toLowerCase(), 10);
    await User.findOneAndUpdate({ id: decoded.id }, { secret_question: question, secret_answer: hashed });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// 秘密の質問取得（ユーザー名で検索）
app.get('/api/auth/secret-question/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user || !user.secret_question) return res.status(404).json({ error: '秘密の質問が設定されていません' });
    res.json({ question: user.secret_question });
  } catch { res.status(500).json({ error: 'エラー' }); }
});

// パスワードリセット実行
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, answer, newPassword } = req.body;
    if (!username || !answer || !newPassword) return res.status(400).json({ error: '必須項目が不足しています' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
    const user = await User.findOne({ username });
    if (!user || !user.secret_answer) return res.status(404).json({ error: 'ユーザーが見つからないか質問が未設定です' });
    const ok = await bcrypt.compare(answer.trim().toLowerCase(), user.secret_answer);
    if (!ok) return res.status(401).json({ error: '答えが違います' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ username }, { password: hashed });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'リセットに失敗しました' }); }
});

// ===== 2段階認証（PIN） =====
app.post('/api/auth/pin/setup', async (req, res) => {
  try {
    const decoded = auth(req);
    const { pin } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PINは4〜6桁の数字にしてください' });
    const hashed = await bcrypt.hash(pin, 10);
    await User.findOneAndUpdate({ id: decoded.id }, { pin_code: hashed, pin_enabled: true });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/auth/pin/disable', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { pin_code: '', pin_enabled: false });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/auth/pin/verify', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    if (!user || !user.pin_enabled) return res.json({ ok: true }); // PIN未設定は通過
    const ok = await bcrypt.compare(String(req.body.pin), user.pin_code);
    if (!ok) return res.status(401).json({ error: 'PINが違います' });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ===== パスワード変更 =====
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const decoded = auth(req);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
    if (newPassword.length < 6) return res.status(400).json({ error: '新しいパスワードは6文字以上にしてください' });
    const user = await User.findOne({ id: decoded.id });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: '現在のパスワードが違います' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ id: decoded.id }, { password: hashed });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'サーバーエラー' }); }
});

// ===== ログイン履歴 =====
app.get('/api/auth/login-history', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json(user?.login_history?.slice(-10).reverse() || []);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ===== 認証 =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    const uname = username.trim().toLowerCase();
    if (uname.length < 3 || uname.length > 20) return res.status(400).json({ error: 'ユーザー名は3〜20文字にしてください' });
    if (!/^[a-z0-9_\-.]+$/.test(uname)) return res.status(400).json({ error: 'ユーザー名は英小文字・数字・_ ・- ・. のみ使えます' });
    if (password.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
    const exists = await User.findOne({ username: uname });
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
  } catch(e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'パスワードが違います' });
    // ログイン履歴を記録
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    await User.findOneAndUpdate({ id: user.id }, { $push: { login_history: { $each: [{ ip, ua, at: new Date() }], $slice: -20 } } });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
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
    }});
  } catch(e) { res.status(500).json({ error: 'サーバーエラー' }); }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { password: 0 });
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    res.json({ user: {
      id: user.id, username: user.username, avatar: user.avatar,
      coverImage: user.cover_image || '', displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      mutedRooms: user.muted_rooms || [], bookmarks: user.bookmarked_messages || [],
      avatarFrame: user.avatar_frame || 'none', soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false, secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [],
    }});
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// /api/users/me のエイリアス（GETのみ）
app.get('/api/users/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id }, { password: 0 });
    if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
    res.json({
      id: user.id, username: user.username, avatar: user.avatar,
      coverImage: user.cover_image || '', displayName: user.display_name || user.username,
      bio: user.bio || '', status: user.status || '',
      mutedRooms: user.muted_rooms || [], bookmarks: user.bookmarked_messages || [],
      avatarFrame: user.avatar_frame || 'none', soundTheme: user.sound_theme || 'default',
      pinEnabled: user.pin_enabled || false, secretQuestion: user.secret_question || '',
      blockedUsers: user.blocked_users || [], coins: user.coins || 0,
    });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});



// ===== 下書き保存 =====
app.put('/api/drafts/:roomId', async (req, res) => {
  try {
    const decoded = auth(req);
    const { content } = req.body;
    const user = await User.findOne({ id: decoded.id });
    const drafts = user?.drafts || {};
    if (content) drafts[req.params.roomId] = content;
    else delete drafts[req.params.roomId];
    await User.findOneAndUpdate({ id: decoded.id }, { drafts });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/drafts', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json(user?.drafts || {});
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ===== 後で読む =====
app.post('/api/read-later/:msgId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $addToSet: { read_later: req.params.msgId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/read-later/:msgId', async (req, res) => {
  try {
    const decoded = auth(req);
    await User.findOneAndUpdate({ id: decoded.id }, { $pull: { read_later: req.params.msgId } });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/read-later', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const msgs = await Message.find({ id: { $in: user?.read_later || [] } });
    res.json(msgs);
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ===== ギフト送信 =====
app.post('/api/users/:userId/gift', async (req, res) => {
  try {
    const decoded = auth(req);
    const { amount, stampId } = req.body;
    if (!amount || amount < 1 || amount > 1000) return res.status(400).json({ error: 'ギフト量が不正です' });
    const sender = await User.findOne({ id: decoded.id });
    if (!sender || (sender.coins || 0) < amount) return res.status(400).json({ error: 'コインが不足しています' });
    const receiver = await User.findOne({ id: req.params.userId });
    if (!receiver) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    await User.findOneAndUpdate({ id: decoded.id }, { $inc: { coins: -amount, gift_sent: amount } });
    await User.findOneAndUpdate({ id: req.params.userId }, { $inc: { coins: amount, gift_received: amount } });
    // ギフト通知
    io.to('user_' + req.params.userId).emit('gift:received', {
      from: decoded.username, amount, stampId,
    });
    res.json({ ok: true, newBalance: (sender.coins || 0) - amount });
  } catch { res.status(500).json({ error: 'ギフト送信に失敗しました' }); }
});

// コイン残高取得
app.get('/api/users/me/coins', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    res.json({ coins: user?.coins || 0, gift_sent: user?.gift_sent || 0, gift_received: user?.gift_received || 0 });
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
    PushSubscription.findOneAndUpdate({ user_id: decoded.id }, { user_id: decoded.id, subscription: req.body, updated_at: new Date() }, { upsert: true, new: true }).catch(() => {});
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.delete('/api/push/subscribe', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証エラー' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    pushSubscriptions.delete(decoded.id);
    PushSubscription.deleteOne({ user_id: decoded.id }).catch(() => {});
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
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    if (!room.invite_code) {
      const { v4: uuidv4 } = require('uuid');
      room.invite_code = uuidv4().replace(/-/g, '').slice(0, 12);
      await room.save();
    }
    res.json({ inviteCode: room.invite_code, inviteUrl: `${process.env.CLIENT_URL || 'https://line-killer.onrender.com'}/invite/${room.invite_code}` });
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// ===== チャットテーマカラー =====
app.patch('/api/rooms/:roomId/theme', async (req, res) => {
  try {
    const decoded = auth(req);
    const { themeColor } = req.body;
    const room = await Room.findOneAndUpdate(
      { id: req.params.roomId, members: decoded.id },
      { theme_color: themeColor || '' },
      { new: true }
    );
    if (!room) return res.status(403).json({ error: '権限なし' });
    io.to('room_' + req.params.roomId).emit('room:theme_changed', { roomId: req.params.roomId, themeColor: themeColor || '' });
    res.json({ ok: true });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});


// ===== サブアカウント =====

// サブアカ一覧取得
app.get('/api/sub-accounts', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const subs = await User.find({ id: { $in: user.sub_accounts || [] } }, { password: 0 });
    res.json(subs.map(s => ({ id: s.id, username: s.username, displayName: s.display_name || s.username, avatar: s.avatar, bio: s.bio })));
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
    if (username.length < 3) return res.status(400).json({ error: 'IDは3文字以上にしてください' });
    if (password.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: 'このIDはすでに使われています' });

    const id = require('uuid').v4();
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
    const { v4: uuidv4 } = require('uuid');
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
    const contacts = await Contact.find().sort({ created_at: -1 }).limit(100);
    res.json(contacts);
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// QRコードで友達追加（ユーザー名で検索して申請）
app.post('/api/friends/by-qr', async (req, res) => {
  try {
    const decoded = auth(req);
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'ユーザー名が必要です' });
    const target = await User.findOne({ username });
    if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (target.id === decoded.id) return res.status(400).json({ error: '自分自身には送れません' });
    const already = await Friend.findOne({ user_id: decoded.id, friend_id: target.id });
    if (already) return res.json({ ok: true, message: 'すでに友達です' });
    const { v4: uuidv4 } = require('uuid');
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
      { username: { $regex: q, $options: 'i' }, id: { $ne: decoded.id } },
      { id: 1, username: 1, display_name: 1, avatar: 1, status: 1, bio: 1, is_official: 1 }
    ).limit(20);
    res.json(users);
  } catch { res.status(401).json({ error: 'unauthorized' }); }
});

app.get('/api/users', async (req, res) => {
  try {
    auth(req); // 認証必須
    const users = await User.find({}, { id: 1, username: 1, display_name: 1, avatar: 1, status: 1, is_official: 1 });
    res.json(users);
  } catch (e) { res.status(401).json({ error: '認証エラー' }); }
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
    const user = await User.findOneAndUpdate({ id: decoded.id }, update, { new: true, projection: { password: 0 } });
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
    };
    io.emit('user:updated', userRes);
    res.json(userRes);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 友だち申請
app.get('/api/friend-requests', async (req, res) => {
  try {
    const decoded = auth(req);
    const requests = await FriendRequest.find({ to_id: decoded.id, status: 'pending' });
    // 申請者のアバターも付与
    const withAvatar = await Promise.all(requests.map(async r => {
      const fromUser = await User.findOne({ id: r.from_id }, { avatar: 1, display_name: 1 });
      return { ...r.toObject(), from_avatar: fromUser?.avatar || null, from_display_name: fromUser?.display_name || r.from_name };
    }));
    res.json(withAvatar);
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
    await Friend.findOneAndUpdate(
      { user_id: decoded.id, friend_id: request.from_id },
      { $setOnInsert: { user_id: decoded.id, friend_id: request.from_id } },
      { upsert: true }
    );
    await Friend.findOneAndUpdate(
      { user_id: request.from_id, friend_id: decoded.id },
      { $setOnInsert: { user_id: request.from_id, friend_id: decoded.id } },
      { upsert: true }
    );
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
    const annText = (req.body.text || '').slice(0, 200); // 200文字まで
    await Room.findOneAndUpdate({ id: req.params.roomId }, { announcement: annText });
    io.to(req.params.roomId).emit('room:announcement', { roomId: req.params.roomId, text: annText, by: decoded.id });
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
    // JWTにusernameがない古いトークン対策：DBから必ず取得
    const user = await User.findOne({ id: decoded.id });
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
    if (!content || !content.trim()) return res.status(400).json({ error: 'コメントを入力してください' });
    const comment = { id: uuidv4(), user_id: decoded.id, username: decoded.username, content: content.trim().slice(0, 500), created_at: new Date() };
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
    // 各ルームの最新メッセージを一括取得（N+1を避けるためPromise.all）
    const roomsWithLast = await Promise.all(rooms.map(async r => {
      const lastMsg = await Message.findOne({ room_id: r.id, deleted: false })
        .sort({ created_at: -1 }).select('content type sender_name created_at');
      // メンバー詳細（名前・アバター）を取得
      const memberUsers = await User.find({ id: { $in: r.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
      const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
      return {
        id: r.id, name: r.name, icon: r.icon, members: r.members,
        memberDetails,
        pinned_message_id: r.pinned_message_id,
        announcement: r.announcement || null,
        creator_id: r.creator_id || null,
        theme_color: r.theme_color || '',
        invite_code: r.invite_code || null,
        lastMessage: lastMsg ? {
          content: lastMsg.content, type: lastMsg.type,
          senderName: lastMsg.sender_name, createdAt: lastMsg.created_at
        } : null,
        lastActivity: lastMsg ? lastMsg.created_at : r.created_at,
      };
    }));
    // 最新メッセージ順にソート
    roomsWithLast.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    res.json(roomsWithLast);
  } catch { res.status(401).json({ error: '認証エラー' }); }
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
    });
    if (existing) {
      const memberUsers = await User.find({ id: { $in: existing.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
      const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
      return res.json({ ...existing.toObject(), id: existing.id, memberDetails });
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
    const memberUsers = await User.find({ id: { $in: room.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
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
    // フレンドチェック（friend_id または id フィールドで照合）
    const friends = await Friend.find({ user_id: decoded.id });
    const friendIds = friends.map(f => f.friend_id);
    // フレンドでなくても自分は必ず含める。フレンドIDが一致するものを優先、なければそのまま追加
    const validMembers = safeIds.filter(id => friendIds.includes(id) || safeIds.length === 0);
    // フレンドが0人でも作成できるようにfallback
    const finalMembers = validMembers.length > 0 ? validMembers : safeIds;
    const members = [...new Set([decoded.id, ...finalMembers])];
    const id = 'room_' + uuidv4();
    const room = await Room.create({ id, name: name.trim(), members, creator_id: decoded.id });
    const memberUsers = await User.find({ id: { $in: members } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
    const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
    const roomObj = { id: room.id, name: room.name, icon: room.icon, members: room.members, memberDetails, pinned_message_id: null, lastMessage: null };
    members.forEach(mid => io.to('user_' + mid).emit('room:new', roomObj));
    res.json(roomObj);
  } catch(e) { res.status(500).json({ error: 'ルーム作成に失敗しました: ' + e.message }); }
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
    // memberDetailsを含めてroom:newを送信
    const memberUsers = await User.find({ id: { $in: room.members } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
    const memberDetails = memberUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
    const roomObj = { id: room.id, name: room.name, icon: room.icon, members: room.members, memberDetails, pinned_message_id: room.pinned_message_id, lastMessage: null };
    memberIds.forEach(mid => io.to('user_' + mid).emit('room:new', roomObj));
    io.to(req.params.roomId).emit('room:members_updated', { roomId: req.params.roomId, members: room.members });
    res.json({ members: room.members });
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

// メンバー削除API
app.delete('/api/rooms/:roomId/members/:userId', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'ルームが見つかりません' });
    // 自分自身を退出 or 作成者が他のメンバーを削除
    if (decoded.id !== req.params.userId && room.creator_id !== decoded.id)
      return res.status(403).json({ error: '権限なし' });
    const updated = await Room.findOneAndUpdate(
      { id: req.params.roomId },
      { $pull: { members: req.params.userId } }, { new: true }
    );
    io.to(req.params.roomId).emit('room:members_updated', { roomId: req.params.roomId, members: updated.members, removedId: req.params.userId });
    res.json({ members: updated.members });
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
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
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // ページネーション用
    const query = { room_id: req.params.roomId };
    if (before) query.created_at = { $lt: new Date(before) };
    const msgs = await Message.find(query).sort({ created_at: -1 }).limit(limit).then(r => r.reverse());
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
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/rooms/:roomId/search', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
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
    const msgs = await Message.find(query).sort({ created_at: -1 }).limit(100);
    res.json(msgs.reverse().map(m => ({
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

// 全ルームの画像一括取得（アルバム用）
app.get('/api/album', async (req, res) => {
  try {
    const decoded = auth(req);
    const rooms = await Room.find({ members: decoded.id });
    const roomIds = rooms.map(r => r.id);
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.name || 'ルーム']));
    const imgs = await Message.find({ room_id: { $in: roomIds }, type: { $in: ['image', 'file'] }, deleted: false })
      .sort({ created_at: -1 }).limit(500);
    res.json(imgs.map(img => ({ ...img.toObject(), roomName: roomMap[img.room_id] || 'ルーム' })));
  } catch { res.status(401).json({ error: '認証エラー' }); }
});

app.get('/api/rooms/:roomId/album', async (req, res) => {
  try {
    const decoded = auth(req);
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const imgs = await Message.find({ room_id: req.params.roomId, type: { $in: ['image', 'file'] }, deleted: false }).sort({ created_at: -1 }).limit(200);
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
  const myRooms = await Room.find({ members: socket.user.id });
  myRooms.forEach(r => socket.join(r.id));

  socket.on('room:join', async (roomId) => {
    try {
      const room = await Room.findOne({ id: roomId, members: socket.user.id });
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
    const room = await Room.findOne({ id: roomId, members: socket.user.id });
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
      createdAt: msg.created_at
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
        });
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
      const msg = await Message.findOneAndUpdate(
        { id: messageId, sender_id: socket.user.id },
        { content: content.trim(), edited: true }, { new: true }
      );
      if (!msg) return;
      io.to(roomId).emit('message:edited', { messageId, content: content.trim(), roomId });
    } catch(e) {}
  });

  socket.on('message:delete', async ({ roomId, messageId }) => {
    try {
      const msg = await Message.findOneAndUpdate(
        { id: messageId, sender_id: socket.user.id },
        { deleted: true, content: 'このメッセージは削除されました' }
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
        { new: true }
      );
      if (!msg) return;
      const readers = await User.find({ id: { $in: msg.read_by } }, { id: 1, username: 1, display_name: 1, avatar: 1 });
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
          updated = await Message.findOneAndUpdate({ id: messageId }, { $pull: { reactions: { user_id: socket.user.id } } }, { new: true });
        } else {
          updated = await Message.findOneAndUpdate({ id: messageId, 'reactions.user_id': socket.user.id }, { $set: { 'reactions.$.emoji': emoji } }, { new: true });
        }
      } else {
        updated = await Message.findOneAndUpdate({ id: messageId }, { $push: { reactions: { emoji, user_id: socket.user.id } } }, { new: true });
      }
      if (!updated) return;
      io.to(roomId).emit('message:reacted', { messageId, reactions: updated.reactions, roomId });
    } catch(e) { console.error('message:react error:', e); }
  });

  socket.on('room:leave', async ({ roomId }) => {
    try {
      await Room.findOneAndUpdate({ id: roomId }, { $pull: { members: socket.user.id } });
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
        const { v4: uuidv4 } = require('uuid');
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

  socket.on('call:end', async ({ roomId, to, duration }) => {
    if (to) {
      io.to('user_' + to).emit('call:ended', { from: socket.user.id });
    } else {
      socket.to(roomId).emit('call:ended', { from: socket.user.id });
    }
    // 通話終了メッセージをチャットに保存
    if (roomId) {
      try {
        const { v4: uuidv4 } = require('uuid');
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
        const { v4: uuidv4 } = require('uuid');
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
    io.to('user_' + to).emit('call:ice', { candidate, from: socket.user.id, callId });
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
        const { v4: uuidv4 } = require('uuid');
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
      User.findOneAndUpdate({ id: socket.user.id }, { last_seen: new Date() }).catch(() => {});
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
    const rooms = await Room.find({ members: decoded.id });
    const roomIds = rooms.map(r => r.id);
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r]));
    // 全ルームのメッセージを検索
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const msgs = await Message.find({
      room_id: { $in: roomIds }, deleted: false,
      $or: [{ content: new RegExp(safeQ, 'i') }, { sender_name: new RegExp(safeQ, 'i') }]
    }).sort({ created_at: -1 }).limit(50);
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
    const rooms = await Room.find({ members: decoded.id });
    const roomIds = rooms.map(r => r.id);
    // 未読メッセージ数（ルームごと）
    const unreadByRoom = await Promise.all(rooms.map(async r => {
      const count = await Message.countDocuments({ room_id: r.id, deleted: false, read_by: { $ne: decoded.id }, sender_id: { $ne: decoded.id } });
      return { roomId: r.id, roomName: r.name, count };
    }));
    // 未完了タスク
    const tasks = await Task.find({ room_id: { $in: roomIds }, done: false }).sort({ due: 1 }).limit(5);
    // 今後のイベント
    const events = await Event.find({ room_id: { $in: roomIds }, start_at: { $gte: new Date() } }).sort({ start_at: 1 }).limit(5);
    // スケジュール送信
    const scheduled = await ScheduledMessage.find({ sender_id: decoded.id, sent: false }).sort({ send_at: 1 }).limit(3);
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
    const { v4: uuidv4 } = require('uuid');
    const existing = await Favorite.findOne({ user_id: decoded.id, message_id: messageId });
    if (existing) { await Favorite.deleteOne({ _id: existing._id }); return res.json({ removed: true }); }
    const fav = await Favorite.create({ id: 'fav_' + uuidv4(), user_id: decoded.id, message_id: messageId, room_id: roomId, content, sender_name: senderName });
    res.json(fav);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/favorites', async (req, res) => {
  try {
    const decoded = auth(req);
    const favs = await Favorite.find({ user_id: decoded.id }).sort({ created_at: -1 });
    res.json(favs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ===== イベント・カレンダー =====
app.post('/api/rooms/:roomId/events', async (req, res) => {
  try {
    const decoded = auth(req);
    const { v4: uuidv4 } = require('uuid');
    const { title, description, startAt, endAt } = req.body;
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
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
    const events = await Event.find({ room_id: req.params.roomId }).sort({ start_at: 1 });
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
      { $set: { 'attendees.$.status': status } }, { new: true }
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
    const room = await Room.findOne({ id: req.params.roomId, members: decoded.id });
    if (!room) return res.status(403).json({ error: '権限なし' });
    const msgs = await Message.find({ room_id: req.params.roomId, deleted: false });
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
      firstMessage: msgs[0]?.created_at,
    });
  } catch(e) { res.status(400).json({ error: e.message }); }
});



// ===== ストーリーAPI =====
app.get('/api/stories', async (req, res) => {
  try {
    auth(req);
    const stories = await Story.find({ expires_at: { $gt: new Date() } }).sort({ created_at: -1 });
    res.json(stories);
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
});

app.post('/api/stories', async (req, res) => {
  try {
    const decoded = auth(req);
    if (!req.body.url) return res.status(400).json({ error: 'URLが必要です' });
    const user = await User.findOne({ id: decoded.id });
    const story = await Story.create({
      id: 'st_' + require('uuid').v4(),
      user_id: decoded.id,
      user_name: user?.display_name || user?.username,
      user_avatar: user?.avatar,
      type: req.body.type || 'image',
      url: req.body.url,
      text: req.body.text,
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
app.get('/api/game/coins', async (req, res) => {
  try {
    const decoded = auth(req);
    let wallet = await GameCoin.findOne({ user_id: decoded.id });
    if (!wallet) wallet = await GameCoin.create({ user_id: decoded.id, coins: 100 });
    res.json({ coins: wallet.coins });
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
});

// スコア送信 → コイン付与
app.post('/api/game/score', async (req, res) => {
  try {
    const decoded = auth(req);
    const { game, score } = req.body;
    if (!game || typeof score !== 'number' || score < 0 || score > 999999) {
      return res.status(400).json({ error: 'スコアが不正です' });
    }
    const VALID_GAMES = ['puzzle', 'memory', 'quiz', 'runner', 'match'];
    if (!VALID_GAMES.includes(game)) return res.status(400).json({ error: '不正なゲーム名' });
    const user = await User.findOne({ id: decoded.id });
    const coinsEarned = Math.min(Math.floor(score / 100), 100); // 1回最大100コインまで  // 100点ごとに1コイン
    const id = 'gs_' + require('uuid').v4();
    await GameScore.create({
      id, user_id: decoded.id,
      username: user?.display_name || user?.username,
      avatar: user?.avatar,
      game, score, coins_earned: coinsEarned
    });
    // コインを加算
    await GameCoin.findOneAndUpdate(
      { user_id: decoded.id },
      { $inc: { coins: coinsEarned }, updated_at: new Date() },
      { upsert: true, new: true }
    );
    res.json({ ok: true, coinsEarned });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ランキング取得
app.get('/api/game/ranking/:game', async (req, res) => {
  try {
    const scores = await GameScore.find({ game: req.params.game })
      .sort({ score: -1 }).limit(20);
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
    const friends = await Friend.find({ user_id: decoded.id });
    const friendIds = [...friends.map(f => f.friend_id), decoded.id];
    const scores = await GameScore.find({ game: req.params.game, user_id: { $in: friendIds } }).sort({ score: -1 });
    const best = {};
    scores.forEach(s => { if (!best[s.user_id] || best[s.user_id].score < s.score) best[s.user_id] = s; });
    res.json(Object.values(best).sort((a, b) => b.score - a.score));
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
});

// ショップアイテム購入
app.post('/api/game/shop/buy', async (req, res) => {
  try {
    const decoded = auth(req);
    const { itemType, itemId, price } = req.body;
    const wallet = await GameCoin.findOne({ user_id: decoded.id });
    if (!wallet || wallet.coins < price) return res.status(400).json({ error: 'コイン不足' });
    // 既に持っているか確認
    const existing = await GameItem.findOne({ user_id: decoded.id, item_id: itemId });
    if (existing) return res.status(400).json({ error: '既に持ってるで' });
    await GameCoin.findOneAndUpdate({ user_id: decoded.id }, { $inc: { coins: -price }, updated_at: new Date() });
    const item = await GameItem.create({ id: 'gi_' + require('uuid').v4(), user_id: decoded.id, item_type: itemType, item_id: itemId });
    // アバターフレーム購入の場合はUserにも反映
    if (itemType === 'avatar_frame') await User.findOneAndUpdate({ id: decoded.id }, { avatar_frame: itemId });
    res.json({ ok: true, item, remainingCoins: wallet.coins - price });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// 所持アイテム一覧
app.get('/api/game/items', async (req, res) => {
  try {
    const decoded = auth(req);
    const items = await GameItem.find({ user_id: decoded.id });
    const wallet = await GameCoin.findOne({ user_id: decoded.id });
    res.json({ items, coins: wallet?.coins || 0 });
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
});

// プレイヤー情報（ゲームアプリのログイン用）
app.get('/api/game/me', async (req, res) => {
  try {
    const decoded = auth(req);
    const user = await User.findOne({ id: decoded.id });
    const wallet = await GameCoin.findOne({ user_id: decoded.id });
    if (!wallet) await GameCoin.create({ user_id: decoded.id, coins: 100 });
    res.json({
      id: decoded.id,
      username: user?.display_name || user?.username,
      avatar: user?.avatar,
      coins: wallet?.coins ?? 100,
      avatarFrame: user?.avatar_frame,
    });
  } catch(e) { res.status(401).json({ error: '認証エラー' }); }
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
    <loc>https://line-killer-server.onrender.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.header('Content-Type', 'text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://line-killer-server.onrender.com/sitemap.xml');
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
// スケジュール一覧（/schedules エイリアス）
app.get('/api/rooms/:roomId/schedules', async (req, res) => {
  try {
    const decoded = auth(req);
    const msgs = await ScheduledMessage.find({ room_id: req.params.roomId, sender_id: decoded.id, sent: false }).sort({ send_at: 1 });
    res.json(msgs);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/rooms/:roomId/scheduled', async (req, res) => {
  try {
    const decoded = auth(req);
    const msgs = await ScheduledMessage.find({ room_id: req.params.roomId, sender_id: decoded.id, sent: false }).sort({ send_at: 1 });
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
    if (!poll) return res.status(404).json({ error: '投票が見つかりません' });
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
    const allowed = {};
    if (req.body.done !== undefined) allowed.done = !!req.body.done;
    if (req.body.title) allowed.title = String(req.body.title).slice(0, 200);
    if (req.body.due !== undefined) allowed.due = req.body.due ? new Date(req.body.due) : null;
    const task = await Task.findOneAndUpdate({ id: req.params.taskId }, allowed, { new: true });
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
