const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('D:/school-2026/DevEco Studio/tools/hvigor/hvigor/node_modules/typescript');
function load(relative){const source=fs.readFileSync(path.join(__dirname,'../entry/src/main/ets',relative),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const m={exports:{}};new Function('exports','require','module',code)(m.exports,require,m);return m.exports;}
const s=load('services/OrderService.ets'),shop=load('services/ShoppingService.ets'),repo=load('repositories/CatalogRepository.ets'),model=load('models/Order.ets');
const catalog=repo.queryProducts({keyword:'',category:'全部',sort:0,under100:false,inStock:false});
const cheap=catalog.find(p=>p.price<5000),pricey=catalog.find(p=>p.price>10000);
const st=model.OrderStatus,shipping={name:'小悦',phone:'13800138000',region:'上海市 浦东新区',detail:'示例街道100号'};
const remote={name:'小悦',phone:'13800138000',region:'新疆 乌鲁木齐市',detail:'示例街道100号'};
const T='2026-09-22 14:05:07';
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const cartOf=(product,quantity)=>({key:product.id+':标准款',product,spec:'标准款',quantity,selected:true});
const draftOf=(lines,info=shipping)=>{const r=s.buildDraft(lines,info,'测试备注');assert.ok(r.draft,'期望生成草稿');return r.draft;};

test('freight rule: below 99 charges 10, at or above 99 is free',()=>{
  assert.equal(s.freightFor(0,'上海市'),0);
  assert.equal(s.freightFor(9800,'上海市'),1000);
  assert.equal(s.freightFor(9900,'上海市'),0);
  assert.equal(s.freightFor(20000,'上海市'),0);
});
test('remote regions add surcharge under the free threshold',()=>{
  assert.equal(s.isRemoteRegion('新疆 乌鲁木齐市'),true);
  assert.equal(s.isRemoteRegion('上海市 浦东新区'),false);
  assert.equal(s.freightFor(5000,'新疆 乌鲁木齐市'),2200);
  assert.equal(s.freightFor(12000,'西藏 拉萨市'),0);
});
test('freight hint reflects threshold',()=>{
  assert.equal(s.freightHint(3900,'上海市'),'再买 60.00 元免运费');
  assert.equal(s.freightHint(9900,'上海市'),'已满 99 元，免运费');
  assert.equal(s.freightHint(0,'上海市'),'未选择商品');
});
test('draft only includes selected lines and totals are exact',()=>{
  const lines=[cartOf(cheap,1),{...cartOf(pricey,2),selected:false,key:'x:标准款'}];
  const d=draftOf(lines);
  assert.equal(d.lines.length,1);
  assert.equal(d.subtotal,cheap.price);
  assert.equal(d.freight,cheap.price>=9900?0:1000);
  assert.equal(d.total,d.subtotal+d.freight);
  assert.equal(d.remark,'测试备注');
});
test('draft requires selection, valid address and trims remark',()=>{
  const lines=[{...cartOf(cheap,1),selected:false}];
  assert.ok(s.buildDraft(lines,shipping,'').message);
  assert.ok(s.buildDraft([cartOf(cheap,1)],{...shipping,phone:'123'},'').message);
  assert.ok(s.buildDraft([cartOf(cheap,1)],{...shipping,detail:'短'},'').message);
  const d=draftOf([cartOf(cheap,1)]);
  assert.equal(s.buildDraft([cartOf(cheap,1)],shipping,'x'.repeat(80)).draft.remark.length,50);
  assert.equal(d.remark.length,4);
});
test('stock validation blocks sold-out and over-quantity lines',()=>{
  const stocks=new Map([[cheap.id,cheap.stock]]);
  assert.equal(s.validateCartLines([cartOf(cheap,1)],stocks),'');
  assert.ok(s.validateCartLines([{...cartOf(cheap,1),selected:false}],stocks).length>0);
  assert.ok(s.validateCartLines([cartOf(cheap,cheap.stock+1)],stocks).includes('库存不足'));
  assert.equal(s.validateCartLines([cartOf(cheap,1)],new Map()),'');
});
test('order creation keeps a snapshot, status and sequence in the id',()=>{
  const d=draftOf([cartOf(pricey,2)]);
  const o=s.createOrder(d,3,'20260922140507','yue123');
  assert.equal(o.id,'YG2026092214050703');
  assert.equal(o.status,st.pendingPayment);
  assert.equal(o.owner,'yue123');
  assert.equal(o.total,d.total);
  assert.equal(o.paymentMethod,'');
  assert.equal(o.lines[0].price,pricey.price);
  assert.equal(s.createOrder(d,12,'20260922140507','').owner,'guest');
  assert.equal(s.createOrder(d,12,'20260922140507','').id,'YG2026092214050712');
});
test('payment requires matching order, pending status, method and exact amount',()=>{
  const o=s.createOrder(draftOf([cartOf(pricey,1)]),1,'20260922140507','yue123');
  assert.equal(s.payOrder([o],'missing','支付宝（模拟）',o.total,T).action,undefined);
  assert.ok(s.payOrder([o],o.id,'',o.total,T).action.message.includes('支付方式'));
  assert.ok(s.payOrder([o],o.id,'支付宝（模拟）','',T).action.message.includes('不一致'));
  assert.ok(s.payOrder([o],o.id,'未知渠道',o.total,T).action.message.includes('支付方式'));
  assert.ok(s.payOrder([o],o.id,'支付宝（模拟）',o.total-1,T).action.message.includes('不一致'));
  assert.ok(!s.payOrder([o],o.id,'支付宝（模拟）',o.total+1,T).action.success);
  const paid=s.payOrder([o],o.id,'支付宝（模拟）',o.total,T);
  assert.equal(paid.action.success,true);
  assert.equal(paid.order.status,st.paid);
  assert.equal(paid.order.paymentMethod,'支付宝（模拟）');
  assert.equal(paid.order.paidAt,T);
  assert.ok(!s.payOrder([paid.order],o.id,'支付宝（模拟）',o.total,T).action.success);
});
test('paid orders keep total and owner after status changes',()=>{
  const o=s.createOrder(draftOf([cartOf(pricey,2)]),2,'20260922140507','yue123');
  const paid=s.payOrder([o],o.id,'微信支付（模拟）',o.total,T).order;
  const shipped=s.shipOrder([paid],o.id,'SF2026092202',T).order;
  assert.equal(shipped.owner,'yue123');
  assert.equal(shipped.total,o.total);
  assert.equal(shipped.lines.length,o.lines.length);
  const done=s.confirmReceipt([shipped],o.id,T).order;
  assert.equal(done.status,st.completed);
  assert.equal(done.owner,'yue123');
  assert.equal(done.closedAt,T);
});
test('orders can be cancelled before shipping only',()=>{
  const o=s.createOrder(draftOf([cartOf(pricey,1)]),1,'20260922140507','yue123');
  const cancelled=s.cancelOrder([o],o.id,T);
  assert.equal(cancelled.order.status,st.cancelled);
  assert.equal(cancelled.order.closedAt,T);
  assert.ok(!s.cancelOrder([cancelled.order],o.id,T).action.success);
  assert.equal(s.cancelOrder([o],'missing',T).action,undefined);
  const paid=s.payOrder([o],o.id,'支付宝（模拟）',o.total,T).order;
  assert.ok(s.cancelOrder([paid],o.id,T).action.message.includes('原路退回'));
  const shipped=s.shipOrder([paid],o.id,'SF2026092201',T).order;
  assert.ok(!s.cancelOrder([shipped],o.id,T).action.success);
  const done=s.confirmReceipt([shipped],o.id,T).order;
  assert.ok(!s.cancelOrder([done],o.id,T).action.success);
});
test('shipping and receipt follow the status chain',()=>{
  const o=s.createOrder(draftOf([cartOf(pricey,1)]),1,'20260922140507','yue123');
  assert.ok(!s.shipOrder([o],o.id,'SF1',T).action.success);
  const paid=s.payOrder([o],o.id,'银行卡（模拟）',o.total,T).order;
  const res=s.shipOrder([paid],o.id,'SF2026092201',T);
  assert.equal(res.order.status,st.shipped);
  assert.equal(res.order.trackingNo,'SF2026092201');
  assert.ok(!s.shipOrder([res.order],o.id,'SF2',T).action.success);
  assert.ok(!s.confirmReceipt([paid],o.id,T).action.success);
  assert.equal(s.confirmReceipt([res.order],o.id,T).order.status,st.completed);
});
test('paid cart lines are removed and unselected lines survive',()=>{
  let lines=shop.addToCart([],cheap,'标准款',1).lines;
  lines=shop.addToCart(lines,pricey,'标准款',1).lines;
  lines=shop.selectLine(lines,lines[1].key,false);
  const d=draftOf(lines);
  const rest=s.removeOrderedLines(lines,d);
  assert.equal(rest.length,1);
  assert.equal(rest[0].product.id,pricey.id);
  assert.deepEqual(s.removeOrderedLines(lines,s.buildDraft(lines,{...shipping,name:''},'').draft||d),rest);
});
test('filters, counters and helpers report correct values',()=>{
  const draft=draftOf([cartOf(pricey,2),{...cartOf(cheap,1),key:'c:标准款'}]);
  const o=s.createOrder(draft,1,'20260922140507','yue123');
  const paid=s.payOrder([o],o.id,'支付宝（模拟）',o.total,T).order;
  const shipped=s.shipOrder([paid],o.id,'SF1',T).order;
  const cancelled=s.cancelOrder([o],'YG2026092214050702',T);
  assert.equal(cancelled.order,undefined);
  const doomed=s.createOrder(draft,2,'20260922140507','yue123');
  const closed=s.cancelOrder([doomed],doomed.id,T).order;
  const list=[o,paid,shipped,closed];
  assert.equal(s.filterOrders(list,'all').length,4);
  assert.equal(s.filterOrders(list,'unpaid').length,1);
  assert.equal(s.filterOrders(list,'undelivered').length,1);
  assert.equal(s.filterOrders(list,'shipped').length,1);
  assert.equal(s.filterOrders(list,'done').length,1);
  assert.equal(s.filterLabel('undelivered'),'待发货');
  assert.equal(s.orderCount(list),4);
  assert.equal(s.orderLinesCount(shipped),3);
  assert.equal(s.orderLinesAmount(shipped),draft.subtotal);
  assert.equal(s.canPay(o),true);
  assert.equal(s.canCancel(paid),true);
  assert.equal(s.canShip(paid),true);
  assert.equal(s.canConfirm(shipped),true);
  assert.equal(s.isClosed(closed),true);
});
test('orders are isolated per account and tracking numbers are formatted',()=>{
  const draft=draftOf([cartOf(cheap,1)]);
  const a=s.createOrder(draft,1,'20260922140507','yue123');
  const b=s.createOrder(draft,1,'20260922140508','other');
  const guest=s.createOrder(draft,2,'20260922140508','');
  const all=[a,b,guest];
  assert.deepEqual(s.ordersOf(all,'yue123').map(o=>o.id),[a.id]);
  assert.deepEqual(s.ordersOf(all,'other').map(o=>o.id),[b.id]);
  assert.deepEqual(s.ordersOf(all,'').map(o=>o.id),[guest.id]);
  assert.deepEqual(s.ordersOf(all,'nobody'),[]);
  assert.equal(s.mockTrackingNo(7,'2026-09-22'),'SF2026092207');
  assert.equal(s.mockTrackingNo(12,'2026-09-22'),'SF2026092212');
  assert.equal(model.maskedPhone('13800138000'),'138****8000');
  assert.equal(model.maskedPhone('12345'),'12345');
  assert.equal(model.statusLabel(st.shipped),'已发货');
  assert.equal(model.statusLabel(99),'未知状态');
  assert.equal(s.paymentLabel(''),'未支付');
});
test('order operations never mutate the input arrays',()=>{
  const draft=draftOf([cartOf(pricey,1)]);
  const o=s.createOrder(draft,1,'20260922140507','yue123');
  const list=[o];
  const snapshot=JSON.stringify(list);
  s.payOrder(list,o.id,'支付宝（模拟）',o.total,T);
  s.cancelOrder(list,o.id,T);
  s.shipOrder(list,o.id,'SF1',T);
  s.confirmReceipt(list,o.id,T);
  s.applyResult(list,s.cancelOrder(list,o.id,T));
  assert.equal(JSON.stringify(list),snapshot);
  assert.equal(o.status,st.pendingPayment);
  const draftSnapshot=JSON.stringify(draft);
  s.createOrder(draft,9,'20260922140507','yue123');
  assert.equal(JSON.stringify(draft),draftSnapshot);
});
test('time formatting is zero padded',()=>{
  assert.equal(s.formatTime(new Date(2026,8,22,14,5,7).getTime()),'2026-09-22 14:05:07');
  assert.equal(s.formatTime(new Date(2026,0,3,0,0,0).getTime()),'2026-01-03 00:00:00');
});
console.log(count+' order tests passed. Device UI checks remain separate.');
