import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function GroupSettings({ room, currentUser, friendsList = [], onClose, onUpdate }) {
  const [name, setName]                   = useState(room?.name || '');
  const [saving, setSaving]               = useState(false);
  const [message, setMessage]             = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [inviteUrl, setInviteUrl]         = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // 友達招待
  const [showInvite, setShowInvite]       = useState(false);
  const [friendSearch, setFriendSearch]   = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [inviting, setInviting]           = useState(false);

  const roomId = room?.id || room?._id;
  const isAdmin = room?.creator_id === currentUser?.id;

  // すでにメンバーのIDセット
  const memberIds = new Set((room?.members || []).map(m => m.id || m._id || m));

  // 招待できる友達（未参加のみ）
  const invitableFriends = (friendsList || []).filter(f => {
    const fid = f.id || f._id;
    return !memberIds.has(fid);
  });

  const filteredFriends = friendSearch.trim()
    ? invitableFriends.filter(f => (f.display_name || f.username || '').toLowerCase().includes(friendSearch.toLowerCase()))
    : invitableFriends;

  const toggleFriend = useCallback((fid) => {
    setSelectedFriends(prev =>
      prev.includes(fid) ? prev.filter(id => id !== fid) : [...prev, fid]
    );
  }, []);

  const handleInvite = useCallback(async () => {
    if (selectedFriends.length === 0) return;
    setInviting(true);
    try {
      await axios.post(`/api/rooms/${roomId}/members`, { memberIds: selectedFriends });
      setMessage(`✅ ${selectedFriends.length}人を招待したで！`);
      setSelectedFriends([]);
      setShowInvite(false);
      setFriendSearch('');
    } catch (e) {
      setMessage('❌ 招待に失敗したで...' + (e.response?.data?.error || ''));
    } finally { setInviting(false); }
  }, [selectedFriends, roomId]);

  const generateInvite = useCallback(async () => {
    setInviteLoading(true);
    try {
      const res = await axios.post(`/api/rooms/${roomId}/invite`);
      setInviteUrl(res.data.inviteUrl);
    } catch { setMessage('招待リンクの生成に失敗しました'); }
    finally { setInviteLoading(false); }
  }, [roomId]);

  const copyInvite = useCallback(() => {
    navigator.clipboard.writeText(inviteUrl).then(() => setMessage('コピーしました！'));
  }, [inviteUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await axios.patch(`/api/rooms/${roomId}/name`, { name });
      onUpdate?.({ ...room, name });
      setMessage('✅ 更新しました');
    } catch { setMessage('❌ 更新に失敗しました'); }
    finally { setSaving(false); }
  }, [roomId, name, room, onUpdate]);

  const handleKick = useCallback((userId) => {
    setConfirmDialog({ text: 'このメンバーを退出させますか？', onOk: async () => {
      try {
        await axios.delete(`/api/rooms/${roomId}/members/${userId}`);
        onUpdate?.({ ...room, members: room.members.filter(m => (m.id || m._id || m) !== userId) });
      } catch { setMessage('❌ 操作に失敗しました'); }
    }});
  }, [roomId, room, onUpdate]);

  const handleLeave = useCallback(() => {
    setConfirmDialog({ text: 'このグループを退出しますか？', onOk: async () => {
      try {
        await axios.delete(`/api/rooms/${roomId}/members/${currentUser?.id}`);
        onClose?.();
      } catch { setMessage('❌ 退出に失敗しました'); }
    }});
  }, [roomId, currentUser, onClose]);

  return (
    <>
      {/* 確認ダイアログ */}
      {confirmDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background:'var(--surface)', borderRadius:20, padding:24, width:'100%', maxWidth:320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:20, textAlign:'center' }}>{confirmDialog.text}</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex:1, padding:12, borderRadius:12, background:'var(--surface2)', color:'var(--text)', border:'none', fontSize:15, cursor:'pointer' }}>キャンセル</button>
              <button onClick={() => { confirmDialog.onOk(); setConfirmDialog(null); }} style={{ flex:1, padding:12, borderRadius:12, background:'var(--danger)', color:'white', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* 友達招待モーダル */}
      {showInvite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => { setShowInvite(false); setSelectedFriends([]); setFriendSearch(''); }}>
          <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, maxHeight:'80dvh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>

            {/* ヘッダー */}
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:16 }}>👥 友達を招待</div>
                <button onClick={() => { setShowInvite(false); setSelectedFriends([]); }}
                  style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
              </div>
              <input
                className="form-input"
                value={friendSearch}
                onChange={e => setFriendSearch(e.target.value)}
                placeholder="名前で検索..."
                style={{ marginBottom:0 }}
                autoFocus
              />
            </div>

            {/* 友達リスト */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {filteredFriends.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:32, fontSize:14 }}>
                  {invitableFriends.length === 0 ? '招待できる友達がおらへんで' : '見つからんかった'}
                </div>
              ) : filteredFriends.map(f => {
                const fid = f.id || f._id;
                const selected = selectedFriends.includes(fid);
                const displayName = f.display_name || f.username;
                return (
                  <div key={fid} onClick={() => toggleFriend(fid)}
                    style={{
                      display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                      borderBottom:'1px solid var(--border)', cursor:'pointer',
                      background: selected ? 'rgba(59,130,246,0.06)' : 'transparent',
                      transition:'background 0.15s',
                    }}>
                    {/* アバター */}
                    <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, overflow:'hidden' }}>
                      {f.avatar ? <img src={f.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : displayName?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{displayName}</div>
                      {f.username !== displayName && <div style={{ fontSize:12, color:'var(--text2)' }}>@{f.username}</div>}
                    </div>
                    {/* チェックマーク */}
                    <div style={{
                      width:24, height:24, borderRadius:'50%', border:'2px solid', flexShrink:0,
                      borderColor: selected ? 'var(--primary)' : 'var(--border)',
                      background: selected ? 'var(--primary)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {selected && <span style={{ color:'white', fontSize:14, fontWeight:700 }}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 招待ボタン */}
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <button onClick={handleInvite} disabled={selectedFriends.length === 0 || inviting}
                style={{
                  width:'100%', padding:14, borderRadius:14, border:'none', fontWeight:700, fontSize:15, cursor:'pointer',
                  background: selectedFriends.length > 0 ? 'var(--primary)' : 'var(--border)',
                  color: selectedFriends.length > 0 ? 'white' : 'var(--text2)',
                  opacity: inviting ? 0.7 : 1,
                }}>
                {inviting ? '招待中...' : selectedFriends.length > 0 ? `👥 ${selectedFriends.length}人を招待する` : '友達を選んでな'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メイン：グループ設定 */}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight:'85vh', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>

          {/* ヘッダー */}
          <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontWeight:700, fontSize:16 }}>⚙️ グループ設定</div>
            <button onClick={onClose} style={{ fontSize:20, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
          </div>

          <div style={{ overflowY:'auto', flex:1, padding:16 }}>
            {message && (
              <div style={{ fontSize:13, color: message.startsWith('❌') ? 'var(--danger)' : 'var(--primary)', marginBottom:12, textAlign:'center' }}>
                {message}
              </div>
            )}

            {/* グループ名変更（管理者のみ）*/}
            {isAdmin && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:600 }}>グループ名</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input className="form-input" style={{ marginBottom:0, flex:1 }}
                    value={name} onChange={e => setName(e.target.value)} placeholder="グループ名" />
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? '...' : '保存'}
                  </button>
                </div>
              </div>
            )}

            {/* 友達招待ボタン */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:600 }}>メンバーを追加</div>
              <button onClick={() => setShowInvite(true)}
                style={{ width:'100%', padding:'11px 0', borderRadius:12, border:'1.5px dashed var(--primary)', background:'rgba(59,130,246,0.05)', color:'var(--primary)', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                👥 友達をグループに招待する
              </button>
            </div>

            {/* 招待リンク */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:600 }}>招待リンク</div>
              {inviteUrl ? (
                <div style={{ display:'flex', gap:8 }}>
                  <input className="form-input" readOnly value={inviteUrl} style={{ marginBottom:0, flex:1, fontSize:12 }} />
                  <button className="btn btn-primary" onClick={copyInvite} style={{ flexShrink:0 }}>コピー</button>
                </div>
              ) : (
                <button className="btn btn-secondary" onClick={generateInvite} disabled={inviteLoading} style={{ width:'100%' }}>
                  {inviteLoading ? '生成中...' : '🔗 招待リンクを生成'}
                </button>
              )}
            </div>

            {/* メンバー一覧 */}
            <div>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6, fontWeight:600 }}>メンバー（{room?.members?.length || 0}人）</div>
              {(room?.members || []).map(member => {
                const memberId = member.id || member._id || member;
                const isMe = memberId === currentUser?.id;
                const isCreator = memberId === room.creator_id;
                const displayName = member.display_name || member.username || memberId;
                return (
                  <div key={memberId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--primary)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, overflow:'hidden' }}>
                      {member.avatar ? <img src={member.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : displayName?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:14, fontWeight:600 }}>{displayName}</span>
                      {isCreator && <span style={{ fontSize:11, color:'var(--primary)', marginLeft:6 }}>👑 管理者</span>}
                      {isMe && <span style={{ fontSize:11, color:'var(--text2)', marginLeft:6 }}>（あなた）</span>}
                    </div>
                    {isAdmin && !isMe && !isCreator && (
                      <button onClick={() => handleKick(memberId)}
                        style={{ padding:'4px 12px', borderRadius:16, fontSize:12, fontWeight:600, background:'#e74c3c', color:'white', border:'none', cursor:'pointer' }}>
                        退出
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* フッター */}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', gap:8 }}>
            {!isAdmin && (
              <button className="btn btn-danger" onClick={handleLeave} style={{ flex:1 }}>グループを退出</button>
            )}
            <button className="btn btn-secondary" onClick={onClose} style={{ flex:1 }}>閉じる</button>
          </div>
        </div>
      </div>
    </>
  );
}
