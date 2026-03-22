import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null, isChunkError: false };
  }

  static getDerivedStateFromError(e) {
    // ChunkLoadError（デプロイ後の古いchunk）は自動リロード
    const isChunkError = e?.name === 'ChunkLoadError' || e?.message?.includes('Loading chunk') || e?.message?.includes('chunk');
    return { error: e, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);

    // ChunkLoadErrorはページをリロードして解決
    if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk')) {
      // 無限ループ防止: 直近5秒以内にリロードしてたら止める
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      if (!lastReload || Date.now() - parseInt(lastReload) > 5000) {
        sessionStorage.setItem('last_chunk_reload', Date.now().toString());
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.isChunkError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', minHeight: 200, padding: 24, gap: 12, background: 'var(--bg, #f8f8f8)'
        }}>
          <div style={{ fontSize: 48 }}>🔄</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text, #1a1a2a)' }}>
            アップデートがあるで
          </div>
          <div style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>
            新しいバージョンに更新しています...
          </div>
          <button
            onClick={() => { sessionStorage.setItem('last_chunk_reload', Date.now().toString()); window.location.reload(); }}
            style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#06c755', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            今すぐ更新
          </button>
        </div>
      );
    }

    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', minHeight: 200, padding: 24, gap: 12, background: 'var(--bg, #f8f8f8)'
        }}>
          <div style={{ fontSize: 48 }}>😵</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text, #1a1a2a)' }}>
            ここでエラーが発生したで
          </div>
          <div style={{ fontSize: 12, color: '#888', maxWidth: 300, wordBreak: 'break-all', textAlign: 'center' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => this.setState({ error: null, errorInfo: null, isChunkError: false })}
            style={{ padding: '8px 20px', borderRadius: 12, border: 'none', background: '#06c755', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            もう一度試す
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
