const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('D:/school-2026/DevEco Studio/tools/hvigor/hvigor/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'entry/src/main/ets/repositories/CatalogRepository.ets');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
const { queryProducts, recommendedProducts, formatPrice, CATEGORIES } = mod.exports;
const base = { keyword: '', category: '全部', sort: 0, under100: false, inStock: false };
const query = changes => queryProducts({ ...base, ...changes });
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
test('20 unique products, 5 categories, positive integer prices', () => {
 const all = query({}); assert.equal(all.length, 20); assert.equal(new Set(all.map(p => p.id)).size, 20);
 CATEGORIES.slice(1).forEach(category => assert.equal(query({category}).length,4));
 all.forEach(p => { assert.ok(Number.isInteger(p.price) && p.price > 0); assert.ok(fs.existsSync(path.join(root,'entry/src/main/resources/base/media',p.image.replace('app.media.','')+'.svg'))); });
});
test('keyword trims whitespace and finds product names', () => assert.equal(query({keyword:'  耳机  '})[0].id,'p01'));
test('category and keyword combine', () => { assert.equal(query({category:'数码',keyword:'耳机'}).length,1); assert.equal(query({category:'运动',keyword:'耳机'}).length,0); });
test('no matching keyword returns empty array', () => assert.equal(query({keyword:'不存在的商品XYZ'}).length,0));
test('price and stock filters combine', () => { const result=query({under100:true,inStock:true}); assert.ok(result.length > 0); assert.ok(result.every(p=>p.price<10000 && p.stock>0)); assert.ok(query({}).some(p=>p.stock===0)); });
test('ascending, descending price and sales order', () => { for(const sort of [1,2,3]) { const items=query({sort}); for(let i=1;i<items.length;i++) assert.ok(sort===1 ? items[i-1].price<=items[i].price : sort===2 ? items[i-1].price>=items[i].price : items[i-1].sales>=items[i].sales); } });
test('sorting never mutates default catalog order', () => { const before=query({}).map(p=>p.id);query({sort:2});assert.deepEqual(query({}).map(p=>p.id),before); });
test('recommendations contain 6 in-stock products ordered by sales', () => { const r=recommendedProducts();assert.equal(r.length,6);assert.ok(r.every(p=>p.stock>0));assert.deepEqual(r,query({sort:3,inStock:true}).slice(0,6)); });
test('cent price formatting', () => {assert.equal(formatPrice(12900),'129.00');assert.equal(formatPrice(1),'0.01');});
console.log(`${count} catalog tests passed. UI/device checks remain separate.`);
