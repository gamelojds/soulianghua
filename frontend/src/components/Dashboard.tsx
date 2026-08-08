import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Dashboard({ account, onRefresh }: { account: any; onRefresh: () => void }) {
  if (!account) {
    return <div className="loading">加载中...</div>;
  }

  const pnlClass = account.total_pnl >= 0 ? 'positive' : 'negative';

  return (
    <div className="fade-in">
      <h2>📊 账户概览</h2>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">总资产</div>
          <div className="stat-value">¥{account.total_value?.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">可用资金</div>
          <div className="stat-value">¥{account.available?.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">总盈亏</div>
          <div className={`stat-value ${pnlClass}`}>
            {account.total_pnl >= 0 ? '+' : ''}¥{account.total_pnl?.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">收益率</div>
          <div className={`stat-value ${pnlClass}`}>
            {account.total_pnl_pct >= 0 ? '+' : ''}{account.total_pnl_pct}%
          </div>
        </div>
      </div>

      <h3>持仓明细</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>标的</th>
            <th>数量</th>
            <th>均价</th>
            <th>现价</th>
            <th>市值</th>
            <th>盈亏</th>
          </tr>
        </thead>
        <tbody>
          {account.positions?.length > 0 ? account.positions.map((p: any, i: number) => (
            <tr key={i}>
              <td><strong>{p.symbol}</strong></td>
              <td>{p.quantity}</td>
              <td>¥{p.avg_price}</td>
              <td>¥{p.current_price}</td>
              <td>¥{p.market_value?.toLocaleString()}</td>
              <td className={p.pnl >= 0 ? 'positive' : 'negative'}>
                ¥{p.pnl?.toLocaleString()}
              </td>
            </tr>
          )) : (
            <tr><td colSpan={6} className="empty-cell">暂无持仓</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
