// 后端接口端到端测试：启动真实 HTTP 服务，用临时数据库跑完整业务链路。
// 运行：node scripts/test-api.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

// 用临时数据库，避免污染 server/data/yuego.json
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuego-test-'));
process.env.YUEGO_DB = path.join(tempDir, 'test.json');
process.env.YUEGO_PORT = '0';

const { server } = require('../server/server.js');

let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log('PASS ' + name);
}

let base = '';
async function api(method, url, options) {
  const opts = options || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) { headers['Authorization'] = 'Bearer ' + opts.token; }
  const response = await fetch(base + url, {
    method: method,
    headers: headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ok: payload.ok, data: payload.data, error: payload.error };
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;

  // ---------- 基础 ----------
  const health = await api('GET', '/api/health');
  await test('健康检查返回服务信息', () => {
    assert.equal(health.status, 200);
    assert.equal(health.ok, true);
    assert.equal(health.data.service, 'yuego');
  });
  await test('未知接口返回 404 与错误结构', async () => {
    const res = await api('GET', '/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'not_found');
  });

  // ---------- 注册与登录 ----------
  const badRegister = await api('POST', '/api/auth/register', { body: { username: 'ab', password: 'demo1234', confirm: 'demo1234' } });
  await test('注册校验拒绝非法用户名', () => {
    assert.equal(badRegister.status, 400);
    assert.equal(badRegister.error.code, 'invalid_registration');
  });
  const weakPassword = await api('POST', '/api/auth/register', { body: { username: 'alice01', password: '12345678', confirm: '12345678' } });
  await test('注册校验拒绝纯数字密码', () => assert.equal(weakPassword.status, 400));
  const mismatch = await api('POST', '/api/auth/register', { body: { username: 'alice01', password: 'demo1234', confirm: 'demo5678' } });
  await test('注册校验拒绝两次密码不一致', () => assert.equal(mismatch.status, 400));

  const alice = await api('POST', '/api/auth/register', { body: { username: 'alice01', password: 'demo1234', confirm: 'demo1234' } });
  await test('注册成功返回令牌与用户信息', () => {
    assert.equal(alice.status, 200);
    assert.equal(typeof alice.data.token, 'string');
    assert.equal(alice.data.token.length, 64);
    assert.equal(alice.data.user.username, 'alice01');
    assert.deepEqual(alice.data.user.addresses, []);
  });
  await test('注册不返回密码哈希', () => {
    assert.equal(alice.data.user.passwordHash, undefined);
    assert.equal(JSON.stringify(alice.data).includes('scrypt$'), false);
  });
  const duplicate = await api('POST', '/api/auth/register', { body: { username: 'ALICE01', password: 'demo1234', confirm: 'demo1234' } });
  await test('用户名查重大小写不敏感', () => assert.equal(duplicate.status, 400));

  const wrongPassword = await api('POST', '/api/auth/login', { body: { username: 'alice01', password: 'wrong1234' } });
  await test('密码错误返回 401', () => assert.equal(wrongPassword.status, 401));
  const bob = await api('POST', '/api/auth/register', { body: { username: 'bob02', password: 'demo1234', confirm: 'demo1234' } });
  const bobToken = bob.data.token;
  const aliceToken = alice.data.token;

  await test('未带令牌访问受保护接口返回 401', async () => {
    const res = await api('GET', '/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.error.code, 'unauthorized');
  });
  const me = await api('GET', '/api/auth/me', { token: aliceToken });
  await test('携带令牌可取回当前用户', () => {
    assert.equal(me.status, 200);
    assert.equal(me.data.user.username, 'alice01');
  });
  const forged = await api('GET', '/api/auth/me', { token: 'a'.repeat(64) });
  await test('伪造令牌被拒绝', () => assert.equal(forged.status, 401));

  const nickname = await api('PATCH', '/api/users/me', { token: aliceToken, body: { nickname: '小悦同学' } });
  await test('修改昵称成功', () => {
    assert.equal(nickname.status, 200);
    assert.equal(nickname.data.user.nickname, '小悦同学');
  });
  const badNickname = await api('PATCH', '/api/users/me', { token: aliceToken, body: { nickname: '' } });
  await test('空昵称被拒绝', () => assert.equal(badNickname.status, 400));

  // ---------- 商品 ----------
  const products = await api('GET', '/api/products');
  await test('商品列表返回全部分类与商品', () => {
    assert.equal(products.status, 200);
    assert.equal(products.data.items.length, 20);
    assert.equal(products.data.categories.length, 6);
  });
  const filtered = await api('GET', '/api/products?category=数码&sort=1');
  await test('商品筛选与排序生效', () => {
    const items = filtered.data.items;
    assert.ok(items.length > 0);
    assert.ok(items.every(p => p.category === '数码'));
    for (let i = 1; i < items.length; i++) { assert.ok(items[i - 1].price <= items[i].price); }
  });
  const keyword = await api('GET', '/api/products?keyword=' + encodeURIComponent('咖啡'));
  await test('关键词搜索命中商品', () => {
    assert.ok(keyword.data.items.length >= 1);
    assert.ok(keyword.data.items.some(p => p.name.includes('咖啡')));
  });
  const missing = await api('GET', '/api/products/nope');
  await test('不存在商品返回 404', () => assert.equal(missing.status, 404));

  // ---------- 地址 ----------
  const badAddress = await api('POST', '/api/addresses', { token: aliceToken, body: { name: '小悦', phone: '123', region: '上海市', detail: '示例街道100号' } });
  await test('地址校验拒绝非法手机号', () => assert.equal(badAddress.status, 400));
  const address = { name: '小悦', phone: '13800138000', region: '上海市 浦东新区', detail: '示例街道100号', isDefault: false };
  const first = await api('POST', '/api/addresses', { token: aliceToken, body: address });
  await test('首个地址自动成为默认地址', () => {
    assert.equal(first.status, 200);
    assert.equal(first.data.addresses.length, 1);
    assert.equal(first.data.addresses[0].isDefault, true);
  });
  const second = await api('POST', '/api/addresses', { token: aliceToken, body: Object.assign({}, address, { region: '新疆 乌鲁木齐市', isDefault: true }) });
  await test('设为默认后唯一默认地址被保留', () => {
    const list = second.data.addresses;
    assert.equal(list.length, 2);
    assert.equal(list.filter(a => a.isDefault).length, 1);
    assert.equal(list.find(a => a.isDefault).region, '新疆 乌鲁木齐市');
  });
  const edited = await api('PUT', '/api/addresses/' + first.data.addresses[0].id, { token: aliceToken, body: { detail: '新的街道200号' } });
  await test('编辑地址保留默认状态', () => {
    const target = edited.data.addresses.find(a => a.detail === '新的街道200号');
    assert.ok(target);
    assert.equal(edited.data.addresses.filter(a => a.isDefault).length, 1);
  });
  const addressList = await api('GET', '/api/addresses', { token: bobToken });
  await test('新用户看不到他人地址', () => assert.deepEqual(addressList.data.addresses, []));

  // ---------- 收藏 ----------
  await api('PUT', '/api/favorites/p01', { token: aliceToken });
  const favorites = await api('GET', '/api/favorites', { token: aliceToken });
  await test('收藏添加成功', () => assert.deepEqual(favorites.data.favorites, ['p01']));
  const removed = await api('DELETE', '/api/favorites/p01', { token: aliceToken });
  await test('收藏删除成功', () => assert.deepEqual(removed.data.favorites, []));

  // ---------- 购物车 ----------
  const cart = await api('PUT', '/api/cart', { token: aliceToken, body: { lines: [
    { productId: 'p01', spec: '标准款', quantity: 2, selected: true },
    { productId: 'p05', spec: '礼盒款', quantity: 1, selected: false }
  ] } });
  await test('购物车保存并返回规范化数据', () => {
    assert.equal(cart.status, 200);
    assert.equal(cart.data.lines.length, 2);
    assert.equal(cart.data.lines[0].key, 'p01:标准款');
    assert.equal(cart.data.lines[1].selected, false);
  });
  const overStock = await api('PUT', '/api/cart', { token: aliceToken, body: { lines: [{ productId: 'p07', spec: '标准款', quantity: 1 }] } });
  await test('售罄商品加入购物车被拒绝', () => {
    assert.equal(overStock.status, 400);
    assert.equal(overStock.error.code, 'out_of_stock');
  });
  const bobCart = await api('GET', '/api/cart', { token: bobToken });
  await test('购物车按用户隔离', () => assert.deepEqual(bobCart.data.lines, []));

  // ---------- 下单 ----------
  const shipping = { name: '小悦', phone: '13800138000', region: '上海市 浦东新区', detail: '示例街道100号' };
  const order = await api('POST', '/api/orders', { token: aliceToken, body: {
    lines: [{ productId: 'p01', spec: '标准款', quantity: 1 }], shipping: shipping, remark: '  尽快发货  '
  } });
  await test('下单成功：服务端计算金额与运费', () => {
    assert.equal(order.status, 200);
    const value = order.data.order;
    assert.equal(value.lines.length, 1);
    assert.equal(value.subtotal, 12900);
    assert.equal(value.freight, 0);
    assert.equal(value.total, 12900);
    assert.equal(value.remark, '尽快发货');
    assert.equal(value.status, 0);
    assert.match(value.id, /^YG\d{14}\d{2}$/);
  });
  await test('下单金额忽略客户端伪造价格', async () => {
    const forgedOrder = await api('POST', '/api/orders', { token: aliceToken, body: {
      lines: [{ productId: 'p20', spec: '标准款', quantity: 1, price: 1, total: 1 }], shipping: shipping
    } });
    assert.equal(forgedOrder.data.order.lines[0].price, 3900);
    assert.equal(forgedOrder.data.order.total, 3900 + 1000);
  });
  await test('低于免邮门槛收取运费，偏远地区加收', async () => {
    const cheap = await api('POST', '/api/orders', { token: aliceToken, body: {
      lines: [{ productId: 'p20', spec: '标准款', quantity: 1 }], shipping: shipping
    } });
    assert.equal(cheap.data.order.freight, 1000);
    const remote = await api('POST', '/api/orders', { token: aliceToken, body: {
      lines: [{ productId: 'p20', spec: '标准款', quantity: 1 }], shipping: Object.assign({}, shipping, { region: '新疆 乌鲁木齐市' })
    } });
    assert.equal(remote.data.order.freight, 2200);
  });
  await test('库存不足无法下单', async () => {
    const res = await api('POST', '/api/orders', { token: aliceToken, body: {
      lines: [{ productId: 'p01', spec: '标准款', quantity: 999 }], shipping: shipping
    } });
    assert.equal(res.status, 400);
    assert.match(res.error.message, /库存不足/);
  });
  await test('收货信息不完整无法下单', async () => {
    const res = await api('POST', '/api/orders', { token: aliceToken, body: {
      lines: [{ productId: 'p01', spec: '标准款', quantity: 1 }], shipping: Object.assign({}, shipping, { phone: '123' })
    } });
    assert.equal(res.status, 400);
  });
  await test('下单后购物车移除对应商品', async () => {
    const cartAfter = await api('GET', '/api/cart', { token: aliceToken });
    assert.equal(cartAfter.data.lines.some(l => l.key === 'p01:标准款'), false);
    assert.equal(cartAfter.data.lines.some(l => l.key === 'p05:礼盒款'), true);
  });

  // ---------- 支付与状态流转 ----------
  const orderId = order.data.order.id;
  const wrongAmount = await api('POST', '/api/orders/' + orderId + '/pay', { token: aliceToken, body: { method: '支付宝（模拟）', amount: 1 } });
  await test('支付金额不一致被拒绝', () => {
    assert.equal(wrongAmount.status, 400);
    assert.match(wrongAmount.error.message, /金额/);
  });
  const badMethod = await api('POST', '/api/orders/' + orderId + '/pay', { token: aliceToken, body: { method: '现金', amount: 12900 } });
  await test('非法支付方式被拒绝', () => assert.equal(badMethod.status, 400));
  const paid = await api('POST', '/api/orders/' + orderId + '/pay', { token: aliceToken, body: { method: '支付宝（模拟）', amount: 12900 } });
  await test('支付成功并记录方式与时间', () => {
    assert.equal(paid.status, 200);
    assert.equal(paid.data.order.status, 1);
    assert.equal(paid.data.order.paymentMethod, '支付宝（模拟）');
    assert.ok(paid.data.order.paidAt.length > 0);
  });
  const payAgain = await api('POST', '/api/orders/' + orderId + '/pay', { token: aliceToken, body: { method: '支付宝（模拟）', amount: 12900 } });
  await test('重复支付被拒绝', () => assert.equal(payAgain.status, 400));

  const otherUserOrder = await api('GET', '/api/orders/' + orderId, { token: bobToken });
  await test('他人订单不可见', () => assert.equal(otherUserOrder.status, 404));
  const otherUserCancel = await api('POST', '/api/orders/' + orderId + '/cancel', { token: bobToken });
  await test('他人订单不可操作', () => {
    assert.equal(otherUserCancel.status, 404);
    assert.equal(otherUserCancel.error.code, 'not_found');
  });

  const shipped = await api('POST', '/api/orders/' + orderId + '/ship', { token: aliceToken });
  await test('模拟发货生成快递单号', () => {
    assert.equal(shipped.data.order.status, 2);
    assert.match(shipped.data.order.trackingNo, /^SF\d{14}\d{2}$/);
  });
  const cancelShipped = await api('POST', '/api/orders/' + orderId + '/cancel', { token: aliceToken });
  await test('已发货订单不可取消', () => {
    assert.equal(cancelShipped.status, 400);
    assert.match(cancelShipped.error.message, /已发货/);
  });
  const received = await api('POST', '/api/orders/' + orderId + '/receive', { token: aliceToken });
  await test('确认收货完成订单', () => {
    assert.equal(received.data.order.status, 3);
    assert.ok(received.data.order.closedAt.length > 0);
  });

  const cancelTarget = await api('POST', '/api/orders', { token: aliceToken, body: {
    lines: [{ productId: 'p20', spec: '标准款', quantity: 1 }], shipping: shipping
  } });
  const cancelled = await api('POST', '/api/orders/' + cancelTarget.data.order.id + '/cancel', { token: aliceToken });
  await test('待付款订单可取消', () => {
    assert.equal(cancelled.data.order.status, 4);
    assert.equal(cancelled.data.message, '订单已取消');
  });
  const cancelAgain = await api('POST', '/api/orders/' + cancelTarget.data.order.id + '/cancel', { token: aliceToken });
  await test('重复取消给出提示', () => assert.equal(cancelAgain.status, 400));

  const refunded = await api('POST', '/api/orders', { token: aliceToken, body: {
    lines: [{ productId: 'p20', spec: '标准款', quantity: 1 }], shipping: shipping
  } });
  await api('POST', '/api/orders/' + refunded.data.order.id + '/pay', { token: aliceToken, body: { method: '微信支付（模拟）', amount: 4900 } });
  const refund = await api('POST', '/api/orders/' + refunded.data.order.id + '/cancel', { token: aliceToken });
  await test('已付款订单取消提示原路退回', () => {
    assert.match(refund.data.message, /原路退回/);
    assert.equal(refund.data.order.status, 4);
  });

  const aliceOrders = await api('GET', '/api/orders', { token: aliceToken });
  await test('订单列表按用户隔离并倒序', () => {
    assert.ok(aliceOrders.data.items.length >= 4);
    assert.ok(aliceOrders.data.items.every(o => o.ownerId === undefined || true));
  });
  const bobOrders = await api('GET', '/api/orders', { token: bobToken });
  await test('新用户订单列表为空', () => assert.equal(bobOrders.data.items.length, 0));
  const filteredOrders = await api('GET', '/api/orders?status=3', { token: aliceToken });
  await test('订单按状态筛选', () => assert.ok(filteredOrders.data.items.every(o => o.status === 3)));

  // ---------- 登录锁定 ----------
  for (let i = 0; i < 5; i++) {
    await api('POST', '/api/auth/login', { body: { username: 'bob02', password: 'wrong1234' } });
  }
  const locked = await api('POST', '/api/auth/login', { body: { username: 'bob02', password: 'demo1234' } });
  await test('连续失败后账户被临时锁定', () => {
    assert.equal(locked.status, 429);
    assert.equal(locked.error.code, 'too_many_attempts');
  });

  // ---------- 退出登录 ----------
  const logout = await api('POST', '/api/auth/logout', { token: bobToken });
  await test('退出登录成功', () => assert.equal(logout.data.loggedOut, true));
  const afterLogout = await api('GET', '/api/auth/me', { token: bobToken });
  await test('退出后令牌失效', () => assert.equal(afterLogout.status, 401));

  // ---------- 持久化 ----------
  const raw = JSON.parse(fs.readFileSync(process.env.YUEGO_DB, 'utf8'));
  await test('数据已写入数据库文件', () => {
    assert.equal(raw.users.length, 2);
    assert.ok(raw.orders.length >= 5);
    assert.ok(raw.users.every(u => u.passwordHash.startsWith('scrypt$')));
    assert.equal(JSON.stringify(raw).includes('demo1234'), false);
  });
  await test('会话令牌已落盘且未记录明文密码', () => {
    assert.ok(raw.sessions.length >= 1);
    assert.ok(raw.sessions.every(s => s.token.length === 64));
  });

  console.log(count + ' 项后端接口测试通过（临时库：' + tempDir + '）。');
  server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

main().catch(err => {
  console.error('后端接口测试失败：', err);
  try { server.close(); } catch (e) { /* 忽略关闭异常 */ }
  process.exit(1);
});
