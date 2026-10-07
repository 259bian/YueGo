// 悦购后端服务：Node 内置 http 模块，无第三方依赖。
// 启动：node server/server.js  （默认端口 8787，可用 YUEGO_PORT / YUEGO_DB 覆盖）
'use strict';
const http = require('node:http');
const path = require('node:path');
const { Database } = require('./lib/db');
const { hashPassword, verifyPassword, newToken } = require('./lib/crypto');
const { queryProducts, productById, CATEGORIES } = require('./lib/catalog');
const orderLib = require('./lib/order');
const { validateRegistration, validateNickname, validateAddress } = require('./lib/user');

const PORT = Number(process.env.YUEGO_PORT || 8787);
const DB_FILE = process.env.YUEGO_DB || path.join(__dirname, 'data', 'yuego.json');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;   // 令牌有效期 14 天
const BODY_LIMIT = 1024 * 128;                    // 请求体上限 128KB
const SLOW_DELAY_MS = Number(process.env.YUEGO_DELAY || 0); // 演示网络延迟，便于测试加载状态

const db = new Database(DB_FILE);
const loginAttempts = new Map();  // username -> { count, lockedUntil }

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function ok(res, data) { json(res, 200, { ok: true, data: data }); }
function fail(res, status, message, code) {
  json(res, status, { ok: false, error: { code: code || 'request_failed', message: message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (err) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function publicUser(user) {
  return { username: user.username, nickname: user.nickname, addresses: user.addresses, favorites: user.favorites };
}
function issueToken(user) {
  const token = newToken();
  db.data.sessions = db.data.sessions.filter(s => s.expiresAt > Date.now());
  db.data.sessions.push({ token: token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}
function currentUser(req) {
  const header = String(req.headers['authorization'] || '');
  if (!header.startsWith('Bearer ')) { return undefined; }
  const token = header.slice(7).trim();
  const session = db.data.sessions.find(s => s.token === token && s.expiresAt > Date.now());
  if (!session) { return undefined; }
  return db.userById(session.userId);
}

// 简单的登录失败锁定：同一用户名连续 5 次失败后锁定 5 分钟。
function checkLock(username) {
  const record = loginAttempts.get(username.toLowerCase());
  if (record && record.lockedUntil > Date.now()) {
    const seconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return '尝试次数过多，请 ' + seconds + ' 秒后再试';
  }
  return '';
}
function noteFailure(username) {
  const key = username.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) { record.lockedUntil = Date.now() + 5 * 60 * 1000; record.count = 0; }
  loginAttempts.set(key, record);
}
function clearFailure(username) { loginAttempts.delete(username.toLowerCase()); }

// ------- 路由处理 -------
const routes = [];
function route(method, pattern, handler, needAuth) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler, needAuth: Boolean(needAuth) });
}

route('GET', '/api/health', (ctx) => ok(ctx.res, { service: 'yuego', time: Date.now(), items: CATEGORIES.length }));

route('POST', '/api/auth/register', (ctx) => {
  const body = ctx.body;
  const problem = validateRegistration(db.data.users.map(u => u.username), body.username, body.password, body.confirm);
  if (problem) { return fail(ctx.res, 400, problem, 'invalid_registration'); }
  const user = {
    id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    username: String(body.username).trim(),
    nickname: String(body.username).trim(),
    passwordHash: hashPassword(String(body.password)),
    addresses: [],
    favorites: []
  };
  db.data.users.push(user);
  db.save();
  ok(ctx.res, { token: issueToken(user), user: publicUser(user) });
});

route('POST', '/api/auth/login', (ctx) => {
  const body = ctx.body;
  const name = String(body.username || '').trim();
  const locked = checkLock(name);
  if (locked) { return fail(ctx.res, 429, locked, 'too_many_attempts'); }
  const user = db.userByName(name);
  if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
    noteFailure(name);
    return fail(ctx.res, 401, '用户名或密码不正确', 'invalid_credentials');
  }
  clearFailure(name);
  db.save();
  ok(ctx.res, { token: issueToken(user), user: publicUser(user) });
});

route('POST', '/api/auth/logout', (ctx) => {
  const header = String(ctx.req.headers['authorization'] || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  db.data.sessions = db.data.sessions.filter(s => s.token !== token);
  db.save();
  ok(ctx.res, { loggedOut: true });
}, true);

route('GET', '/api/auth/me', (ctx) => ok(ctx.res, { user: publicUser(ctx.user) }), true);

route('PATCH', '/api/users/me', (ctx) => {
  const problem = validateNickname(ctx.body.nickname);
  if (problem) { return fail(ctx.res, 400, problem, 'invalid_nickname'); }
  ctx.user.nickname = String(ctx.body.nickname).trim();
  db.save();
  ok(ctx.res, { user: publicUser(ctx.user) });
}, true);

route('GET', '/api/products', (ctx) => {
  const q = ctx.query;
  const items = queryProducts({
    keyword: q.keyword || '',
    category: q.category || '全部',
    sort: Number(q.sort || 0),
    under100: q.under100 === '1' || q.under100 === 'true',
    inStock: q.inStock === '1' || q.inStock === 'true'
  });
  ok(ctx.res, { categories: CATEGORIES, items: items, total: items.length });
});

route('GET', '/api/products/:id', (ctx) => {
  const product = productById(ctx.params.id);
  if (!product) { return fail(ctx.res, 404, '商品不存在', 'not_found'); }
  ok(ctx.res, { product: product });
});

route('GET', '/api/favorites', (ctx) => ok(ctx.res, { favorites: ctx.user.favorites }), true);

route('PUT', '/api/favorites/:id', (ctx) => {
  const product = productById(ctx.params.id);
  if (!product) { return fail(ctx.res, 404, '商品不存在', 'not_found'); }
  if (!ctx.user.favorites.includes(product.id)) { ctx.user.favorites.push(product.id); }
  db.save();
  ok(ctx.res, { favorites: ctx.user.favorites });
}, true);

route('DELETE', '/api/favorites/:id', (ctx) => {
  ctx.user.favorites = ctx.user.favorites.filter(id => id !== ctx.params.id);
  db.save();
  ok(ctx.res, { favorites: ctx.user.favorites });
}, true);

route('GET', '/api/addresses', (ctx) => ok(ctx.res, { addresses: ctx.user.addresses }), true);

route('POST', '/api/addresses', (ctx) => {
  const body = ctx.body;
  const problem = validateAddress(body);
  if (problem) { return fail(ctx.res, 400, problem, 'invalid_address'); }
  const address = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(body.name).trim(),
    phone: String(body.phone).trim(),
    region: String(body.region).trim(),
    detail: String(body.detail).trim(),
    isDefault: ctx.user.addresses.length === 0 || Boolean(body.isDefault)
  };
  ctx.user.addresses = ctx.user.addresses
    .filter(a => a.id !== address.id)
    .map(a => Object.assign({}, a, { isDefault: address.isDefault ? false : a.isDefault }));
  ctx.user.addresses.push(address);
  db.save();
  ok(ctx.res, { addresses: ctx.user.addresses });
}, true);

route('PUT', '/api/addresses/:id', (ctx) => {
  const existing = ctx.user.addresses.find(a => a.id === ctx.params.id);
  if (!existing) { return fail(ctx.res, 404, '地址不存在', 'not_found'); }
  const body = Object.assign({}, existing, ctx.body);
  const problem = validateAddress(body);
  if (problem) { return fail(ctx.res, 400, problem, 'invalid_address'); }
  const wantDefault = Boolean(ctx.body.isDefault);
  ctx.user.addresses = ctx.user.addresses.map(a => {
    if (a.id !== existing.id) {
      return Object.assign({}, a, { isDefault: wantDefault ? false : a.isDefault });
    }
    return { id: a.id, name: String(body.name).trim(), phone: String(body.phone).trim(),
      region: String(body.region).trim(), detail: String(body.detail).trim(), isDefault: wantDefault || a.isDefault };
  });
  db.save();
  ok(ctx.res, { addresses: ctx.user.addresses });
}, true);

route('DELETE', '/api/addresses/:id', (ctx) => {
  const before = ctx.user.addresses.length;
  ctx.user.addresses = ctx.user.addresses.filter(a => a.id !== ctx.params.id);
  if (ctx.user.addresses.length === before) { return fail(ctx.res, 404, '地址不存在', 'not_found'); }
  if (ctx.user.addresses.length > 0 && !ctx.user.addresses.some(a => a.isDefault)) {
    ctx.user.addresses = ctx.user.addresses.map((a, index) => Object.assign({}, a, { isDefault: index === 0 }));
  }
  db.save();
  ok(ctx.res, { addresses: ctx.user.addresses });
}, true);

route('GET', '/api/cart', (ctx) => ok(ctx.res, { lines: db.cartOf(ctx.user.id).lines }), true);

route('PUT', '/api/cart', (ctx) => {
  const incoming = Array.isArray(ctx.body.lines) ? ctx.body.lines : null;
  if (!incoming) { return fail(ctx.res, 400, '请求需要 lines 数组', 'invalid_cart'); }
  const lines = [];
  for (const line of incoming) {
    const product = productById(line.productId);
    if (!product) { return fail(ctx.res, 400, '商品不存在：' + line.productId, 'invalid_cart'); }
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) { return fail(ctx.res, 400, '商品数量不正确', 'invalid_cart'); }
    if (quantity > product.stock) {
      return fail(ctx.res, 400, product.name + ' 库存不足，仅剩 ' + product.stock + ' 件', 'out_of_stock');
    }
    lines.push({ key: product.id + ':' + String(line.spec || ''),
      productId: product.id, spec: String(line.spec || ''), quantity: quantity, selected: line.selected !== false });
  }
  const cart = db.cartOf(ctx.user.id);
  cart.lines = lines;
  db.save();
  ok(ctx.res, { lines: cart.lines });
}, true);

