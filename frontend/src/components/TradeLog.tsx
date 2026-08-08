import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function TradeLog() {
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    loadTrades();
    const timer = setInterval(loadTrades, 5000);
    return () => clearInterval(timer);
  }, []);

  async function loadTrades() {
    const data = await api.getTrades(50);
    setTrades(data.trades || []);
  }

  return (
    <div className="fade-in">
      <h2>💹 交易日志</h2>

      <table className="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>策略</th>
            <th>标的</th>
            <th>方向</th>
            <th>价格</th>
            <th>数量</th>
            <th>原因</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {trades.length > 0 ? trades.map((t: any, i: number) => (
            <tr key={i}>
              <td className="time-cell">{t.time?.slice(11, 19)}</td>
              <td>{t.strategy}</td>
              <td><strong>{t.symbol}</strong></td>
              <td>
                <span className={`tag ${t.type === 'buy' ? 'tag-buy' : 'tag-sell'}`}>
                  {t.type === 'buy' ? '买入' : '卖出'}
                </span>
              </td>
              <td>¥{t.price}</td>
              <td>{t.quantity}</td>
              <td className="reason-cell">{t.reason}</td>
              <td className={t.result?.success ? 'positive' : 'negative'}>
                {t.result?.success ? '✅' : '❌'}
              </td>
            </tr>
          )) : (
            <tr><td colSpan={8} className="empty-cell">暂无交易记录</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
