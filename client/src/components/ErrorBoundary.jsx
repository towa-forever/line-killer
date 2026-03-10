import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(e) { return { error: e }; }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
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
            onClick={() => this.setState({ error: null, errorInfo: null })}
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
