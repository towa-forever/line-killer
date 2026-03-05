import React from 'react';
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:20,background:'#fee',color:'#c00',fontSize:13,wordBreak:'break-all'}}>
        <b>エラー:</b><br/>{this.state.error.toString()}<br/><br/>
        <b>スタック:</b><br/>{this.state.error.stack}
      </div>
    );
    return this.props.children;
  }
}
