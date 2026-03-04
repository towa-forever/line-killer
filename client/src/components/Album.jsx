import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://nexus.ap-1.evennode.com';

export default function Album({ currentUser }) {
  const [photos, setPhotos] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [photoRes, roomRes] = await Promise.all([
        axios.get('/api/album'),
        axios.get('/api/rooms'),
      ]);
      setPhotos(photoRes.data);
      setRooms(roomRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredPhotos = selectedRoom === 'all'
    ? photos
    : photos.filter((p) => p.roomId === selectedRoom);

  const getRoomName = (room) => {
    if (!room) return '不明';
    if (room.name) return room.name;
    const others = room.members?.filter((m) => m._id !== currentUser._id);
    return others?.map((m) => m.displayName).join(', ') || '不明';
  };

  if (loading) return <div className="page"><div className="empty-state">読み込み中...</div></div>;

  return (
    <div className="page">
      <div className="page-header">アルバム</div>

      <div className="album-rooms">
        <button className={`album-room-btn ${selectedRoom === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedRoom('all')}>
          全て ({photos.length})
        </button>
        {rooms.map((room) => {
          const count = photos.filter((p) => p.roomId === room._id).length;
          if (count === 0) return null;
          return (
            <button key={room._id}
              className={`album-room-btn ${selectedRoom === room._id ? 'active' : ''}`}
              onClick={() => setSelectedRoom(room._id)}>
              {getRoomName(room)} ({count})
            </button>
          );
        })}
      </div>

      {filteredPhotos.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <p>写真がありません</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>トークで画像を送るとここに表示されます</p>
        </div>
      ) : (
        <div className="album-grid">
          {filteredPhotos.map((photo, i) => (
            <div key={photo._id || i} className="album-item" onClick={() => setLightbox(photo)}>
              <img src={`${SERVER_URL}${photo.fileUrl || photo.url}`} alt=""
                className="album-thumb" loading="lazy" />
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
            <img src={`${SERVER_URL}${lightbox.fileUrl || lightbox.url}`} alt="" className="lightbox-img" />
            <div className="lightbox-info">
              <span>{lightbox.sender?.displayName || '不明'}</span>
              <span>{new Date(lightbox.createdAt).toLocaleDateString('ja-JP')}</span>
            </div>
            <a href={`${SERVER_URL}${lightbox.fileUrl || lightbox.url}`} download
              target="_blank" rel="noreferrer" className="btn btn-primary"
              style={{ width: '100%', textAlign: 'center', marginTop: 10, display: 'block', padding: '8px' }}
              onClick={(e) => e.stopPropagation()}>
              ⬇ ダウンロード
            </a>
          </div>
        </div>
      )}

      <style>{`
        .album-rooms { display: flex; gap: 8px; padding: 10px; overflow-x: auto; background: var(--surface); border-bottom: 1px solid var(--border); }
        .album-room-btn { flex-shrink: 0; padding: 5px 12px; border-radius: 16px; font-size: 12px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); white-space: nowrap; }
        .album-room-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        .album-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; }
        .album-item { aspect-ratio: 1; overflow: hidden; cursor: pointer; }
        .album-thumb { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
        .album-thumb:hover { transform: scale(1.05); }
        .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
        .lightbox-content { background: var(--surface); border-radius: 16px; padding: 16px; max-width: 500px; width: 100%; position: relative; }
        .lightbox-close { position: absolute; top: 10px; right: 12px; font-size: 20px; color: var(--text2); }
        .lightbox-img { width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; }
        .lightbox-info { display: flex; justify-content: space-between; font-size: 12px; color: var(--text2); margin-top: 8px; }
        .empty-state { text-align: center; padding: 60px 20px; color: var(--text2); font-size: 14px; }
      `}</style>
    </div>
  );
}
