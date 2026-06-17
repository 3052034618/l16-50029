# 商品搜索服务 (Product Search Service)

基于 Elasticsearch 的高性能商品搜索服务，支持全文检索、多维筛选、拼写纠错、搜索质量分析等完整功能。

## 功能特性

### 核心搜索功能
- **全文检索**: 基于 Elasticsearch 的多字段全文搜索，支持中文分词（IK 分词器）和拼音搜索
- **多维筛选**: 支持价格区间、分类、品牌、卖家、标签、自定义属性等多维度筛选
- **关键词高亮**: 搜索结果中关键词自动高亮显示
- **拼写纠错**: 基于 Elasticsearch Term/Phrase Suggester + 编辑距离算法的智能纠错
- **搜索建议**: 实时搜索联想，支持商品名、品牌、分类等多种类型
- **排序策略**: 支持按相关度、销量、价格（升序/降序）排序
- **结果折叠**: 支持按卖家或品牌折叠结果，避免同一来源占据过多位置

### 搜索行为分析
- **异步日志**: 搜索行为通过 Bull 队列异步写入分析库，不影响主搜索性能
- **热词统计**: 实时统计热门搜索词，支持按时间窗口计算热词榜
- **无结果词记录**: 用户搜索无结果时自动记录，并推荐相近关键词
- **点击追踪**: 记录用户点击行为，计算搜索点击率

### 搜索质量分析
- **高点击词分析**: 统计高点击率搜索词，辅助优化索引权重
- **零结果词分析**: 展示搜索无结果的高频词，辅助补充商品数据
- **低点击率词分析**: 识别有结果但点击率低的搜索词，辅助优化排序策略
- **质量报告**: 综合搜索质量报告，展示关键指标趋势

### 索引管理
- **增量更新**: 商品上架/更新/下架时实时同步索引
- **软删除**: 删除商品后标记为 deleted 状态，索引文档立即失效
- **批量操作**: 支持批量导入商品数据
- **权重调整**: 支持自定义商品权重，影响搜索排序

## 技术栈

- **服务框架**: Node.js + Express
- **搜索引擎**: Elasticsearch 8.x + IK 分词器 + Pinyin 分析器
- **消息队列**: Bull + Redis
- **缓存存储**: Redis
- **数据验证**: Joi
- **日志管理**: Winston
- **容器化**: Docker + Docker Compose

## 项目结构

```
.
├── src/
│   ├── clients/              # 客户端连接
│   │   ├── elasticsearch.js  # Elasticsearch 客户端
│   │   └── redis.js          # Redis 客户端
│   ├── config/               # 配置管理
│   │   └── index.js
│   ├── controllers/          # API 控制器
│   │   ├── searchController.js
│   │   ├── productController.js
│   │   └── analyticsController.js
│   ├── models/               # 数据模型和索引定义
│   │   ├── index.js          # 索引映射和管理
│   │   └── product.js        # 商品数据验证
│   ├── routes/               # 路由定义
│   │   ├── search.js
│   │   ├── products.js
│   │   ├── analytics.js
│   │   └── health.js
│   ├── services/             # 业务逻辑服务
│   │   ├── searchService.js          # 核心搜索服务
│   │   ├── indexSyncService.js       # 索引同步服务
│   │   ├── analyticsService.js       # 搜索行为分析
│   │   └── qualityAnalysisService.js # 搜索质量分析
│   ├── scripts/              # 工具脚本
│   │   ├── initIndex.js      # 索引初始化
│   │   └── seedSampleData.js # 示例数据导入
│   ├── utils/                # 工具函数
│   │   └── logger.js         # 日志配置
│   └── server.js             # 应用入口
├── docker-compose.yml        # Docker 服务编排
├── package.json
├── .env.example
└── README.md
```

## 快速开始

### 1. 环境要求

- Node.js >= 16.x
- Elasticsearch >= 8.x (需安装 IK 分词器和 Pinyin 分析器插件)
- Redis >= 6.x
- Docker (可选，推荐用于开发环境)

### 2. 使用 Docker 启动依赖服务

```bash
# 启动 Elasticsearch, Kibana, Redis
docker-compose up -d
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，根据实际情况修改配置
```

### 5. 初始化索引

```bash
# 创建所有索引
npm run init-index

# 重新创建商品索引（会删除现有数据）
node src/scripts/initIndex.js --recreate
```

### 6. 导入示例数据

```bash
node src/scripts/seedSampleData.js
```

### 7. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务启动后访问: `http://localhost:3000/api/v1/health`

## API 文档

### 搜索 API

#### 商品搜索
```
GET /api/v1/search/search
```

**请求参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 否 | 搜索关键词 |
| category | string | 否 | 商品分类 |
| brand | array/string | 否 | 品牌筛选，支持多选 |
| minPrice | number | 否 | 最低价格 |
| maxPrice | number | 否 | 最高价格 |
| sortBy | string | 否 | 排序方式: relevance(相关度), sales(销量), price_asc, price_desc |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |
| sellerId | string | 否 | 卖家ID筛选 |
| tags | array/string | 否 | 标签筛选 |
| attributes | json | 否 | 自定义属性筛选，JSON 格式 |
| collapseBy | string | 否 | 结果折叠: none(不折叠), seller(按卖家), brand(按品牌) |
| collapseSize | number | 否 | 每个折叠组显示数量，默认 3 |
| highlight | boolean | 否 | 是否高亮关键词，默认 true |
| userId | string | 否 | 用户ID，用于分析 |
| sessionId | string | 否 | 会话ID，用于分析 |

