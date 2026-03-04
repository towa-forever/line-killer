const mongoose = require('mongoose');
const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URL;
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB接続成功'))
  .catch(err => console.error('MongoDB接続失敗', err));

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: String,
  status: { type: String, default: '' },
  acquired_stamps: { type: [Number], default: [] },
  blocked_users: { type: [String], default: [] },
  muted_rooms: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now }
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
  read_by: [String],
  reactions: [{ emoji: String, user_id: String }],
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
  comments: { type: [{
    id: String,
    user_id: String,
    username: String,
    content: String,
    created_at: { type: Date, default: Date.now }
  }], default: [] },
  created_at: { type: Date, default: Date.now }
});
module.exports = {
  User: mongoose.model('User', UserSchema),
  Room: mongoose.model('Room', RoomSchema),
  Message: mongoose.model('Message', MessageSchema),
  Friend: mongoose.model('Friend', FriendSchema),
  FriendRequest: mongoose.model('FriendRequest', FriendRequestSchema),
  Post: mongoose.model('Post', PostSchema)
};
