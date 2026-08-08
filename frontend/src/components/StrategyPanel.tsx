import React, { useState, useEffect } from 'react';
import { api } from '../api';

const STRATEGY_TYPES: any = {
  ma_cross: { name: '双均线交叉', desc: '金叉买入，死叉卖出' },
  grid: { name: '网格交易', desc: '震荡行情低买高卖' },
  momentum: { name: '动量趋势', desc: '放量突破跟踪趋势' },
  mean_reversion: { name: '均值回归', desc: '布林带+RSI超买超卖' },
  rsi: { name: 'RSI 指标', desc: '纯RSI超买超卖信号' },
  bollinger: { name: '布林带突破', desc: '价格突破上下轨' },
  turtle: { name: '海龟交易', desc: '唐奇安通道趋势跟踪' },
  arbitrage: { name: '统计套利', desc: '价格偏离均值回归' },
};

const POPULAR_STOCKS = [
  'sh600036', 'sh600519', 'sz000001', 'sh601318',
  'sz000858', 'sz300750', 'AAPL', 'TSLA',
];

export default function StrategyPanel({ onRefresh }: { onRefresh: () => void }) {
  const [running, setRunning] = useState<any[]>([]);
  const [form, setForm] = useState({ type: 'ma_cross', name: '', symbol: 'sh600036', capital: 100000, position_size: 0.1, stop_loss: -5, stop_profit: 15, params: '{}' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getRunning().then(r => setRunning(r.running || []));
  }, []);

  async function handleStart() {
    try {
      const params = JSON.parse(form.params || '{}');
      const res = await api.startStrategy({
        type: form.type,
        name: form.name,
        symbol: form.symbol,
        capital: form.capital,
        position_size: form.position_size / 100,
        stop_loss: form.stop_loss / 100,
        stop_profit: form.stop_profit / 100,
        params,
      });
      if (res.success) {
        setMsg(`策略已启动: ${res.strategy?.name}`);
        const r = await api.getRunning();
        setRunning(r.running || []);
        onRefresh();
      } else {
        setMsg(`错误: ${res.error}`);
      }
    } catch (e: any) {
      setMsg(`错误: ${e.message}`);
    }
  }

  async function handleStop(name: string) {
    await api.stopStrategy(name);
    const r = await api.getRunning();
    setRunning(r.running || []);
  }

  return (
    <div className="fade-in">
      <h2>⚡ 策略管理</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 策略列表 */}
        <div>
          <h3>可用策略</h3>
          <div className="strat-list">
            {Object.entries(STRATEGY_TYPES).map(([k, v]: any) => (
              <div
                key={k}
                className={`strat-card ${form.type === k ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, type: k, name: '' })}
              >
                <div className="strat-name">{v.name}</div>
                <div className="strat-desc">{v.desc}</div>
                <code className="strat-key">{k}</code>
              </div>
            ))}
          </div>
        </div>

        {/* 配置表单 */}
        <div>
          <h3>策略配置</h3>
          <div className="form">
            <label>策略名称</label>
            <input type="text" value={form.name} placeholder="留空自动生成" onChange={e => setForm({ ...form, name: e.target.value })} />

            <label>交易标的</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {POPULAR_STOCKS.map(s => (
                <span key={s} className={`tag ${form.symbol === s ? 'tag-active' : ''}`} onClick={() => setForm({ ...form, symbol: s })}>{s}</span>
              ))}
            </div>
            <input type="text" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} />

            <label>分配资金</label>
            <input type="number" value={form.capital} onChange={e => setForm({ ...form, capital: +e.target.value })} />

            <label>仓位比例 (%)</label>
            <input type="number" value={form.position_size} min={1} max={100} onChange={e => setForm({ ...form, position_size: +e.target.value })} />

            <label>止损 (%)</label>
            <input type="number" value={form.stop_loss} min={-50} max={0} onChange={e => setForm({ ...form, stop_loss: +e.target.value })} />

            <label>止盈 (%)</label>
            <input type="number" value={form.stop_profit} min={0} max={500} onChange={e => setForm({ ...form, stop_profit: +e.target.value })} />

            <label>扩展参数 (JSON)</label>
            <textarea rows={3} value={form.params} onChange={e => setForm({ ...form, params: e.target.value })} placeholder='{"fast": 5, "slow": 20}' />

            <button className="btn btn-primary btn-lg" onClick={handleStart}>启动策略</button>
            {msg && <div className={`msg ${msg.includes('错误') ? 'msg-error' : 'msg-success'}`}>{msg}</div>}
          </div>
        </div>
      </div>

      {/* 运行中的策略 */}
      <h3 style={{ marginTop: 24 }}>运行中</h3>
      <table className="data-table">
        <thead>
          <tr><th>策略名称</th><th>标的</th><th>参数</th><th>操作</th></tr>
        </thead>
        <tbody>
          {running.length > 0 ? running.map((s: any, i: number) => (
            <tr key={i}>
              <td><strong>{s.name}</strong></td>
              <td>{s.symbol}</td>
              <td><code>{JSON.stringify(s.params)}</code></td>
              <td><button className="btn btn-sm btn-danger" onClick={() => handleStop(s.name)}>停止</button></td>
            </tr>
          )) : (
            <tr><td colSpan={4} className="empty-cell">暂无运行中的策略</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
