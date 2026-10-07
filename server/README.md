# 悦购后端服务

Node.js 原生实现，**不依赖任何第三方包**，只用内置 `http` / `crypto` / `fs` 模块。

## 启动

```powershell
# 方式一：PowerShell 脚本（推荐）
powershell -ExecutionPolicy Bypass -File .\scripts\server.ps1

# 方式二：直接运行
node server/server.js

# 自定义端口与数据库文件
node server/server.js            # 默认 http://localhost:8787
$env:YUEGO_PORT=8899; node server/server.js
$env:YUEGO_DB='D:\temp\yuego.json'; node server/server.js

# 演示弱网：每个请求延迟 800ms，便于观察 App 的加载状态
$env:YUEGO_DELAY=800; node server/server.js
```

启动后访问 `http://localhost:8787/api/health` 应返回：

```json
{ "ok": true, "data": { "service": "yuego", "time": 1758600000000, "items": 6 } }
```

## 数据存储

数据保存在 `server/data/yuego.json`（可用 `YUEGO_DB` 覆盖）。写入时先写临时文件再原子替换，避免中断损坏。
**该文件包含账户与订单数据，已在 `.gitignore` 中排除，不要提交到仓库。**

## 接口一览

所有响应统一为 `{ "ok": true, "data": {...} }` 或 `{ "ok": false, "error": { "code", "message" } }`。
需要登录的接口通过请求头 `Authorization: Bearer <token>` 鉴权。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 否 | 健康检查，App 用它判断后端是否可用 |
| POST | `/api/auth/register` | 否 | 注册。参数 `username`、`password`、`confirm` |
| POST | `/api/auth/login` | 否 | 登录，返回 `token` 与用户信息 |
| POST | `/api/auth/logout` | 是 | 退出登录，令牌立即失效 |
| GET | `/api/auth/me` | 是 | 取当前用户 |
| PATCH | `/api/users/me` | 是 | 修改昵称。参数 `nickname` |
| GET | `/api/products` | 否 | 商品列表，支持 `keyword`、`category`、`sort`、`under100`、`inStock` |
| GET | `/api/products/:id` | 否 | 商品详情 |
| GET | `/api/favorites` | 是 | 收藏列表 |
| PUT | `/api/favorites/:id` | 是 | 添加收藏 |
| DELETE | `/api/favorites/:id` | 是 | 取消收藏 |
| GET | `/api/addresses` | 是 | 收货地址列表 |
| POST | `/api/addresses` | 是 | 新增地址 |
| PUT | `/api/addresses/:id` | 是 | 修改地址 |
| DELETE | `/api/addresses/:id` | 是 | 删除地址 |
| GET | `/api/cart` | 是 | 购物车 |
| PUT | `/api/cart` | 是 | 覆盖保存购物车（服务端校验库存与数量） |
| DELETE | `/api/cart` | 是 | 清空购物车 |
| GET | `/api/orders` | 是 | 订单列表，支持 `status` 过滤 |
| GET | `/api/orders/:id` | 是 | 订单详情 |
| POST | `/api/orders` | 是 | 下单。省略 `lines` 时结算购物车中勾选的行 |
| POST | `/api/orders/:id/pay` | 是 | 模拟支付，参数 `method`、`amount`（必须与订单金额一致） |
| POST | `/api/orders/:id/cancel` | 是 | 取消订单 |
| POST | `/api/orders/:id/ship` | 是 | 演示发货 |
| POST | `/api/orders/:id/receive` | 是 | 确认收货 |

## 安全与隔离设计

- **密码加盐哈希**：`scrypt`（N=16384, r=8, p=1）+ 每用户随机盐，数据库中不保存明文，接口也从不返回哈希。
- **令牌鉴权**：32 字节随机令牌，有效期 14 天，退出登录后立即失效。
- **失败锁定**：同一用户名连续 5 次密码错误，锁定 5 分钟，返回 429。
- **数据隔离**：购物车、收藏、地址、订单全部按用户 ID 归属；访问他人订单统一返回 404，不泄露订单是否存在。
- **服务端定价**：下单金额、运费一律由服务端按商品单价重算，客户端提交的价格字段被忽略，防止篡改金额。
- **输入校验**：注册、昵称、地址、数量、库存都在服务端重新校验，不信任客户端。
- **请求体上限** 128KB，拒绝超大请求。

## 已知边界（课程演示定位）

- 令牌不做过期续期与设备管理，没有刷新令牌机制。
- 发货接口没有商家身份校验（真实项目应由商家后台调用）。
- 没有 HTTPS、限流、审计日志与并发写入保护；JSON 文件适合单进程演示，不适合生产。
- 商品目录为只读种子数据，没有商家侧的商品管理接口。

## 测试

```powershell
node scripts/test-api.cjs
```

会启动真实 HTTP 服务并使用临时数据库，覆盖注册登录、令牌校验、多用户隔离、购物车校验、下单定价、支付金额校验、状态流转与越权访问等 54 项断言，结束后自动清理临时数据。
