import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null, isChunkError: false };
  }

  static getDerivedStateFromError(e) {
    // ChunkLoadErrorのみ（条件を厳密に）
    const isChunkError = e?.name === 'ChunkLoadError';
    return { error: e, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error.message);

    // ChunkLoadErrorのみリロード（他のエラーは絶対リロードしない）
    if (error?.name === 'ChunkLoadError') {
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      if (!lastReload || Date.now() - parseInt(lastReload) > 10000) {
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
          height: '100%', minHeight: 120, padding: 24, gap: 8, background: 'var(--bg, #f8f8f8)'
        }}>
          <div style={{ fontSize: 36 }}>😵</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text, #1a1a2a)', textAlign: 'center' }}>
            エラーが発生したで
          </div>
          <div style={{ fontSize: 11, color: '#888', maxWidth: 280, wordBreak: 'break-all', textAlign: 'center' }}>
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
