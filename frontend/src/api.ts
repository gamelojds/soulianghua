/**
 * SouLianghua - API 客户端
 */

const BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  return res.json();
}

export const api = {
  // 策略
  getStrategies: () => request('/strategies'),
  createStrategy: (data: any) => request('/strategies/create', { method: 'POST', body: JSON.stringify(data) }),
  startStrategy: (data: any) => request('/strategies/start', { method: 'POST', body: JSON.stringify(data) }),
  stopStrategy: (name: string) => request(`/strategies/${encodeURIComponent(name)}/stop`, { method: 'POST' }),
  getRunning: () => request('/strategies/running'),

  // 引擎
  startEngine: () => request('/engine/start', { method: 'POST' }),
  stopEngine: () => request('/engine/stop', { method: 'POST' }),
  getEngineStatus: () => request('/engine/status'),

  // 回测
  runBacktest: (data: any) => request('/backtest', { method: 'POST', body: JSON.stringify(data) }),

  // 账户
  getAccount: () => request('/account'),
  getTrades: (limit = 50) => request(`/account/trades?limit=${limit}`),

  // 行情
  searchMarket: (keyword: string) => request(`/market/search?keyword=${encodeURIComponent(keyword)}`),
  getMarketData: (symbol: string, days = 365) => request(`/market/data/${symbol}?days=${days}`),
};

/** WebSocket 连接 */
export function connectWS(onMessage: (data: any) => void): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);

  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(() => connectWS(onMessage), 3000);
  };

  return ws;
}
