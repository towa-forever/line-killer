import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://line-killer-server.onrender.com';

export default function StampShop({ currentUser }) {
  const [stamps, setStamps] = useState([]);
  const [myStamps, setMyStamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('shop');

  const fetchStamps = useCallback(async () => {
    try {
      const [shopRes, myRes] = await Promise.all([
        axios.get('/api/stamps'),
        axios.get('/api/stamps/mysets'),
      ]);
      setStamps(shopRes.data);
      setMyStamps(myRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStamps(); }, [fetchStamps]);

  const handlePurchase = async (stampId) => {
    setPurchasing(stampId);
    try {
      await axios.post(`/api/stamps/purchase/${stampId}`);
      setMessage('購入しました！');
      fetchStamps();
    } catch (err) {
      setMessage(err.response?.data?.message || '購入に失敗しました');
    } finally { setPurchasing(null); }
  };

  const isOwned = (stampId) => myStamps.some((s) => s._id === stampId);

  if (loading) return <div className="page"><div className="empty-state">読み込み中...</div></div>;

  return (
    <div className="page">
      <div className="page-header">スタンプショップ</div>
      <div className="friends-tabs">
        <button className={`friends-tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>ショップ</button>
        <button className={`friends-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>所持中 ({myStamps.length})</button>
      </div>

      {message && <div className="friends-message" onClick={() => setMessage('')}>{message} ✕</div>}

      {tab === 'shop' && (
        <div className="stamp-grid">
          {stamps.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>スタンプがありません</div>
          ) : (
            stamps.map((stamp) => {
              const owned = isOwned(stamp._id);
              return (
                <div key={stamp._id} className="stamp-card">
                  <img src={`${SERVER_URL}${stamp.imageUrl}`} alt={stamp.name} className="stamp-shop-img" />
                  <div className="stamp-name">{stamp.name}</div>
                  <div className="stamp-price">{stamp.price === 0 ? '無料' : `${stamp.price} コイン`}</div>
                  {owned ? (
                    <span className="stamp-owned">✓ 所持済み</span>
                  ) : (
                    <button className="btn btn-primary"
                      style={{ width: '100%', padding: '6px', fontSize: 12, marginTop: 6 }}
                      onClick={() => handlePurchase(stamp._id)}
                      disabled={purchasing === stamp._id}>
                      {purchasing === stamp._id ? '処理中...' : '購入'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="stamp-grid">
          {myStamps.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>スタンプを購入してトークで使おう！</div>
          ) : (
            myStamps.map((stamp) => (
              <div key={stamp._id} className="stamp-card">
                <img src={`${SERVER_URL}${stamp.imageUrl}`} alt={stamp.name} className="stamp-shop-img" />
                <div className="stamp-name">{stamp.name}</div>
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        .stamp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 10px; }
        .stamp-card { background: var(--surface); border-radius: 12px; padding: 12px 10px; text-align: center; box-shadow: var(--shadow); }
        .stamp-shop-img { width: 80px; height: 80px; object-fit: contain; }
        .stamp-name { font-size: 12px; font-weight: 600; margin-top: 6px; color: var(--text); }
        .stamp-price { font-size: 11px; color: var(--text2); margin-top: 2px; }
        .stamp-owned { font-size: 11px; color: var(--primary); font-weight: 600; margin-top: 6px; display: block; }
        .friends-tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); }
        .friends-tab { flex: 1; padding: 10px; font-size: 13px; color: var(--text2); border-bottom: 2px solid transparent; transition: color 0.2s; }
        .friends-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
        .friends-message { background: #e8f5e9; color: #2e7d32; padding: 10px 16px; font-size: 13px; cursor: pointer; }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text2); font-size: 14px; }
      `}</style>
    </div>
  );
}
