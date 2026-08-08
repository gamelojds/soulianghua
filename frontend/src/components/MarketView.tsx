import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { api } from '../api';

const POPULAR = ['sh600036', 'sh600519', 'sz000001', 'sh601318', 'sz000858', 'sz300750'];

export default function MarketView() {
  const [symbol, setSymbol] = useState('sh600036');
  const [chartData, setChartData] = useState<any>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData(symbol);
  }, [symbol]);

  async function loadData(sym: string) {
    const data = await api.getMarketData(sym);
    setChartData(data);
    setTimeout(() => renderChart(data), 100);
  }

  function renderChart(data: any) {
    if (!chartRef.current || !data?.data?.length) return;

    const chart = echarts.init(chartRef.current);
    const dates = data.data.map((d: any) => d.date);
    const closes = data.data.map((d: any) => d.close);
    const volumes = data.data.map((d: any) => d.volume);

    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: [
        { left: 60, right: 20, top: 20, height: '60%' },
        { left: 60, right: 20, top: '75%', height: '15%' },
      ],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0, show: false },
        { type: 'category', data: dates, gridIndex: 1 },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, axisLabel: { formatter: '¥{value}' } },
        { type: 'value', gridIndex: 1 },
      ],
      series: [
        {
          name: '收盘价',
          type: 'line',
          data: closes,
          smooth: true,
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(99,102,241,0.3)' },
            { offset: 1, color: 'rgba(99,102,241,0.02)' },
          ])},
          showSymbol: false,
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: '成交量',
          type: 'bar',
          data: volumes,
          itemStyle: { color: 'rgba(99,102,241,0.4)' },
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1] },
        { type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 20 },
      ],
    });

    window.addEventListener('resize', () => chart.resize());
  }

  return (
    <div className="fade-in">
      <h2>📈 行情查看</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {POPULAR.map(s => (
          <span key={s} className={`tag ${symbol === s ? 'tag-active' : ''}`} onClick={() => setSymbol(s)}>{s}</span>
        ))}
      </div>

      {chartData ? (
        <div ref={chartRef} style={{ height: 450, background: '#fff', borderRadius: 8, padding: 8 }} />
      ) : (
        <div className="loading">加载行情数据...</div>
      )}
    </div>
  );
}
