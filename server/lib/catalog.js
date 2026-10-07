// 商品目录：与 App 端 repositories/CatalogRepository.ets 保持一致，共 20 件演示商品。
// 真实项目中应由数据库提供，这里作为后端只读种子数据。
const PRODUCTS = [
  {
    id: "p01",
    name: "轻享无线耳机",
    category: "数码",
    description: "轻巧实用，为日常增加便利",
    price: 12900,
    sales: 200,
    stock: 12,
    image: "app.media.p01",
    tag: "人气好物"
  },
  {
    id: "p02",
    name: "便携蓝牙音箱",
    category: "数码",
    description: "轻巧实用，为日常增加便利",
    price: 19900,
    sales: 337,
    stock: 15,
    image: "app.media.p02",
    tag: "精选推荐"
  },
  {
    id: "p03",
    name: "磁吸充电宝",
    category: "数码",
    description: "轻巧实用，为日常增加便利",
    price: 15900,
    sales: 474,
    stock: 18,
    image: "app.media.p03",
    tag: "日常优选"
  },
  {
    id: "p04",
    name: "桌面手机支架",
    category: "数码",
    description: "轻巧实用，为日常增加便利",
    price: 3900,
    sales: 611,
    stock: 21,
    image: "app.media.p04",
    tag: "日常优选"
  },
  {
    id: "p05",
    name: "云感陶瓷马克杯",
    category: "家居",
    description: "温柔质感，装点舒适空间",
    price: 4900,
    sales: 748,
    stock: 24,
    image: "app.media.p05",
    tag: "人气好物"
  },
  {
    id: "p06",
    name: "暖光阅读台灯",
    category: "家居",
    description: "温柔质感，装点舒适空间",
    price: 12900,
    sales: 885,
    stock: 27,
    image: "app.media.p06",
    tag: "精选推荐"
  },
  {
    id: "p07",
    name: "柔软针织抱枕",
    category: "家居",
    description: "温柔质感，装点舒适空间",
    price: 6900,
    sales: 1022,
    stock: 0,
    image: "app.media.p07",
    tag: "日常优选"
  },
  {
    id: "p08",
    name: "简约收纳篮",
    category: "家居",
    description: "温柔质感，装点舒适空间",
    price: 3900,
    sales: 1159,
    stock: 33,
    image: "app.media.p08",
    tag: "日常优选"
  },
  {
    id: "p09",
    name: "纯棉基础T恤",
    category: "服饰",
    description: "自在穿搭，适合每一天",
    price: 7900,
    sales: 1296,
    stock: 36,
    image: "app.media.p09",
    tag: "人气好物"
  },
  {
    id: "p10",
    name: "轻便帆布手提袋",
    category: "服饰",
    description: "自在穿搭，适合每一天",
    price: 5900,
    sales: 1433,
    stock: 39,
    image: "app.media.p10",
    tag: "精选推荐"
  },
  {
    id: "p11",
    name: "日常休闲棒球帽",
    category: "服饰",
    description: "自在穿搭，适合每一天",
    price: 4900,
    sales: 1570,
    stock: 42,
    image: "app.media.p11",
    tag: "日常优选"
  },
  {
    id: "p12",
    name: "舒适棉袜三双装",
    category: "服饰",
    description: "自在穿搭，适合每一天",
    price: 2900,
    sales: 1707,
    stock: 45,
    image: "app.media.p12",
    tag: "日常优选"
  },
  {
    id: "p13",
    name: "每日混合坚果",
    category: "美食",
    description: "分享美味，享受闲暇时光",
    price: 5900,
    sales: 1844,
    stock: 48,
    image: "app.media.p13",
    tag: "人气好物"
  },
  {
    id: "p14",
    name: "挂耳咖啡礼盒",
    category: "美食",
    description: "分享美味，享受闲暇时光",
    price: 8900,
    sales: 1981,
    stock: 51,
    image: "app.media.p14",
    tag: "精选推荐"
  },
  {
    id: "p15",
    name: "低糖燕麦饼干",
    category: "美食",
    description: "分享美味，享受闲暇时光",
    price: 3500,
    sales: 318,
    stock: 0,
    image: "app.media.p15",
    tag: "日常优选"
  },
  {
    id: "p16",
    name: "茉莉花茶礼袋",
    category: "美食",
    description: "分享美味，享受闲暇时光",
    price: 6900,
    sales: 455,
    stock: 57,
    image: "app.media.p16",
    tag: "日常优选"
  },
  {
    id: "p17",
    name: "轻量运动水壶",
    category: "运动",
    description: "轻松运动，保持生活活力",
    price: 4900,
    sales: 592,
    stock: 60,
    image: "app.media.p17",
    tag: "人气好物"
  },
  {
    id: "p18",
    name: "防滑瑜伽垫",
    category: "运动",
    description: "轻松运动，保持生活活力",
    price: 9900,
    sales: 729,
    stock: 63,
    image: "app.media.p18",
    tag: "精选推荐"
  },
  {
    id: "p19",
    name: "便携训练跳绳",
    category: "运动",
    description: "轻松运动，保持生活活力",
    price: 2900,
    sales: 866,
    stock: 66,
    image: "app.media.p19",
    tag: "日常优选"
  },
  {
    id: "p20",
    name: "运动速干毛巾",
    category: "运动",
    description: "轻松运动，保持生活活力",
    price: 3900,
    sales: 1003,
    stock: 69,
    image: "app.media.p20",
    tag: "日常优选"
  }
];

const CATEGORIES = ['全部', '数码', '家居', '服饰', '美食', '运动'];

function queryProducts(filter) {
  const keyword = String((filter && filter.keyword) || '').trim().toLowerCase();
  const category = (filter && filter.category) || '全部';
  const sort = Number((filter && filter.sort) || 0);
  const under100 = Boolean(filter && filter.under100);
  const inStock = Boolean(filter && filter.inStock);
  const result = PRODUCTS.filter(item =>
    (category === '全部' || item.category === category) &&
    (keyword.length === 0 || (item.name + ' ' + item.category + ' ' + item.description).toLowerCase().includes(keyword)) &&
    (!under100 || item.price < 10000) && (!inStock || item.stock > 0));
  if (sort === 1) { result.sort((a, b) => a.price - b.price); }
  if (sort === 2) { result.sort((a, b) => b.price - a.price); }
  if (sort === 3) { result.sort((a, b) => b.sales - a.sales); }
  return result;
}

function productById(id) { return PRODUCTS.find(p => p.id === id); }

module.exports = { PRODUCTS, CATEGORIES, queryProducts, productById };
