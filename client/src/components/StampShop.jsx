import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function StampShop({ currentUser, acquiredStampIds = [], onAcquire }) {
  const [stamps, setStamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acquiring, setAcquiring] = useState(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('shop');

  useEffect(() => {
    axios.get('/api/stamps')
      .then(res => setStamps(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleAcquire = async (setId) => {
    setAcquiring(setId);
    try {
      await axios.post('/api/stamps/acquire', { setId });
      setMessage('スタンプを追加しました！');
      onAcquire?.(setId);
    } catch (err) {
      setMessage(err.response?.data?.error || '取得に失敗しました');
    } finally { setAcquiring(null); }
  };

  const isOwned = (setId) => acquiredStampIds.map(id => String(id)).includes(String(setId));
  const myStampSets = stamps.filter((s) => isOwned(s.id));

  if (loading) return <div className="page"><div className="empty-state">読み込み中...</div></div>;

  return (
    <div className="page">
      <div className="page-header">スタンプショップ</div>
      <div className="friends-tabs">
        <button className={`friends-tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>ショップ</button>
        <button className={`friends-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>所持中 ({myStampSets.length})</button>
      </div>
      {message && <div className="friends-message" onClick={() => setMessage('')}>{message} ✕</div>}
      {tab === 'shop' && (
        <div className="stamp-grid">
          {stamps.map((stampSet) => {
            const owned = isOwned(stampSet.id);
            return (
              <div key={stampSet.id} className="stamp-card">
                <div className="stamp-icon">{stampSet.icon}</div>
                <div className="stamp-name">{stampSet.name}</div>
                <div className="stamp-preview">
                  {stampSet.stamps.slice(0, 4).map((s, i) => (
                    <span key={i} style={{ fontSize: 18 }}>{s.emoji}</span>
                  ))}
                </div>
                <div className="stamp-price">無料</div>
                {owned ? (
                  <span className="stamp-owned">✓ 所持済み</span>
                ) : (
                  <button className="btn btn-primary"
                    style={{ width: '100%', padding: '6px', fontSize: 12, marginTop: 6 }}
                    onClick={() => handleAcquire(stampSet.id)}
                    disabled={acquiring === stampSet.id}>
                    {acquiring === stampSet.id ? '処理中...' : '追加する'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === 'mine' && (
        <div className="stamp-grid">
          {myStampSets.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>スタンプを追加してトークで使おう！</div>
          ) : (
            myStampSets.map((stampSet) => (
              <div key={stampSet.id} className="stamp-card">
                <div className="stamp-icon">{stampSet.icon}</div>
                <div className="stamp-name">{stampSet.name}</div>
                <div className="stamp-preview">
                  {stampSet.stamps.slice(0, 4).map((s, i) => (
                    <span key={i} style={{ fontSize: 18 }}>{s.emoji}</span>
                  ))}
                </div>
                <span className="stamp-owned">✓ 所持済み</span>
              </div>
            ))
          )}
        </div>
      )}
      <style>{`
        .stamp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 10px; }
        .stamp-card { background: var(--surface); border-radius: 12px; padding: 12px 10px; text-align: center; box-shadow: var(--shadow); }
        .stamp-icon { font-size: 40px; margin-bottom: 6px; }
        .stamp-preview { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; margin: 6px 0; }
        .stamp-name { font-size: 12px; font-weight: 600; margin-top: 4px; color: var(--text); }
        .stamp-price { font-size: 11px; color: var(--text2); margin-top: 2px; }
        .stamp-owned { font-size: 11px; color: var(--primary); font-weight: 600; margin-top: 6px; display: block; }
        .friends-tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); }
        .friends-tab { flex: 1; padding: 10px; font-size: 13px; color: var(--text2); border-bottom: 2px solid transparent; }
        .friends-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
        .friends-message { background: #e8f5e9; color: #2e7d32; padding: 10px 16px; font-size: 13px; cursor: pointer; }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text2); font-size: 14px; }
      `}</style>
    </div>
  );
}
