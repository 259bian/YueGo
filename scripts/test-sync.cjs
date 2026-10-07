// 数据同步与映射逻辑测试：验证 App 端与服务端之间的结构转换与状态规则。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('D:/school-2026/DevEco Studio/tools/hvigor/hvigor/node_modules/typescript');
function load(relative){const source=fs.readFileSync(path.join(__dirname,'../entry/src/main/ets',relative),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const m={exports:{}};new Function('exports','require','module',code)(m.exports,require,m);return m.exports;}
const sync=load('services/SyncService.ets'),repo=load('repositories/CatalogRepository.ets');
const catalog=repo.queryProducts({keyword:'',category:'全部',sort:0,under100:false,inStock:false});
const lookup=id=>catalog.find(p=>p.id===id);
const product=lookup('p01'),soldOut=lookup('p07');
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const shipping={name:'小悦',phone:'13800138000',region:'上海市 浦东新区',detail:'示例街道100号'};

test('remote cart lines map to local lines with full product',()=>{
  const lines=sync.cartLinesFromRemote([{productId:'p01',spec:'标准款',quantity:2,selected:true},{productId:'p05',spec:'礼盒款',quantity:1}],lookup);
  assert.equal(lines.length,2);
  assert.equal(lines[0].key,'p01:标准款');
  assert.equal(lines[0].product.name,product.name);
  assert.equal(lines[0].quantity,2);
  assert.equal(lines[0].selected,true);
  assert.equal(lines[1].selected,true);
});
test('invalid remote lines are skipped instead of breaking the cart',()=>{
  const lines=sync.cartLinesFromRemote([
    {productId:'missing',spec:'标准款',quantity:1},
    {productId:'p01',spec:'标准款',quantity:0},
    {productId:'p01',spec:'标准款',quantity:1.5},
    {productId:'p01',spec:'标准款',quantity:999},
    {productId:'p01',spec:'标准款',quantity:1,selected:false}
  ],lookup);
  assert.equal(lines.length,1);
  assert.equal(lines[0].selected,false);
});
test('sold-out product from server is dropped',()=>{
  assert.equal(sync.cartLinesFromRemote([{productId:soldOut.id,spec:'标准款',quantity:1}],lookup).length,0);
});
test('local cart lines upload only id, spec, quantity and selection',()=>{
  const lines=sync.cartLinesFromRemote([{productId:'p01',spec:'标准款',quantity:3,selected:true}],lookup);
  const remote=sync.cartLinesToRemote(lines);
  assert.equal(remote.length,1);
  assert.deepEqual(remote[0],{productId:'p01',spec:'标准款',quantity:3,selected:true});
  assert.equal(remote[0].price,undefined);
});
test('remote order lines map into order line shape',()=>{
  const lines=sync.orderLinesFromRemote([{productId:'p01',spec:'标准款',quantity:2}]);
  assert.equal(lines[0].key,'p01:标准款');
  assert.equal(lines[0].productId,'p01');
  assert.equal(lines[0].quantity,2);
  assert.deepEqual(sync.orderLinesFromRemote(undefined),[]);
});
test('remote account maps without a password',()=>{
  const address={id:'a1',name:'小悦',phone:'13800138000',region:'上海市 浦东新区',detail:'示例街道100号',isDefault:true};
  const account=sync.accountFromRemote('alice01','小悦同学',[address]);
  assert.equal(account.username,'alice01');
  assert.equal(account.nickname,'小悦同学');
  assert.equal(account.password,'');
  assert.equal(account.addresses.length,1);
});
test('shipping completeness check matches server rules',()=>{
  assert.equal(sync.shippingComplete(shipping),true);
  assert.equal(sync.shippingComplete({...shipping,name:' '}),false);
  assert.equal(sync.shippingComplete({...shipping,phone:'123'}),false);
  assert.equal(sync.shippingComplete({...shipping,region:'沪'}),false);
  assert.equal(sync.shippingComplete({...shipping,detail:'短'}),false);
});
test('remote action rules match the backend status machine',()=>{
  assert.equal(sync.remoteActionAllowed(0,'pay'),true);
  assert.equal(sync.remoteActionAllowed(1,'pay'),false);
  assert.equal(sync.remoteActionAllowed(0,'cancel'),true);
  assert.equal(sync.remoteActionAllowed(1,'cancel'),true);
  assert.equal(sync.remoteActionAllowed(2,'cancel'),false);
  assert.equal(sync.remoteActionAllowed(1,'ship'),true);
  assert.equal(sync.remoteActionAllowed(2,'ship'),false);
  assert.equal(sync.remoteActionAllowed(2,'receive'),true);
  assert.equal(sync.remoteActionAllowed(3,'receive'),false);
  assert.equal(sync.remoteActionAllowed(0,'unknown'),false);
});
test('orders are grouped by account with guests separated',()=>{
  const base={id:'x',owner:'',status:0,lines:[],shipping,subtotal:0,freight:0,total:0,remark:'',
    paymentMethod:'',trackingNo:'',createdAt:'',paidAt:'',shippedAt:'',closedAt:''};
  const orders=[{...base,id:'1',owner:'alice'},{...base,id:'2',owner:'bob'},{...base,id:'3',owner:'guest'}];
  assert.deepEqual(sync.ordersForAccount(orders,'alice').map(o=>o.id),['1']);
  assert.deepEqual(sync.ordersForAccount(orders,'bob').map(o=>o.id),['2']);
  assert.deepEqual(sync.ordersForAccount(orders,'').map(o=>o.id),['3']);
  assert.deepEqual(sync.ordersForAccount(orders,'nobody'),[]);
});
console.log(count+' sync tests passed. Device UI checks remain separate.');
