'use strict';

// This endpoint can only read history from the fixed official MCP server.
const ENDPOINT = 'https://mcp.mcd.cn';
const PERIODS = ['早餐', '午间', '下午', '晚间', '深夜'];
const COMPLETED = new Set(['6', '8', '已完成', '已评价', '订单已完成']);
const MAX_RESPONSE = 2 * 1024 * 1024;

class QueryError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

const clean = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';
const period = hour => hour >= 5 && hour < 11 ? '早餐' : hour >= 11 && hour < 14 ? '午间' : hour >= 14 && hour < 17 ? '下午' : hour >= 17 && hour < 22 ? '晚间' : '深夜';

function orderTime(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return null;
  text = text.replace(' ', 'T');
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += '+08:00';
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19) + '+08:00';
}

function analyzeOrders(rawOrders) {
  const seen = new Set(), orders = [], records = [];
  const periods = new Map(PERIODS.map(name => [name, 0]));
  const stores = new Map(), mealOrders = new Map(), mealUnits = new Map();
  const unknown = { time: 0, store: 0, meals: 0 };
  const increment = (map, key, value = 1) => map.set(key, (map.get(key) || 0) + value);
  let skipped = 0;
  for (const raw of rawOrders) {
    const identity = typeof raw.orderId === 'string' || typeof raw.orderId === 'number' ? raw.orderId : null;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const completed = COMPLETED.has(String(raw.orderStatus ?? ''));
    const time = orderTime(raw.createTime), store = clean(raw.storeName);
    const items = (Array.isArray(raw.orderProductList) ? raw.orderProductList : [])
      .filter(item => item && typeof item === 'object' && clean(item.productName) && Number.isSafeInteger(item.quantity) && item.quantity > 0)
      .map(item => ({ name: clean(item.productName), quantity: item.quantity }));
    const record = { time, date: time ? time.slice(5, 10).replace('-', '.') : '日期未提供', clock: time ? time.slice(11, 16) : '', store: store || '门店未提供', items };
    orders.push({ ...record, status: clean(String(raw.orderStatus ?? '')) || '状态未提供', completed });
    if (!completed) { skipped++; continue; }
    records.push(record);
    if (time) increment(periods, period(Number(time.slice(11, 13)))); else unknown.time++;
    if (store) increment(stores, store); else unknown.store++;
    if (!items.length) unknown.meals++;
    for (const item of items) increment(mealUnits, item.name, item.quantity);
    for (const name of new Set(items.map(item => item.name))) increment(mealOrders, name);
  }
  const newest = (a, b) => (b.time || '').localeCompare(a.time || '');
  orders.sort(newest); records.sort(newest);
  const dates = records.filter(row => row.time).map(row => row.time).sort();
  const favorites = map => {
    const max = Math.max(0, ...map.values());
    return [...map].filter(([, count]) => max && count === max).map(([name]) => name);
  };
  const report = {
    source: 'live', count: records.length, fetched: rawOrders.length, skipped,
    dateStart: dates[0]?.slice(0, 10) || null, dateEnd: dates.at(-1)?.slice(0, 10) || null,
    periods: [...periods].map(([name, count]) => ({ name, count })), favoritePeriods: favorites(periods),
    stores: [...stores].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    favoriteStores: favorites(stores).sort(), storeCount: stores.size,
    meals: [...mealOrders].sort((a, b) => b[1] - a[1] || mealUnits.get(b[0]) - mealUnits.get(a[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 6).map(([name, count]) => ({ name, orders: count, quantity: mealUnits.get(name) })),
    favoriteMeals: favorites(mealOrders).sort(), unknown, records,
  };
  return { report, orders };
}

async function rpcResponse(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw new QueryError('订单服务返回了空响应，请稍后重试。');
  const decoder = new TextDecoder();
  const streaming = (response.headers.get('content-type') || '').includes('text/event-stream');
  let text = '', size = 0;
  const eventResult = block => {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return null;
    const event = JSON.parse(data);
    return event.id === id ? event : null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        size += value.byteLength;
        if (size > MAX_RESPONSE) throw new QueryError('返回的订单数据过大，已停止查询。');
      }
      text += decoder.decode(value, { stream: !done });
      if (streaming) {
        text = text.replace(/\r\n/g, '\n');
        let end;
        while ((end = text.indexOf('\n\n')) !== -1) {
          const event = eventResult(text.slice(0, end)); text = text.slice(end + 2);
          if (event) return event;
        }
        if (done && text.trim()) { const event = eventResult(text); if (event) return event; }
      }
      if (done) break;
    }
    if (!streaming) {
      const result = JSON.parse(text);
      if (result && result.id === id) return result;
    }
    throw new QueryError('没有收到完整的订单响应，请稍后重试。');
  } finally { await reader.cancel().catch(() => {}); }
}