**响应示例:**
```json
{
  "success": true,
  "data": {
    "total": 128,
    "totalPages": 7,
    "page": 1,
    "pageSize": 20,
    "hasMore": true,
    "results": [
      {
        "productId": "prod_001",
        "title": "<em>Apple</em> iPhone 15 Pro Max",
        "titleHighlight": "<em>Apple</em> iPhone 15 Pro Max",
        "price": 9999,
        "brand": "Apple",
        "category": "手机",
        "_score": 12.5,
        "highlight": {
          "title": ["<em>Apple</em> iPhone 15 Pro Max"]
        }
      }
    ],
    "suggestions": [
      {
        "text": "iphone 15",
        "score": 0.95,
        "type": "spell"
      }
    ],
    "responseTime": 45
  }
}
```

#### 搜索建议
```
GET /api/v1/search/suggest?q=iph
```

#### 拼写检查
```
GET /api/v1/search/spellcheck?q=iphoe
```

#### 获取筛选条件
```
GET /api/v1/search/filters
GET /api/v1/search/filters?q=手机
```

#### 记录商品点击
```
POST /api/v1/search/click
Content-Type: application/json

{
  "query": "iphone",
  "productId": "prod_001",
  "sessionId": "sess_xxx",
  "userId": "user_xxx"
}
```

### 商品管理 API

#### 创建商品
```
POST /api/v1/products
Content-Type: application/json

{
  "productId": "prod_001",
  "title": "Apple iPhone 15 Pro Max",
  "description": "...",
  "category": "手机",
  "brand": "Apple",
  "price": 9999,
  "sellerId": "seller_001",
  "sellerName": "Apple官方旗舰店",
  "status": "active"
}
```

#### 批量创建商品
```
POST /api/v1/products/bulk
Content-Type: application/json

{
  "products": [
    { ... },
    { ... }
  ]
}
```

#### 更新商品
```
PUT /api/v1/products/:productId
Content-Type: application/json

{
  "price": 8999,
  "stock": 100
}
```

#### 删除商品（软删除）
```
DELETE /api/v1/products/:productId
```

#### 永久删除商品
```
DELETE /api/v1/products/:productId?permanent=true
```

#### 获取商品详情
```
GET /api/v1/products/:productId
```

#### 增加销量
```
POST /api/v1/products/:productId/sales
Content-Type: application/json

{
  "increment": 1
}
```

### 分析 API

#### 获取热词榜
```
GET /api/v1/analytics/hotwords?limit=20&windowHours=24
```

#### 获取相似关键词
```
GET /api/v1/analytics/similar?q=iphone
```

#### 获取高点击词
```
GET /api/v1/analytics/high-click-words?startDate=2024-01-01&endDate=2024-01-31
```

#### 获取低点击率词
```
GET /api/v1/analytics/low-click-words?threshold=0.1
```

#### 获取零结果词
```
GET /api/v1/analytics/zero-result-words?days=7
```

#### 获取搜索质量报告
```
GET /api/v1/analytics/quality-report
```

#### 获取搜索统计
```
GET /api/v1/analytics/stats
```

#### 获取搜索趋势
```
GET /api/v1/analytics/trends?days=7
```

## 核心实现说明

### 索引设计

商品索引使用以下字段权重设计：
- `title`: 权重 10
- `brand`: 权重 8
- `category`: 权重 6
- `tags`: 权重 3
- `description`: 权重 2

同时支持拼音搜索和模糊匹配，提升搜索召回率。

### 搜索质量分析

系统自动计算以下指标：
- **点击率 (CTR)**: 点击次数 / 搜索次数
- **零结果率**: 无结果搜索次数 / 总搜索次数
- **平均点击次数**: 每次搜索的平均点击商品数
- **平均响应时间**: 搜索接口平均耗时

### 热词统计

热词按小时维度存储在 Elasticsearch 中，通过聚合查询实时计算指定时间窗口内的热门搜索词。

### 结果折叠

使用 Elasticsearch 的 Collapse 功能实现按卖家或品牌的结果折叠，每个折叠组内显示 top N 个商品。

## 性能优化建议

1. **索引层面**:
   - 合理设置分片数（推荐 3-5 个主分片）
   - 定期执行 force merge 优化段文件
   - 使用 index sorting 预排序数据

2. **查询层面**:
   - 设置合理的 timeout 防止慢查询
   - 使用 search_after 实现深度分页
   - 缓存高频查询的热词结果

3. **资源层面**:
   - Elasticsearch 配置足够的堆内存（建议 8GB+）
   - 开启慢查询日志监控
   - 使用连接池管理 Elasticsearch 连接

## 监控与运维

### 健康检查
```
GET /api/v1/health
```

### 关键指标监控
- 搜索接口响应时间 (P50/P95/P99)
- 搜索成功率
- 索引同步延迟
- 队列堆积情况
- Elasticsearch 集群健康状态

### 日志
日志文件存储在 `logs/` 目录下：
- `error.log`: 错误日志
- `combined.log`: 完整日志

## License

MIT
