'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const handler = require('./api/orders');

const fixture = { orderId: 'PRIVATE_ID', orderStatus: '订单已完成', createTime: '2026-10-20T04:00:00Z', storeName: '测试门店', orderProductList: [{ productName: '套餐', quantity: 2, comboItemList: [{ productName: '汉堡', quantity: 1 }] }], token: 'PRIVATE_TOKEN', deliveryInfo: { mobilePhone: 'PRIVATE_PHONE', deliveryAddress: 'PRIVATE_ADDRESS' } };
const rpc = (id, result) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json', 'Mcp-Session-Id': 'test-session' } });
function request(headers = {}, method = 'POST') { return { method, headers: { host: 'localhost:8123', origin: 'http://localhost:8123', authorization: 'Bearer TEST_CREDENTIAL', ...headers } }; }
async function invoke(req = request()) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res); return res;
}
function mockService(t, toolResult, options = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, ...init, payload: JSON.parse(init.body) });
    if (calls.length === 1) return rpc(1, { protocolVersion: '2025-06-18', capabilities: {} });
    if (calls.length === 2) return new Response(null, { status: 202 });
    if (options.sse) {
      const text = ': keep-alive\r\n\r\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message' }) + '\r\n\r\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 2, result: toolResult });
      const bytes = new TextEncoder().encode(text);
      return new Response(new ReadableStream({ start(controller) { for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7)); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
    }
    return rpc(2, toolResult);
  });
  return calls;
}

test('只调用固定官方订单查询，响应剔除私人字段并按北京时间统计', async t => {
  const calls = mockService(t, { structuredContent: { success: true, code: 200, data: { list: [fixture, fixture, { ...fixture, orderId: 'cancelled', orderStatus: '订单已取消' }] } } });
  const res = await invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.orders.length, 2);
  assert.equal(res.body.orders[1].completed, false);
  assert.equal(res.body.report.count, 1);
  assert.equal(res.body.report.records[0].clock, '12:00');
  assert.deepEqual(res.body.report.meals, [{ name: '套餐', orders: 1, quantity: 2 }]);
  for (const value of ['PRIVATE_ID', 'PRIVATE_TOKEN', 'PRIVATE_PHONE', 'PRIVATE_ADDRESS', 'TEST_CREDENTIAL']) assert.ok(!JSON.stringify(res.body).includes(value));
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.url === 'https://mcp.mcd.cn' && call.redirect === 'error'));
  assert.equal(calls[1].payload.method, 'notifications/initialized');
  assert.deepEqual(calls[2].payload.params, { name: 'order-list', arguments: {} });
  assert.equal(calls[2].headers['Mcp-Session-Id'], 'test-session');
  assert.equal(calls[2].headers['MCP-Protocol-Version'], '2025-06-18');
});

test('支持分块 SSE、通知事件和没有结尾空行的响应', async t => {
  mockService(t, { content: [{ type: 'text', text: '## Original Response\n```json\n' + JSON.stringify({ success: true, code: 200, data: { list: [fixture] } }) + '\n```' }] }, { sse: true });
  const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.body.report.count, 1);
});

test('业务成功的空账号保留空结果', async t => {
  mockService(t, { structuredContent: { success: true, code: 200, data: {} } });
  const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.body.report.count, 0); assert.deepEqual(res.body.orders, []);
});

test('业务失败与未知格式不会被当作空账号', async t => {
  for (const payload of [{ success: false, code: 401, data: {} }, { data: null }, { data: { list: [null] } }, { data: { list: 'bad' } }, {}]) {
    mockService(t, { structuredContent: payload });
    const res = await invoke(); assert.equal(res.statusCode, 502); assert.ok(res.body.error); assert.equal(res.body.report, undefined);
    t.mock.restoreAll();
  }
});

test('拒绝其他方法、缺失凭证与跨站请求，不调用上游', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('should not call'); });
  assert.equal((await invoke(request({}, 'GET'))).statusCode, 405);
  assert.equal((await invoke(request({ authorization: '' }))).statusCode, 400);
  assert.equal((await invoke(request({ origin: 'https://elsewhere.example' }))).statusCode, 403);
  assert.equal((await invoke(request({ 'sec-fetch-site': 'cross-site' }))).statusCode, 403);
  assert.equal(network.mock.calls.length, 0);
});

test('认证失败、限流和网络错误返回可理解的信息，不回显上游内容', async t => {
  for (const status of [401, 403, 429, 500]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('PRIVATE_TOKEN', { status }));
    const res = await invoke(); assert.equal(res.statusCode, status === 403 ? 401 : status === 500 ? 502 : status); assert.ok(!JSON.stringify(res.body).includes('PRIVATE_TOKEN'));
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('PRIVATE_TOKEN'); });
  const res = await invoke(); assert.equal(res.statusCode, 502); assert.ok(!res.body.error.includes('PRIVATE_TOKEN'));
});

test('超时和无效 JSON 返回失败，不能形成虚假回顾', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'AbortError'); });
  assert.equal((await invoke()).statusCode, 504); t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response('invalid json'));
  assert.equal((await invoke()).statusCode, 502);
});

test('网页与原有本地程序的统计一致，包括缺失字段、时区、并列与套餐', () => {
  const extra = [{ ...fixture, orderId: 'missing', createTime: 'bad date', storeName: null, orderProductList: null }, { ...fixture, orderId: 'tie', createTime: '2026-10-01 23:12:00', storeName: '另一家门店', orderProductList: Array.from({ length: 8 }, (_, i) => ({ productName: '餐品' + i, quantity: 1 })) }];
  const python = spawnSync('python', ['-c', 'import json,sys; from recap import analyze,demo_orders; rows=demo_orders()+json.load(sys.stdin); print(json.dumps({"rows":rows,"report":analyze(rows,"live")},ensure_ascii=True))'], { input: JSON.stringify(extra), encoding: 'utf8', cwd: __dirname });
  assert.equal(python.status, 0, python.stderr);
  const expected = JSON.parse(python.stdout);
  assert.deepEqual(handler.analyzeOrders(expected.rows).report, expected.report);
});
