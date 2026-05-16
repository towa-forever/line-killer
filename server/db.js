const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGO_URI環境変数が設定されてへん！'); process.exit(1); }

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
})
  .then(() => console.log('MongoDB接続成功'))
  .catch(err => { console.error('MongoDB接続失敗', err); process.exit(1); });

mongoose.connection.on('disconnected', () => console.warn('MongoDB切断 - 自動再接続を試みます'));
mongoose.connection.on('error', err => console.error('MongoDB接続エラー:', err));

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: String,
  cover_image: { type: String, default: '' }, // プロフィール背景画像
  display_name: { type: String, default: '' },
  is_official: { type: Boolean, default: false }, // 公式アカウント
  last_seen: { type: Date, default: Date.now },
  show_online: { type: Boolean, default: true },
  parent_account_id: { type: String, default: null }, // サブアカの場合、親アカウントのid
  sub_accounts: [{ type: String }], // 親アカの場合、サブアカのid一覧
  official_category: { type: String, default: '' }, // カテゴリ(news/shop/service等)
  official_email: { type: String, default: '' }, // 申請メールアドレス
  official_verified: { type: Boolean, default: false }, // 管理者承認済み
  bio: { type: String, default: '' },
  status: { type: String, default: '' },
  auto_status_rules: { type: [{ fromHour: Number, toHour: Number, status: String }], default: [] },
  pinned_rooms: { type: [String], default: [] }, // ピン留めしたルームID
  avatar_frame: { type: String, default: 'none' },
  sound_theme: { type: String, default: 'default' },
  acquired_stamps: { type: [Number], default: [] },
  blocked_users: { type: [String], default: [] },
  muted_rooms: { type: [String], default: [] },
  bookmarked_messages: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
  // パスワードリセット用
  recovery_email: { type: String, default: '' }, // パスワードリセット用メールアドレス
  secret_question: { type: String, default: '' },
  secret_answer: { type: String, default: '' }, // bcryptハッシュ
  // 2段階認証
  pin_code: { type: String, default: '' }, // bcryptハッシュ
  pin_enabled: { type: Boolean, default: false },
  // ログイン履歴（最新10件）ip・ua・日時を記録
  login_history: { type: [{ ip: String, ua: String, at: Date }], default: [] },
  // 下書き保存 { roomId: content }
  drafts: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 後で読む（メッセージIDリスト）
  read_later: { type: [String], default: [] },
  // ギフト履歴
  gift_sent: { type: Number, default: 0 },
  gift_received: { type: Number, default: 0 },
  coins: { type: Number, default: 100 }, // コイン残高（初期100枚）
  badges: { type: [String], default: [] }, // 獲得バッジID一覧
  message_count: { type: Number, default: 0 }, // 送信メッセージ数
  login_count: { type: Number, default: 0 }, // ログイン回数
  last_login_date: { type: String, default: null }, // YYYY-MM-DD形式
  login_streak: { type: Number, default: 0 }, // 連続ログイン日数
  current_activity: { type: String, default: null }, // 'チャット中'|'通話中'|'ゲーム中'など
  folders: { type: Array, default: [] }, // トークフォルダ
  font_size: { type: String, default: 'medium' }, // 'small'|'medium'|'large'
  social_links: { type: Map, of: String, default: {} }, // SNSリンク集
  theme: {
    primaryColor: { type: String, default: null },
    bgColor: { type: String, default: null },
    fontFamily: { type: String, default: null }
  },
  notification_sounds: { type: Map, of: String, default: {} },
});

const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  icon: String,
  pinned_message_id: String,
  members: [String],
  created_at: { type: Date, default: Date.now },
  creator_id: String,
  announcement: String,
  invite_code: { type: String, unique: true, sparse: true }, // グループ招待コード
  invite_enabled: { type: Boolean, default: true },
  theme_color: { type: String, default: '' }, // チャットテーマカラー
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  sender_id: String,
  sender_name: String,
  sender_avatar: { type: String, default: null },
  content: String,
  type: { type: String, default: 'text' },
  file_data: mongoose.Schema.Types.Mixed,
  reply_to: mongoose.Schema.Types.Mixed,
  edited: { type: Boolean, default: false },
  edit_history: { type: [{ content: String, edited_at: Date }], default: [] },
  decoration: { type: String, default: null }, // JSON文字列 { bold, color, size }
  deleted: { type: Boolean, default: false },
  expires_at: { type: Date, default: null },
  read_by: [String],
  reactions: [{ emoji: String, user_id: String }],
  forwarded: { type: Boolean, default: false },
  stamp_label: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
});

const ThreadMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  parent_id: { type: String, required: true }, // 親メッセージID
  room_id: { type: String, required: true },
  sender_id: String,
  sender_name: String,
  sender_avatar: { type: String, default: null },
  content: String,
  created_at: { type: Date, default: Date.now }
});

const FriendSchema = new mongoose.Schema({
  user_id: String,
  friend_id: String,
  created_at: { type: Date, default: Date.now }
});

const FriendRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  from_id: String,
  from_name: String,
  to_id: String,
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  username: String,
  display_name: String,
  avatar: String,
  content: String,
  image: String,
  video: String,
  type: { type: String, default: 'post' },
  repost_of: { type: String, default: null },
  repost_user: { type: Object, default: null },
  likes: { type: [String], default: [] },
  reposts: { type: [String], default: [] },
  comments: { type: [{ id: String, user_id: String, username: String, display_name: String, avatar: String, content: String, created_at: { type: Date, default: Date.now } }], default: [] },
  created_at: { type: Date, default: Date.now }
});

const NewsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: String,
  image: String,
  url: String,
  source: { type: String, default: 'manual' },
  category: { type: String, default: '一般' },
  published_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// 公式アカウント（ボット）スキーマ
const OfficialAccountSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  avatar: { type: String, default: null },
  category: { type: String, default: 'その他' },
  followers: { type: [String], default: [] },
  created_by: String,
  created_at: { type: Date, default: Date.now }
});

const OfficialRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  username: String,
  reason: String,
  category: String,
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

const NoteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: { type: String, required: true },
  user_id: { type: String },
  content: { type: String, default: '' },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String },
});


const ScheduledMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  sender_id: String,
  sender_name: String,
  sender_avatar: { type: String, default: null },
  content: String,
  send_at: { type: Date, required: true },
  sent: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const PollSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  creator_id: String,
  question: String,
  options: [{ id: String, text: String, voters: [String] }],
  multi: { type: Boolean, default: false },
  allow_free_text: { type: Boolean, default: false },
  free_text_answers: [{ user_id: String, username: String, text: String, created_at: { type: Date, default: Date.now } }],
  closed: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const TaskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  creator_id: String,
  title: String,
  assignee_id: String,
  assignee_name: String,
  due: Date,
  done: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const EventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  creator_id: String,
  title: String,
  description: { type: String, default: '' },
  start_at: Date,
  end_at: Date,
  attendees: [{ user_id: String, status: { type: String, default: 'pending' } }],
  created_at: { type: Date, default: Date.now }
});

const FavoriteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  message_id: String,
  room_id: String,
  content: String,
  sender_name: String,
  created_at: { type: Date, default: Date.now }
});

const GameScoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  username: String,
  avatar: String,
  game: String,       // 'puzzle' | 'card' | 'quiz' | 'runner' | 'match'
  score: Number,
  coins_earned: { type: Number, default: 0 },
  played_at: { type: Date, default: Date.now }
});

const GameCoinSchema = new mongoose.Schema({
  user_id: { type: String, unique: true },
  coins: { type: Number, default: 100 },  // 初期コイン100枚
  updated_at: { type: Date, default: Date.now }
});

const GameItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  item_type: String,  // 'stamp_set' | 'avatar_frame' | 'theme'
  item_id: String,
  purchased_at: { type: Date, default: Date.now }
});

const StorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  user_name: String,
  user_avatar: String,
  type: { type: String, default: 'image' }, // image | video | text
  url: String,
  text: String,
  expires_at: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000) },
  created_at: { type: Date, default: Date.now },
});

// ===== パフォーマンス向上のためのインデックス =====
MessageSchema.index({ room_id: 1, created_at: -1 }); // ルームのメッセージ取得（最多クエリ）
MessageSchema.index({ room_id: 1, deleted: 1 });      // 未読カウント・検索でdeleted条件と組み合わせ
MessageSchema.index({ sender_id: 1 });                // 統計・検索
MessageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // 期限切れメッセージを自動削除
MessageSchema.index({ type: 1, room_id: 1 });         // 画像・動画一覧取得
MessageSchema.index({ content: 'text' });              // 全文検索（グローバル検索高速化）
RoomSchema.index({ members: 1 });                     // ユーザーのルーム一覧取得
FriendSchema.index({ user_id: 1 });                   // 友達一覧取得
FriendSchema.index({ user_id: 1, friend_id: 1 }, { unique: true }); // 重複防止
FriendRequestSchema.index({ to_id: 1, status: 1 });  // 申請一覧取得
FriendRequestSchema.index({ from_id: 1, to_id: 1 }); // 重複申請防止
TaskSchema.index({ room_id: 1, done: 1 });            // ルームのタスク取得
EventSchema.index({ room_id: 1, start_at: 1 });       // ルームのイベント取得
ScheduledMessageSchema.index({ send_at: 1, sent: 1 }); // スケジュール送信チェック
StorySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // 期限切れストーリーを自動削除
GameScoreSchema.index({ game: 1, score: -1 });         // ゲームランキング取得
FavoriteSchema.index({ user_id: 1 });                  // お気に入り一覧取得
// PollSchema id index は unique:true で定義済みのため省略
// username は UserSchema で unique:true 指定済みのため個別index不要

const PushSubscriptionSchema = new mongoose.Schema({
  user_id: { type: String, required: true, unique: true },
  subscription: { type: mongoose.Schema.Types.Mixed, required: true },
  updated_at: { type: Date, default: Date.now },
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  PushSubscription: mongoose.model('PushSubscription', PushSubscriptionSchema),
  Note: mongoose.model('Note', NoteSchema),
  Room: mongoose.model('Room', RoomSchema),
  Message: mongoose.model('Message', MessageSchema),
  Friend: mongoose.model('Friend', FriendSchema),
  FriendRequest: mongoose.model('FriendRequest', FriendRequestSchema),
  Post: mongoose.model('Post', PostSchema),
  News: mongoose.model('News', NewsSchema),
  OfficialRequest: mongoose.model('OfficialRequest', OfficialRequestSchema),
  OfficialAccount: mongoose.model('OfficialAccount', OfficialAccountSchema),
  ScheduledMessage: mongoose.model('ScheduledMessage', ScheduledMessageSchema),
  Poll: mongoose.model('Poll', PollSchema),
  Task: mongoose.model('Task', TaskSchema),
  Event: mongoose.model('Event', EventSchema),
  Story: mongoose.model('Story', StorySchema),
  GameScore: mongoose.model('GameScore', GameScoreSchema),
  GameCoin: mongoose.model('GameCoin', GameCoinSchema),
  GameItem: mongoose.model('GameItem', GameItemSchema),
  Favorite: mongoose.model('Favorite', FavoriteSchema),
  ThreadMessage: mongoose.model('ThreadMessage', ThreadMessageSchema),
};
