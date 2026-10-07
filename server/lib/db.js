// 数据库：单文件 JSON，写入时先落临时文件再原子替换，避免写入中断损坏数据。
const fs = require('node:fs');
const path = require('node:path');

const EMPTY = {
  version: 1,
  users: [],      // { id, username, nickname, passwordHash, addresses: [], favorites: [] }
  sessions: [],   // { token, userId, createdAt, expiresAt }
  carts: [],      // { userId, lines: [] }
  orders: []      // 订单结构与 App 端 models/Order.ets 一致
};

class Database {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }
  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Object.assign({}, JSON.parse(JSON.stringify(EMPTY)), parsed);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[db] 读取失败，将以空库启动：' + err.message);
      }
      return JSON.parse(JSON.stringify(EMPTY));
    }
  }
  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    const tmp = this.filePath + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
  userByName(name) {
    const lowered = String(name || '').trim().toLowerCase();
    return this.data.users.find(u => u.username.toLowerCase() === lowered);
  }
  userById(id) { return this.data.users.find(u => u.id === id); }
  cartOf(userId) {
    let cart = this.data.carts.find(c => c.userId === userId);
    if (!cart) { cart = { userId, lines: [] }; this.data.carts.push(cart); }
    return cart;
  }
  ordersOf(userId) { return this.data.orders.filter(o => o.ownerId === userId); }
  orderById(id) { return this.data.orders.find(o => o.id === id); }
}

module.exports = { Database, EMPTY };