function extractOrders(result) {
  if (!result || typeof result !== 'object' || result.isError) throw new QueryError('历史订单查询失败，请稍后重试。');
  let payload = result.structuredContent;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    payload = null;
    for (const block of Array.isArray(result.content) ? result.content : []) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue;
      let text = block.text.split('Original Response').at(-1);
      // MCP text may wrap the original JSON in Markdown and a human-readable summary.
      for (let start = text.indexOf('{'); start !== -1 && !payload; start = text.indexOf('{', start + 1)) {
        let depth = 0, quoted = false, escaped = false;
        for (let end = start; end < text.length; end++) {
          const char = text[end];
          if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
          else if (char === '"') quoted = true;
          else if (char === '{') depth++;
          else if (char === '}' && --depth === 0) {
            try {
              const value = JSON.parse(text.slice(start, end + 1));
              if (value && ['data', 'success', 'code'].some(key => Object.hasOwn(value, key))) payload = value;
            } catch { /* Try the next JSON object, without exposing upstream text. */ }
            break;
          }
        }
      }
      if (payload) break;
    }
  }
  if (!payload || !Object.hasOwn(payload, 'data')) throw new QueryError('订单响应格式暂不支持，没有将它当作空账户。');
  if (payload.success === false || ![200, '200', 0, '0'].includes(payload.code ?? 200)) throw new QueryError('订单查询未成功，请检查账号授权后重试。');
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) return [];
  if (!data || !Array.isArray(data.list) || data.list.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new QueryError('订单数据格式暂不支持，请稍后重试。');
  return data.list;
}

async function history(token) {
  let session = null, version = '2025-06-18', id = 0;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  async function call(method, params, notification = false) {
    const payload = { jsonrpc: '2.0', method };
    if (!notification) payload.id = ++id;
    if (params !== undefined) payload.params = params;
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
    if (session) headers['Mcp-Session-Id'] = session;
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = version;
    const response = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) throw new QueryError('连接凭证无效、已过期或没有访问权限，请重新申请后重试。', 401);
      if (response.status === 429) throw new QueryError('查询太频繁，请稍等一分钟再试。', 429);
      throw new QueryError('麦当劳订单服务暂时不可用，请稍后重试。');
    }
    session = response.headers.get('Mcp-Session-Id') || session;
    if (notification) { await response.body?.cancel().catch(() => {}); return; }
    const result = await rpcResponse(response, payload.id);
    if (result.error || !result.result || typeof result.result !== 'object') throw new QueryError('订单服务未完成请求，请稍后重试。');
    return result.result;
  }
  try {
    const initialized = await call('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'mai-recap-web', version: '0.1.0' } });
    if (!['2025-06-18', '2025-03-26', '2024-11-05'].includes(initialized.protocolVersion)) throw new QueryError('订单服务的协议版本暂不支持。');
    version = initialized.protocolVersion;
    await call('notifications/initialized', undefined, true);
    return analyzeOrders(extractOrders(await call('tools/call', { name: 'order-list', arguments: {} })));
  } finally { clearTimeout(timer); token = ''; session = null; }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: '请使用页面上的“获取我的订单”按钮。' }); }
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '请从麦迹页面发起查询。' });
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return send(403, { error: '请从麦迹页面发起查询。' }); }
    catch { return send(403, { error: '请求来源无效。' }); }
  }
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 4096 || /\s/.test(token)) return send(400, { error: '请输入有效的 MCP 连接凭证。' });
  try { send(200, await history(token)); }
  catch (error) {
    if (error instanceof QueryError) send(error.status, { error: error.message });
    else if (error.name === 'AbortError') send(504, { error: '查询超时，请检查网络并稍后重试。' });
    else send(502, { error: '暂时无法连接订单服务，请稍后重试。' });
  } finally { token = ''; }
}

module.exports = handler;
module.exports.analyzeOrders = analyzeOrders;
