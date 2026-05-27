import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fff', color: '#c2185b', height: '100vh', fontFamily: 'sans-serif' }}>
          <h2>Oops, hubo un error grave en la aplicación (Pantalla Blanca):</h2>
          <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px', overflowX: 'auto', color: '#333' }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px', overflowX: 'auto', color: '#333', marginTop: '10px', fontSize: '12px' }}>
            {this.state.error?.stack}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '10px 20px', marginTop: '20px', background: '#c2185b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Recargar
          </button>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
