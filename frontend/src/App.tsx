import React, { useState, useEffect } from 'react';
import { api, connectWS } from './api';
import Dashboard from './components/Dashboard';
import StrategyPanel from './components/StrategyPanel';
import BacktestPanel from './components/BacktestPanel';
import TradeLog from './components/TradeLog';
import MarketView from './components/MarketView';

type Tab = 'dashboard' | 'strategies' | 'backtest' | 'trades' | 'market';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [account, setAccount] = useState<any>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    loadStatus();

    const ws = connectWS((data) => {
      setWsConnected(true);
      if (data.event === 'account_update' && data.state) {
        setAccount(data.state);
      }
      if (data.event === 'engine_started') setEngineRunning(true);
      if (data.event === 'engine_stopped') setEngineRunning(false);
    });

    return () => ws.close();
  }, []);

  async function loadStatus() {
    const status = await api.getEngineStatus();
    setEngineRunning(status.is_running);
    setAccount(status.account);
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'dashboard', label: '概览', icon: '📊' },
    { key: 'strategies', label: '策略', icon: '⚡' },
    { key: 'backtest', label: '回测', icon: '🔬' },
    { key: 'trades', label: '交易', icon: '💹' },
    { key: 'market', label: '行情', icon: '📈' },
  ];

  return (
    <div className="app">
      {/* 顶部状态栏 */}
      <header className="topbar">
        <div className="logo">
          <span className="logo-icon">📈</span>
          <span className="logo-text">SouLianghua</span>
          <span className="logo-sub">量化交易系统</span>
        </div>

        <div className="status-bar">
          <span className={`status-dot ${wsConnected ? 'connected' : ''}`} />
          <span className="status-text">{wsConnected ? '实时连接' : '连接中...'}</span>

          <span className={`status-dot ml-16 ${engineRunning ? 'running' : ''}`} />
          <span className="status-text">引擎: {engineRunning ? '运行中' : '已停止'}</span>

          <button
            className={`btn btn-sm ml-16 ${engineRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={async () => {
              if (engineRunning) {
                await api.stopEngine();
                setEngineRunning(false);
              } else {
                await api.startEngine();
                setEngineRunning(true);
              }
            }}
          >
            {engineRunning ? '停止引擎' : '启动引擎'}
          </button>
        </div>
      </header>

      {/* 导航 */}
      <nav className="nav">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`nav-item ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* 主内容 */}
      <main className="main">
        {activeTab === 'dashboard' && <Dashboard account={account} onRefresh={loadStatus} />}
        {activeTab === 'strategies' && <StrategyPanel onRefresh={loadStatus} />}
        {activeTab === 'backtest' && <BacktestPanel />}
        {activeTab === 'trades' && <TradeLog />}
        {activeTab === 'market' && <MarketView />}
      </main>
    </div>
  );
}
