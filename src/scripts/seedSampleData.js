require('dotenv').config();
const { bulkIndexProducts } = require('../services/indexSyncService');
const { checkConnection } = require('../clients/elasticsearch');
const logger = require('../utils/logger');

const sampleProducts = [
  {
    productId: 'prod_001',
    title: 'Apple iPhone 15 Pro Max 256GB 原色钛金属',
    description: '全新 A17 Pro 芯片，钛金属设计，4800 万像素主摄，支持 USB-C 接口',
    category: '手机',
    categoryPath: ['电子产品', '手机通讯', '手机'],
    brand: 'Apple',
    price: 9999,
    originalPrice: 10999,
    salesCount: 15680,
    stock: 500,
    sellerId: 'seller_apple_001',
    sellerName: 'Apple官方旗舰店',
    images: ['https://example.com/iphone15_1.jpg', 'https://example.com/iphone15_2.jpg'],
    tags: ['5G', '旗舰机', '苹果'],
    attributes: [
      { name: '颜色', value: '原色钛金属' },
      { name: '容量', value: '256GB' },
      { name: '屏幕尺寸', value: '6.7英寸' }
    ],
    status: 'active',
    weight: 5.0
  },
  {
    productId: 'prod_002',
    title: '华为 Mate 60 Pro 12GB+512GB 雅丹黑',
    description: '麒麟9000S芯片，卫星通话，超可靠玄武架构，全焦段超清影像',
    category: '手机',
    categoryPath: ['电子产品', '手机通讯', '手机'],
    brand: '华为',
    price: 6999,
    originalPrice: 7499,
    salesCount: 28900,
    stock: 300,
    sellerId: 'seller_huawei_001',
    sellerName: '华为官方旗舰店',
    images: ['https://example.com/mate60_1.jpg'],
    tags: ['5G', '旗舰机', '华为', '卫星通话'],
    attributes: [
      { name: '颜色', value: '雅丹黑' },
      { name: '容量', value: '512GB' },
      { name: '运行内存', value: '12GB' }
    ],
    status: 'active',
    weight: 4.8
  },
  {
    productId: 'prod_003',
    title: '小米14 Ultra 16GB+512GB 黑色',
    description: '徕卡Summilux镜头，骁龙8 Gen3，徕卡全焦段四摄，陶瓷机身',
    category: '手机',
    categoryPath: ['电子产品', '手机通讯', '手机'],
    brand: '小米',
    price: 6499,
    originalPrice: 6999,
    salesCount: 12500,
    stock: 200,
    sellerId: 'seller_xiaomi_001',
    sellerName: '小米官方旗舰店',
    images: ['https://example.com/mi14_1.jpg'],
    tags: ['5G', '旗舰机', '小米', '徕卡'],
    attributes: [
      { name: '颜色', value: '黑色' },
      { name: '容量', value: '512GB' },
      { name: '运行内存', value: '16GB' }
    ],
    status: 'active',
    weight: 4.5
  },
  {
    productId: 'prod_004',
    title: 'Apple MacBook Pro 14英寸 M3 Pro 18GB+512GB',
    description: 'M3 Pro芯片，18小时续航，Liquid Retina XDR显示屏，mini-LED背光',
    category: '笔记本电脑',
    categoryPath: ['电子产品', '电脑办公', '笔记本电脑'],
    brand: 'Apple',
    price: 16999,
    originalPrice: 17999,
    salesCount: 8900,
    stock: 150,
    sellerId: 'seller_apple_001',
    sellerName: 'Apple官方旗舰店',
    images: ['https://example.com/macbook_1.jpg'],
    tags: ['笔记本', '苹果', 'M3芯片', '轻薄本'],
    attributes: [
      { name: '颜色', value: '深空灰' },
      { name: 'CPU', value: 'M3 Pro' },
      { name: '内存', value: '18GB' },
      { name: '存储', value: '512GB SSD' }
    ],
    status: 'active',
    weight: 4.7
  },
  {
    productId: 'prod_005',
    title: '联想 ThinkPad X1 Carbon Gen 11 i7-1365U',
    description: '英特尔13代酷睿，碳纤维机身，军标耐用性，全天候续航',
    category: '笔记本电脑',
    categoryPath: ['电子产品', '电脑办公', '笔记本电脑'],
    brand: '联想',
    price: 12999,
    originalPrice: 14999,
    salesCount: 6500,
    stock: 100,
    sellerId: 'seller_lenovo_001',
    sellerName: '联想官方旗舰店',
    images: ['https://example.com/thinkpad_1.jpg'],
    tags: ['笔记本', '商务本', 'ThinkPad', '轻薄本'],
    attributes: [
      { name: '颜色', value: '黑色' },
      { name: 'CPU', value: 'i7-1365U' },
      { name: '内存', value: '16GB' },
      { name: '存储', value: '512GB SSD' }
    ],
    status: 'active',
    weight: 4.3
  },
  {
    productId: 'prod_006',
    title: '索尼 WH-1000XM5 无线降噪蓝牙耳机 黑色',
    description: '业界领先降噪，30小时续航，Hi-Res Audio认证，多点连接',
    category: '耳机',
    categoryPath: ['电子产品', '音频设备', '耳机'],
    brand: '索尼',
    price: 2699,
    originalPrice: 2999,
    salesCount: 25600,
    stock: 800,
    sellerId: 'seller_sony_001',
    sellerName: '索尼官方旗舰店',
    images: ['https://example.com/wh1000xm5_1.jpg'],
    tags: ['降噪耳机', '蓝牙耳机', '索尼', '无线'],
    attributes: [
      { name: '颜色', value: '黑色' },
      { name: '佩戴方式', value: '头戴式' },
      { name: '续航', value: '30小时' }
    ],
    status: 'active',
    weight: 4.6
  },
  {
    productId: 'prod_007',
    title: 'Apple AirPods Pro 2 主动降噪耳机',
    description: 'H2芯片，主动降噪，自适应通透模式，个性化空间音频',
    category: '耳机',
    categoryPath: ['电子产品', '音频设备', '耳机'],
    brand: 'Apple',
    price: 1899,
    originalPrice: 1999,
    salesCount: 45800,
    stock: 1200,
    sellerId: 'seller_apple_001',
    sellerName: 'Apple官方旗舰店',
    images: ['https://example.com/airpods_1.jpg'],
    tags: ['降噪耳机', '蓝牙耳机', '苹果', 'TWS'],
    attributes: [
      { name: '颜色', value: '白色' },
      { name: '佩戴方式', value: '入耳式' },
      { name: '续航', value: '6小时' }
    ],
    status: 'active',
    weight: 4.8
  },
  {
    productId: 'prod_008',
    title: '戴森 V15 Detect 无线吸尘器',
    description: '激光探测，智能感应，140AW强劲吸力，60分钟续航',
    category: '吸尘器',
    categoryPath: ['家用电器', '清洁电器', '吸尘器'],
    brand: '戴森',
    price: 5490,
    originalPrice: 5990,
    salesCount: 18900,
    stock: 400,
    sellerId: 'seller_dyson_001',
    sellerName: '戴森官方旗舰店',
    images: ['https://example.com/v15_1.jpg'],
    tags: ['无线吸尘器', '戴森', '激光探测', '高端'],
    attributes: [
      { name: '颜色', value: '紫镍色' },
      { name: '续航', value: '60分钟' },
      { name: '吸力', value: '140AW' }
    ],
    status: 'active',
    weight: 4.5
  },
  {
    productId: 'prod_009',
    title: 'iPhone 15 128GB 粉色',
    description: 'A16仿生芯片，灵动岛设计，4800万像素主摄，USB-C接口',
    category: '手机',
    categoryPath: ['电子产品', '手机通讯', '手机'],
    brand: 'Apple',
    price: 5999,
    originalPrice: 6499,
    salesCount: 32500,
    stock: 800,
    sellerId: 'seller_apple_001',
    sellerName: 'Apple官方旗舰店',
    images: ['https://example.com/iphone15_3.jpg'],
    tags: ['5G', '苹果', '粉色'],
    attributes: [
      { name: '颜色', value: '粉色' },
      { name: '容量', value: '128GB' },
      { name: '屏幕尺寸', value: '6.1英寸' }
    ],
    status: 'active',
    weight: 4.6
  },
  {
    productId: 'prod_010',
    title: '华为 MatePad Pro 12.9英寸 12GB+256GB 曜金黑',
    description: '鸿蒙系统，麒麟9000W芯片，12.9英寸OLED屏幕，第二代M-Pencil',
    category: '平板电脑',
    categoryPath: ['电子产品', '电脑办公', '平板电脑'],
    brand: '华为',
    price: 5499,
    originalPrice: 5999,
    salesCount: 15600,
    stock: 350,
    sellerId: 'seller_huawei_001',
    sellerName: '华为官方旗舰店',
    images: ['https://example.com/matepad_1.jpg'],
    tags: ['平板', '华为', '鸿蒙', '生产力工具'],
    attributes: [
      { name: '颜色', value: '曜金黑' },
      { name: '容量', value: '256GB' },
      { name: '运行内存', value: '12GB' },
      { name: '屏幕尺寸', value: '12.9英寸' }
    ],
    status: 'active',
    weight: 4.4
  }
];

async function seed() {
  try {
    logger.info('Starting data seeding...');

    const connected = await checkConnection();
    if (!connected) {
      logger.error('Cannot connect to Elasticsearch. Exiting.');
      process.exit(1);
    }

    const result = await bulkIndexProducts(sampleProducts);

    logger.info(`Data seeding completed: ${result.success} success, ${result.failed} failed`);

    if (result.errors.length > 0) {
      logger.warn('Errors during seeding:', result.errors);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Data seeding failed:', error);
    process.exit(1);
  }
}

seed();
