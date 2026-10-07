// 订单逻辑：与 App 端 services/OrderService.ets 保持同一套规则，
// 保证服务器校验与客户端展示一致（运费、金额、状态流转）。
const { productById } = require('./catalog');

const STATUS = {
  pendingPayment: 0,
  paid: 1,
  shipped: 2,
  completed: 3,
  cancelled: 4
};

const FREE_FREIGHT_THRESHOLD = 9900;
const BASE_FREIGHT = 1000;
const REMOTE_FREIGHT = 1200;
const REMOTE_REGIONS = ['新疆', '西藏', '内蒙古', '青海', '宁夏', '甘肃', '海南'];

function isRemoteRegion(region) {
  return REMOTE_REGIONS.some(name => String(region || '').includes(name));
}
function freightFor(subtotal, region) {
  if (subtotal <= 0) { return 0; }
  if (subtotal >= FREE_FREIGHT_THRESHOLD) { return 0; }
  return BASE_FREIGHT + (isRemoteRegion(region) ? REMOTE_FREIGHT : 0);
}
function validateShipping(info) {
  const name = String((info && info.name) || '').trim();
  const phone = String((info && info.phone) || '').trim();
  const region = String((info && info.region) || '').trim();
  const detail = String((info && info.detail) || '').trim();
  if (name.length < 1 || name.length > 20) { return '收货人需为 1–20 个字符'; }
  if (!/^1[3-9][0-9]{9}$/.test(phone)) { return '请输入有效的 11 位手机号码'; }
  if (region.length < 2 || region.length > 60) { return '请填写省、市、区，长度 2–60 个字符'; }
  if (detail.length < 5 || detail.length > 100) { return '详细地址需为 5–100 个字符'; }
  return '';
}
function linesAmount(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}
function linesCount(lines) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

// 由服务器根据商品真实价格重新计算金额，不信任客户端传来的价格。
function buildOrderLines(cartLines) {
  const lines = [];
  for (const line of cartLines) {
    const product = productById(line.productId);
    if (!product) { return { error: '商品不存在：' + line.productId }; }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) { return { error: '商品数量不正确' }; }
    if (line.quantity > product.stock) {
      return { error: product.name + ' 库存不足，仅剩 ' + product.stock + ' 件' };
    }
    lines.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      spec: String(line.spec || ''),
      price: product.price,
      quantity: line.quantity
    });
  }
  if (lines.length === 0) { return { error: '请先选择要购买的商品' }; }
  return { lines };
}

function createOrder(input) {
  const built = buildOrderLines(input.lines || []);
  if (built.error) { return { error: built.error }; }
  const shipping = input.shipping || {};
  const problem = validateShipping(shipping);
  if (problem) { return { error: problem }; }
  const subtotal = linesAmount(built.lines);
  const region = String(shipping.region || '') + ' ' + String(shipping.detail || '');
  const freight = freightFor(subtotal, region);
  const now = Date.now();
  const order = {
    id: 'YG' + formatCompact(now) + String(Math.floor(Math.random() * 90) + 10),
    ownerId: input.ownerId,
    status: STATUS.pendingPayment,
    lines: built.lines,
    shipping: {
      name: String(shipping.name).trim(),
      phone: String(shipping.phone).trim(),
      region: String(shipping.region).trim(),
      detail: String(shipping.detail).trim()
    },
    subtotal,
    freight,
    total: subtotal + freight,
    remark: String(input.remark || '').trim().slice(0, 50),
    paymentMethod: '',
    trackingNo: '',
    createdAt: formatTime(now),
    paidAt: '',
    shippedAt: '',
    closedAt: ''
  };
  return { order };
}

function payOrder(order, method, amount, note) {
  if (order.status !== STATUS.pendingPayment) {
    return { error: order.status === STATUS.cancelled ? '订单已取消，无法支付' : '订单已支付，请勿重复付款' };
  }
  const METHODS = ['支付宝（模拟）', '微信支付（模拟）', '银行卡（模拟）'];
  if (!METHODS.includes(method)) { return { error: '请选择支付方式' }; }
  if (!Number.isInteger(amount) || amount !== order.total) { return { error: '支付金额与订单金额不一致，已终止本次支付' }; }
  order.status = STATUS.paid;
  order.paymentMethod = method;
  order.paidAt = note || formatTime(Date.now());
  return { order };
}
function cancelOrder(order, note) {
  if (order.status === STATUS.cancelled) { return { error: '订单已取消' }; }
  if (order.status === STATUS.shipped || order.status === STATUS.completed) { return { error: '订单已发货，暂不支持取消' }; }
  const refund = order.status === STATUS.paid;
  order.status = STATUS.cancelled;
  order.closedAt = note || formatTime(Date.now());
  return { order, message: refund ? '订单已取消，款项将原路退回' : '订单已取消' };
}
function shipOrder(order, note) {
  if (order.status !== STATUS.paid) { return { error: '仅已付款订单可发货' }; }
  const now = note || formatTime(Date.now());
  order.status = STATUS.shipped;
  order.trackingNo = 'SF' + formatCompact(Date.now()) + String(Math.floor(Math.random() * 90) + 10);
  order.shippedAt = now;
  return { order };
}
function confirmReceipt(order, note) {
  if (order.status !== STATUS.shipped) { return { error: '订单当前不可确认收货' }; }
  order.status = STATUS.completed;
  order.closedAt = note || formatTime(Date.now());
  return { order };
}

function formatCompact(timestamp) {
  const d = new Date(timestamp);
  const pad = v => (v < 10 ? '0' + v : String(v));
  return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = v => (v < 10 ? '0' + v : String(v));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

module.exports = {
  STATUS, FREE_FREIGHT_THRESHOLD, BASE_FREIGHT,
  isRemoteRegion, freightFor, validateShipping, linesAmount, linesCount,
  createOrder, payOrder, cancelOrder, shipOrder, confirmReceipt, formatTime, formatCompact
};