route('DELETE', '/api/cart', (ctx) => {
  const cart = db.cartOf(ctx.user.id);
  cart.lines = [];
  db.save();
  ok(ctx.res, { lines: [] });
}, true);

route('GET', '/api/orders', (ctx) => {
  const status = ctx.query.status;
  let items = db.ordersOf(ctx.user.id);
  if (status !== undefined && status !== '' && status !== 'all') {
    const wanted = Number(status);
    items = items.filter(o => o.status === wanted);
  }
  items = items.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  ok(ctx.res, { items: items, total: items.length });
}, true);

route('GET', '/api/orders/:id', (ctx) => {
  const order = db.orderById(ctx.params.id);
  if (!order || order.ownerId !== ctx.user.id) { return fail(ctx.res, 404, '订单不存在', 'not_found'); }
  ok(ctx.res, { order: order });
}, true);

// 下单：金额一律由服务端按商品单价重算，客户端只提交商品与数量。
route('POST', '/api/orders', (ctx) => {
  const body = ctx.body;
  let lines = Array.isArray(body.lines) ? body.lines : null;
  if (!lines || lines.length === 0) {
    // 允许省略 lines：默认结算购物车中勾选的行
    lines = db.cartOf(ctx.user.id).lines
      .filter(l => l.selected)
      .map(l => ({ productId: l.productId, spec: l.spec, quantity: l.quantity }));
  }
  const result = orderLib.createOrder({
    lines: lines,
    shipping: body.shipping || {},
    remark: body.remark,
    ownerId: ctx.user.id
  });
  if (result.error) { return fail(ctx.res, 400, result.error, 'invalid_order'); }
  db.data.orders.push(result.order);
  // 结算后从购物车移除对应商品
  const ordered = new Set(result.order.lines.map(l => l.productId + ':' + l.spec));
  const cart = db.cartOf(ctx.user.id);
  cart.lines = cart.lines.filter(l => !ordered.has(l.key));
  db.save();
  ok(ctx.res, { order: result.order });
}, true);

