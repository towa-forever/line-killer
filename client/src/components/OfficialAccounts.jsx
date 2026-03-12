import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CATEGORIES = [
  { id: 'news',    label: '📰 ニュース' },
  { id: 'shop',    label: '🛍️ ショップ' },
  { id: 'service', label: '⚙️ サービス' },
  { id: 'creator', label: '🎨 クリエイター' },
  { id: 'school',  label: '🏫 学校・教育' },
  { id: 'other',   label: '📌 その他' },
];

export default function OfficialAccounts({ currentUser }) {
  const [tab, setTab] = useState('list'); // list | apply | mypage
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState({});
  const [message, setMessage] = useState('');
  // 申請フォーム
  const [applyCategory, setApplyCategory] = useState('');
  const [applyDesc, setApplyDesc] = useState('');
  const [applyName, setApplyName] = useState('');
  const [applying, setApplying] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  useEffect(() => {
    axios.get('/api/official-accounts')
      .then(r => setAccounts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const follow = async (id) => {
    try {
      setFollowing(p => ({ ...p, [id]: true }));
      const r = await axios.post(`/api/official-accounts/${id}/follow`);
      setMessage(r.data.message || 'フォローしました');
    } catch (e) {
      setMessage(e.response?.data?.error || 'エラー');
      setFollowing(p => ({ ...p, [id]: false }));
    }
  };

  const applyOfficial = async () => {
    if (!applyName.trim()) { setMessage('公式アカウント名を入力してください'); return; }
    if (!applyCategory) { setMessage('カテゴリを選択してください'); return; }
    setApplying(true);
    try {
      const r = await axios.post('/api/official-accounts/apply', {
        category: applyCategory, description: applyDesc,
        officialName: applyName.trim(),
      });
      setMessage(r.data.message);
      setTab('list');
    } catch (e) { setMessage(e.response?.data?.error || '申請に失敗しました'); }
    finally { setApplying(false); }
  };

  const filtered = filterCat === 'all' ? accounts : accounts.filter(a => a.official_category === filterCat);
  const isOfficialUser = currentUser?.is_official;

  return (
    <div className="page" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      <div className="page-header">公式アカウント</div>

      {/* タブ */}
      <div style={{ display:'flex', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        {[
          { id:'list',   label:'📋 一覧' },
          { id:'apply',  label:'📝 申請' },
          ...(isOfficialUser ? [{ id:'mypage', label:'⭐ 管理' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:'10px 0', fontSize:13, background:'none', border:'none', cursor:'pointer',
              color: tab===t.id ? 'var(--primary)' : 'var(--text2)',
              borderBottom: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab===t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <div onClick={() => setMessage('')}
          style={{ background:'#e8f5e9', color:'#2e7d32', padding:'10px 16px', fontSize:13, cursor:'pointer' }}>
          {message} ✕
        </div>
      )}

      {/* 一覧タブ */}
      {tab === 'list' && (
        <div>
          {/* カテゴリフィルター */}
          <div style={{ display:'flex', gap:6, padding:'10px 12px', overflowX:'auto' }}>
            <button onClick={() => setFilterCat('all')}
              style={{ padding:'5px 14px', borderRadius:20, fontSize:12, border:'1.5px solid', whiteSpace:'nowrap', cursor:'pointer',
                borderColor: filterCat==='all' ? 'var(--primary)' : 'var(--border)',
                background: filterCat==='all' ? 'var(--primary)' : 'var(--surface2)',
                color: filterCat==='all' ? 'white' : 'var(--text)' }}>
              すべて
            </button>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setFilterCat(cat.id)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:12, border:'1.5px solid', whiteSpace:'nowrap', cursor:'pointer',
                  borderColor: filterCat===cat.id ? 'var(--primary)' : 'var(--border)',
                  background: filterCat===cat.id ? 'var(--primary)' : 'var(--surface2)',
                  color: filterCat===cat.id ? 'white' : 'var(--text)' }}>
                {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>
              <div style={{ fontSize:40, marginBottom:8 }}>📭</div>
              <div>公式アカウントはまだありません</div>
              <div style={{ fontSize:12, marginTop:4 }}>申請タブから登録できます</div>
            </div>
          ) : filtered.map(acc => (
            <div key={acc.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
              <div style={{ width:50, height:50, borderRadius:12, background:'var(--primary)', color:'white',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                {acc.avatar
                  ? <img src={acc.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : (acc.display_name?.[0] || '?')}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontWeight:700, fontSize:15 }}>{acc.display_name || acc.username}</span>
                  {acc.official_verified && <span style={{ fontSize:11, background:'#1da1f2', color:'white', borderRadius:10, padding:'1px 6px' }}>✓ 公式</span>}
                </div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>{CATEGORIES.find(c=>c.id===acc.official_category)?.label || ''}</div>
                {acc.bio && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{acc.bio}</div>}
              </div>
              <button onClick={() => follow(acc.id)} disabled={following[acc.id]}
                style={{ padding:'7px 16px', borderRadius:20, fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
                  background: following[acc.id] ? 'var(--surface2)' : 'var(--primary)',
                  color: following[acc.id] ? 'var(--text2)' : 'white' }}>
                {following[acc.id] ? '✓ 済み' : 'フォロー'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 申請タブ */}
      {tab === 'apply' && (
        <div style={{ padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:16, marginBottom:16, fontSize:13, color:'var(--text2)', lineHeight:1.7 }}>
            <strong style={{ color:'var(--text)' }}>📋 公式アカウントとは？</strong><br/>
            企業・店舗・クリエイターなどが運営する公式アカウントです。<br/>
            申請後、審査（1〜3営業日）が完了するとバッジが付与されます。
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>公式アカウント名 <span style={{ color:'red' }}>*</span></div>
            <input className="form-input" placeholder="例: LINE Killer公式、〇〇ショップ など"
              value={applyName} onChange={e => setApplyName(e.target.value)} style={{ marginBottom:0 }} maxLength={30} />
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>チャットや公式一覧に表示される名前です（30文字以内）</div>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>カテゴリ <span style={{ color:'red' }}>*</span></div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setApplyCategory(cat.id)}
                  style={{ padding:'7px 14px', borderRadius:20, fontSize:12, border:'1.5px solid', cursor:'pointer',
                    borderColor: applyCategory===cat.id ? 'var(--primary)' : 'var(--border)',
                    background: applyCategory===cat.id ? 'var(--primary)' : 'var(--surface2)',
                    color: applyCategory===cat.id ? 'white' : 'var(--text)' }}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>アカウント説明（任意）</div>
            <textarea className="form-input" rows={4} placeholder="どんなアカウントか説明してください..."
              value={applyDesc} onChange={e => setApplyDesc(e.target.value)} style={{ resize:'none', marginBottom:0 }} />
          </div>

          <button className="btn btn-primary" style={{ width:'100%' }} onClick={applyOfficial} disabled={applying}>
            {applying ? '申請中...' : '📝 申請する'}
          </button>
          <div style={{ fontSize:11, color:'var(--text2)', textAlign:'center', marginTop:8 }}>
            審査後にアカウントにバッジが付与されます
          </div>
        </div>
      )}

      {/* 管理タブ（公式アカウントのみ） */}
      {tab === 'mypage' && isOfficialUser && (
        <div style={{ padding:16 }}>
          <div style={{ background:'linear-gradient(135deg,var(--primary),#6c3483)', borderRadius:16, padding:20, color:'white', textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:32, marginBottom:6 }}>⭐</div>
            <div style={{ fontWeight:800, fontSize:18 }}>公式アカウント</div>
            <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>@{currentUser.username}</div>
          </div>
          <div style={{ fontSize:14, color:'var(--text2)', textAlign:'center' }}>
            プロフィールを編集して情報を更新できます
          </div>
        </div>
      )}
    </div>
  );
}
