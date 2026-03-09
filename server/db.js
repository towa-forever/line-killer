const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://64fde7fe19fce4dbde3f94452ac4a619:Passtowa0806@17a.mongo.evennode.com:27031,17b.mongo.evennode.com:27031/64fde7fe19fce4dbde3f94452ac4a619?replicaSet=eu-17';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB接続成功'))
  .catch(err => console.error('MongoDB接続失敗', err));

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: String,
  display_name: { type: String, default: '' },
  bio: { type: String, default: '' },
  status: { type: String, default: '' },
  acquired_stamps: { type: [Number], default: [] },
  blocked_users: { type: [String], default: [] },
  muted_rooms: { type: [String], default: [] },
  bookmarked_messages: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
  creator_id: String,
  announcement: String
});

const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  icon: String,
  pinned_message_id: String,
  members: [String],
  created_at: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: String,
  sender_id: String,
  sender_name: String,
  content: String,
  type: { type: String, default: 'text' },
  file_data: mongoose.Schema.Types.Mixed,
  reply_to: mongoose.Schema.Types.Mixed,
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  expires_at: { type: Date, default: null },
  read_by: [String],
  reactions: [{ emoji: String, user_id: String }],
  forwarded: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const FriendSchema = new mongoose.Schema({
  user_id: String,
  friend_id: String
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
  avatar: String,
  content: String,
  image: String,
  likes: { type: [String], default: [] },
  comments: { type: [{ id: String, user_id: String, username: String, content: String, created_at: { type: Date, default: Date.now } }], default: [] },
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

module.exports = {
  User: mongoose.model('User', UserSchema),
  Note: mongoose.model('Note', NoteSchema),
  Room: mongoose.model('Room', RoomSchema),
  Message: mongoose.model('Message', MessageSchema),
  Friend: mongoose.model('Friend', FriendSchema),
  FriendRequest: mongoose.model('FriendRequest', FriendRequestSchema),
  Post: mongoose.model('Post', PostSchema),
  ScheduledMessage: mongoose.model('ScheduledMessage', ScheduledMessageSchema),
  Poll: mongoose.model('Poll', PollSchema),
  Task: mongoose.model('Task', TaskSchema),
};
