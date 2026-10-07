// 密码哈希与令牌生成：只使用 Node 内置 crypto，不引入第三方依赖。
const crypto = require('node:crypto');

const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, useSalt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return 'scrypt$' + useSalt + '$' + derived;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') { return false; }
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') { return false; }
  return crypto.timingSafeEqual(
    Buffer.from(hashPassword(password, parts[1])),
    Buffer.from(stored)
  );
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, newToken };