route('POST', '/api/orders/:id/pay', (ctx) => {
  const order = requireOwnOrder(ctx);
  if (!order) { return; }
  const result = orderLib.payOrder(order, String(ctx.body.method || ''), ctx.body.amount);
  if (result.error) { return fail(ctx.res, 400, result.error, 'pay_failed'); }
  db.save();
  ok(ctx.res, { order: order, message: '支付成功，等待发货' });
}, true);

route('POST', '/api/orders/:id/cancel', (ctx) => {
  const order = requireOwnOrder(ctx);
  if (!order) { return; }
  const result = orderLib.cancelOrder(order);
  if (result.error) { return fail(ctx.res, 400, result.error, 'cancel_failed'); }
  db.save();
  ok(ctx.res, { order: order, message: result.message });
}, true);

// 演示用发货接口：真实项目应由商家后台调用并校验商家身份。
route('POST', '/api/orders/:id/ship', (ctx) => {
  const order = requireOwnOrder(ctx);
  if (!order) { return; }
  const result = orderLib.shipOrder(order);
  if (result.error) { return fail(ctx.res, 400, result.error, 'ship_failed'); }
  db.save();
  ok(ctx.res, { order: order, message: '已发货，包裹运输中' });
}, true);

route('POST', '/api/orders/:id/receive', (ctx) => {
  const order = requireOwnOrder(ctx);
  if (!order) { return; }
  const result = orderLib.confirmReceipt(order);
  if (result.error) { return fail(ctx.res, 400, result.error, 'receive_failed'); }
  db.save();
  ok(ctx.res, { order: order, message: '已确认收货' });
}, true);

