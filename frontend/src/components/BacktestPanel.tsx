import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { api } from '../api';

const STRATEGY_TYPES: any = {
  ma_cross: '双均线交叉', grid: '网格交易', momentum: '动量趋势',
  mean_reversion: '均值回归', rsi: 'RSI指标', bollinger: '布林带突破',
  turtle: '海龟交易', arbitrage: '统计套利',
};

const POPULAR_STOCKS = ['sh600036', 'sh600519', 'sz000001', 'sh601318', 'sz000858', 'sz300750', 'AAPL', 'TSLA'];

export default function BacktestPanel() {
  const [form, setForm] = useState({ strategy_type: 'ma_cross', symbol: 'sh600036', capital: 100000, params: '{}', days: 365 });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);

  async function runBacktest() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const params = JSON.parse(form.params || '{}');
      const res = await api.runBacktest({
        strategy_type: form.strategy_type,
        symbol: form.symbol,
        capital: form.capital,
        params,
        days: form.days,
      });

      if (res.success) {
        setResult(res.result);
        setTimeout(() => renderChart(res.result), 100);
      } else {
        setError(res.error || '回测失败');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function renderChart(data: any) {
    if (!chartRef.current || !data.equity_curve?.length) return;

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: data.equity_curve.map((_: any, i: number) => i) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => (v / 10000).toFixed(0) + '万' } },
      series: [{
        name: '权益曲线',
        type: 'line',
        data: data.equity_curve,
        smooth: true,
        lineStyle: { color: '#6366f1', width: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(99,102,241,0.3)' },
          { offset: 1, color: 'rgba(99,102,241,0.02)' },
        ])},
        showSymbol: false,
      }],
    });
    window.addEventListener('resize', () => chart.resize());
  }

  return (
    <div className="fade-in">
      <h2>🔬 策略回测</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* 配置区 */}
        <div className="form">
          <label>策略类型</label>
          <select value={form.strategy_type} onChange={e => setForm({ ...form, strategy_type: e.target.value })}>
            {Object.entries(STRATEGY_TYPES).map(([k, v]: any) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <label>交易标的</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {POPULAR_STOCKS.map(s => (
              <span key={s} className={`tag ${form.symbol === s ? 'tag-active' : ''}`} onClick={() => setForm({ ...form, symbol: s })}>{s}</span>
            ))}
          </div>
          <input type="text" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} />

          <label>初始资金</label>
          <input type="number" value={form.capital} onChange={e => setForm({ ...form, capital: +e.target.value })} />

          <label>回测天数</label>
          <select value={form.days} onChange={e => setForm({ ...form, days: +e.target.value })}>
            <option value={90}>90天</option>
            <option value={180}>180天</option>
            <option value={365}>1年</option>
            <option value={730}>2年</option>
          </select>

          <label>扩展参数 (JSON)</label>
          <textarea rows={3} value={form.params} onChange={e => setForm({ ...form, params: e.target.value })} placeholder='{"fast": 5, "slow": 20}' />

          <button className="btn btn-primary btn-lg" onClick={runBacktest} disabled={loading}>
            {loading ? '回测中...' : '开始回测'}
          </button>
          {error && <div className="msg msg-error">{error}</div>}
        </div>

        {/* 结果区 */}
        <div>
          {result ? (
            <>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-label">总收益率</div>
                  <div className={`stat-value ${result.total_return >= 0 ? 'positive' : 'negative'}`}>
                    {result.total_return >= 0 ? '+' : ''}{result.total_return}%
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">年化收益</div>
                  <div className="stat-value">{result.annual_return}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">最大回撤</div>
                  <div className="stat-value negative">-{result.max_drawdown}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">夏普比率</div>
                  <div className="stat-value">{result.sharpe_ratio}</div>
                </div>
              </div>

              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
                <div className="stat-card">
                  <div className="stat-label">交易次数</div>
                  <div className="stat-value">{result.total_trades}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">胜率</div>
                  <div className="stat-value">{result.win_rate}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">平均盈利</div>
                  <div className="stat-value positive">+{result.avg_profit}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">盈亏比</div>
                  <div className="stat-value">{result.profit_factor}</div>
                </div>
              </div>

              <div ref={chartRef} style={{ height: 300, marginTop: 16, background: '#fff', borderRadius: 8, padding: 8 }} />
            </>
          ) : (
            <div className="empty">选择策略参数后点击"开始回测"</div>
          )}
        </div>
      </div>
    </div>
  );
}