// 订单操作统一入口：不存在与不属于当前用户都返回 404，避免暴露他人订单是否存在。
function requireOwnOrder(ctx) {
  const order = db.orderById(ctx.params.id);
  if (!order || order.ownerId !== ctx.user.id) {
    fail(ctx.res, 404, '订单不存在', 'not_found');
    return undefined;
  }
  return order;
}

// ------- 请求分发 -------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  if (SLOW_DELAY_MS > 0) { await new Promise(r => setTimeout(r, SLOW_DELAY_MS)); }
  for (const entry of routes) {
    if (entry.method !== req.method) { continue; }
    const matched = entry.regex.exec(url.pathname);
    if (!matched) { continue; }
    const params = {};
    entry.keys.forEach((key, index) => { params[key] = decodeURIComponent(matched[index + 1]); });
    const query = {};
    url.searchParams.forEach((value, key) => { query[key] = value; });
    const ctx = { req, res, params, query, body: {} };
    try {
      if (entry.needAuth) {
        const user = currentUser(req);
        if (!user) { fail(res, 401, '登录已过期，请重新登录', 'unauthorized'); return; }
        ctx.user = user;
      }
      if (req.method !== 'GET' && req.method !== 'DELETE') { ctx.body = await readBody(req); }
      entry.handler(ctx);
      console.log('[' + req.method + '] ' + url.pathname + ' ' + res.statusCode + ' ' + (Date.now() - started) + 'ms');
    } catch (err) {
      console.error('[' + req.method + '] ' + url.pathname + ' 处理失败：' + err.message);
      if (!res.headersSent) { fail(res, err.message === '请求体过大' ? 413 : 400, err.message, 'bad_request'); }
    }
    return;
  }
  fail(res, 404, '接口不存在：' + req.method + ' ' + url.pathname, 'not_found');
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('悦购后端已启动：http://localhost:' + PORT + '/api/health');
    console.log('数据库文件：' + DB_FILE);
    if (SLOW_DELAY_MS > 0) { console.log('已开启演示延迟：每请求 ' + SLOW_DELAY_MS + 'ms'); }
  });
}

module.exports = { server, db, DB_FILE };
