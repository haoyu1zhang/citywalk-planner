# CityWalk Planner · 城市漫步路线生成器

选一个城市、步行时长、主题和起点,生成一条**能走完、不绕路**的漫步路线:咖啡馆、公园、书店、景点串成一条线,画在地图上,可以删站、换一条、分享链接、导出 GeoJSON。

所有地点和路径都来自 OpenStreetMap 的真实数据(Overpass + OSRM),没有任何坐标是模型生成的。

> 在线 demo:<https://citywalk-planner-pi.vercel.app>

| 首页(375px) | 路线结果 | 桌面端 |
| --- | --- | --- |
| ![首页](docs/home-mobile.png) | ![路线](docs/route-mobile.png) | ![桌面](docs/route-desktop.png) |

> 截图是占位:部署后按 [docs/README.md](docs/README.md) 的说明截图或录 GIF 放进 `docs/`。

## 功能

- 5 个预设城市(罗马、佛罗伦萨、米兰、威尼斯、博洛尼亚),起点可以搜地标或直接点地图
- 时长 30 / 60 / 90 / 120 分钟,主题:经典、咖啡、文艺、公园、拍照、雨天
- 地图上显示编号站点和真实步行路径,列表里有类别、建议停留时间和 OSM 链接
- 总距离、步行时间(按 4.5 km/h)、总停留时间
- 删除站点、换一条(同一个链接永远得到同一条路线)
- 分享:链接里带着完整参数和站点 ID,打开即复现;导出 GeoJSON
- **约会模式**:不用选主题,按“甜品或咖啡 → 散步 → 看风景 → 晚餐或小酌”的节奏排一条两个人的路线;“帮我们决定”每点一次换一条
- **附近的线下活动**:在路线页按时间(今天 / 本周末 / 7 天 / 30 天)、类别和关键词查找活动,一键加入路线(自动插在最顺路的位置),分享链接里也带着
- **三种语言**:中文、English、Italiano,默认跟随浏览器语言,可在页面右上角切换
- 外部服务出问题时不白屏:Overpass 不可用 → 内置数据快照;路由不可用 → 直线连接;都会明确提示

## 技术栈

Next.js 15(App Router)· TypeScript strict · Tailwind CSS v4 + shadcn/ui 风格组件 · react-leaflet · Zod · Vitest · Playwright

核心功能不需要任何 API key。活动功能需要一个免费的 Ticketmaster key(见下文),没配置时这一块会说明原因,其余功能不受影响。

## 本地运行

```bash
npm install
npm run dev            # http://localhost:3000

npm run lint
npm run typecheck
npm test               # 单元测试
npm run test:e2e       # 1 条关键路径 E2E(离线模式,不访问公共 API)
npm run build
```

第一次跑 E2E 需要 `npx playwright install chromium`;也可以用 `PW_CHROME_PATH=/path/to/chrome` 复用本机的 Chrome。

没有网络时用 `CITYWALK_OFFLINE=1 npm run dev`,只使用内置数据。环境变量见 [.env.example](.env.example),全部可选。

## 架构

```
app/
  page.tsx              首页:表单 + 选起点的地图
  route/page.tsx        结果页:地图 + 站点列表 + 分享/导出
  api/route/route.ts    POST /api/route
  api/geocode/route.ts  GET  /api/geocode?q=
  api/events/route.ts   GET  /api/events
components/             PlannerForm, RouteView, EventsPanel, LanguageSwitcher, MapView(仅客户端加载), ui/
lib/
  schemas.ts            所有 Zod schema(请求、响应、POI)
  themes.ts             主题 → 类别 → OSM 标签,以及全部可调常数
  http.ts               fetch 封装:超时、有限重试、内存缓存、User-Agent
  providers/            overpass / osrm / nominatim / ticketmaster / fixtures,统一接口,可替换
  route/
    candidates.ts       过滤:类别、无名、过远、重复
    score.ts            候选评分
    order.ts            最近邻 + 2-opt
    plan.ts             选点 → 排序 → 贴合目标距离(纯函数,无 I/O)
    date.ts             约会模式:按槽位排出一条有节奏的路线
    service.ts          编排:取数据 → 规划 → 真实路由 → 降级
  share.ts, geojson.ts  URL 编解码、GeoJSON 导出
  events.ts             活动的日期范围、日期格式、最顺路的插入位置
  i18n/                 三种语言的字典、语言协商、服务端读取 cookie
  fixtures/             预设城市的真实 Overpass 数据快照
types/                  由 Zod schema 推导出的类型
tests/unit, tests/e2e
```

请求流程:

```
POST /api/route ─ Zod 校验
  ├─ 有 stopIds(分享链接)→ 按 ID 取回这些站点,保持顺序
  └─ 否则 Overpass 查询 →(失败则用 fixture)→ planRoute()
        filter → 贪心选点(评分)→ 最近邻 → 2-opt → 按目标距离增删站点
  → OSRM 步行路由(1 次请求;超过 1.5× 上限则删站重试,最多 3 次)
  → 失败则直线 + 提示
```

### API

`POST /api/route`

```jsonc
// 请求
{ "city": "rome", "start": { "lat": 41.8986, "lng": 12.4769 }, "durationMinutes": 60, "theme": "coffee",   // 或 "date"
  "stopIds": ["node/261859088"],   // 可选:固定站点,用于分享链接和删除站点
  "seed": 1 }                      // 可选:“换一条”
// 响应
{ "routeId": "…", "summary": { "distanceMeters": 4228, "durationMinutes": 56, "stopCount": 6 },
  "stops": [{ "id": "node/261859088", "name": "Sant'Eustachio", "category": "cafe", "lat": 41.89825, "lng": 12.47543,
              "suggestedStayMinutes": 20, "osmUrl": "https://www.openstreetmap.org/node/261859088" }],
  "geometry": { "type": "LineString", "coordinates": [[12.4769, 41.8986]] },
  "warnings": [] }
```

错误统一为 `{ "error": { "code", "message" } }`:`BAD_REQUEST` 400、`NO_RESULTS` 422、`POI_UNAVAILABLE` 502。

`GET /api/geocode?q=` 代理 Nominatim,带 User-Agent 和 24 小时缓存。只在用户提交时查询(Nominatim 禁止自动补全)。

`GET /api/events?lat=&lng=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&category=` 返回 `{ configured, events }`。没有配置 key 时 `configured` 为 `false`。

### 活动数据

活动来自 [Ticketmaster Discovery API](https://developer.ticketmaster.com/)(免费 key,每天 5000 次、每秒 5 次)。它收录的都是有实体场馆的演出、戏剧、体育赛事等,正好是“线下活动”。

1. 在 developer.ticketmaster.com 注册并创建应用,复制 Consumer Key
2. 本地写进 `.env.local`:`TICKETMASTER_API_KEY=...`;Vercel 上加到 Environment Variables 后重新部署

实现上是一个 `EventProvider` 接口(`lib/providers/ticketmaster.ts`),换别的数据源只需要再实现一个。加入路线的活动以 `event/<id>` 的形式和 OSM 站点放在同一个列表里,打开分享链接时按 ID 重新取回;活动结束后会从路线里去掉并提示。

### 多语言

没有引入 i18n 库:`lib/i18n/messages.ts` 里三份同构的字典(TypeScript 保证键一致,单元测试再检查占位符和运行时拼出来的键)。语言存在 cookie 里,服务端组件和客户端组件用同一份字典。API 返回的 `warnings` 和错误是语言无关的代码(如 `FALLBACK_POIS`),由界面翻译。

### 算法

- 目标距离 = 时长 × 4.5 km/h,允许 ±20%;搜索半径 = 目标距离 × 0.45。
- 评分:`主题匹配 + 标签丰富度 + 多样性奖励 − 绕路惩罚 − 连续同类惩罚`。
- 每类上限:主题只有一个主类别时最多 3 个,否则每个主类别 2 个,配角类别各 1 个。
- 排序:最近邻构造,2-opt 优化(起点固定的开放路径)。
- 硬上限:真实步行距离不超过目标的 1.5 倍,超过就删掉最绕的一站再算。
- 约会模式(`lib/route/date.ts`)不做 2-opt:每一站是一个“槽位”(开场、散步 ×N、收尾),顺序本身就是内容;最后一个散步槽位优先选观景点;超长时只删中间的站。
- 用户自己固定的站点(删过站、加过活动的路线)不会被自动删除,超长时只给提示。

## 技术难点

**1. 把“60 分钟”变成一条长度合适的路线。** 朴素的“离得越近越好”会把所有站点挤在起点周围,60 分钟的路线 15 分钟就走完了。这里的绕路惩罚是相对“理想步长”(目标距离 ÷ 站数)计算的:太近和太远一样扣分。选完点后先用直线距离 × 1.3 估算,太长删站、太短加站;拿到真实步行距离后再用 1.5 倍上限复核。实测罗马 60 分钟咖啡路线:估算 4.1 km,OSRM 实际 4.2 km,目标 4.5 km。

**2. 排序时兼顾距离和节奏。** 纯按距离做 2-opt 会排出“咖啡、咖啡、咖啡、公园”。这里没有在排完之后打补丁,而是把“相邻两站同类”直接记成多走 150 米,放进最近邻和 2-opt 共用的代价函数里。因为代价对称,2-opt 的增量计算依然成立,算法自己会在少走路和有变化之间权衡。

**3. 在不稳定的公共 API 上做一个不会挂的 demo。** Overpass 公共实例经常超时或限流(写这个项目时主实例就宕了一阵)。对策是分层的:provider 接口隔离外部服务;每次调用有超时、重试上限、缓存和 User-Agent;Overpass 多镜像各试一次;全失败则退回内置的真实数据快照;路由失败退回直线。每一层降级都会通过 `warnings` 告诉用户,而不是假装一切正常。

**4. 分享链接要能复现。** 只存“城市 + 时长 + 主题”不够:OSM 数据会变,评分也会调。所以生成后把站点的 OSM ID 写进 URL,再次打开时按 ID 取回这些站点。“换一条”用带种子的确定性扰动,同一个链接永远是同一条路线。

## 已知限制

- 默认路由服务是 FOSSGIS 的 `routing.openstreetmap.de`(有步行 profile)。常见的 `router.project-osrm.org` demo 只提供驾车 profile,不适合步行。两者都是公共服务,没有 SLA;正式使用应自建 OSRM 或换 Valhalla。
- 内存缓存在 Vercel 的 serverless 环境里只在实例存活期间有效。
- 内置数据只覆盖 5 个预设城市中心约 1.8 km 的范围,每城约 60 个地点。120 分钟路线在离线模式下会偏短。用 `npm run fixtures` 可以重新生成。
- 活动功能的 Ticketmaster 解析是按官方文档的响应格式写的,测试用的是手写样例;还没有用真实 key 跑过。
- 活动搜索按 UTC 的日界线取时间段,和意大利当地时间差一两个小时。
- 地名是 OSM 里的本地名称(意大利语),不随界面语言翻译。
- OSM 的“景点”标签质量不一,偶尔会选到不太值得停留的地方。

## 部署到 Vercel

1. 推到 GitHub,在 Vercel 里 Import 这个仓库,框架自动识别为 Next.js,不用改构建设置。
2. 建议设置环境变量 `APP_USER_AGENT`,写上你的项目地址或联系方式(OSM 各服务的使用政策要求)。
3. `/api/route` 声明了 `maxDuration = 30`,Hobby 套餐可用。
4. 部署后用“罗马 / 60 分钟 / 咖啡”走一遍,再把链接填到本文件顶部。

## 后续计划

- 拖拽调整站点顺序
- 约会模式按时段(下午 / 傍晚 / 夜晚)调整节奏,并参考营业时间
- 更多活动来源(各城市的开放数据、Eventbrite 等)
- 环形路线(回到起点)
- 用 Supabase 保存路线,生成短链接
- 营业时间过滤(OSM `opening_hours`)
- 持久化缓存(Vercel KV),减轻对公共 API 的压力

## 数据与致谢

地图与地点数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright),以 ODbL 授权。地点查询使用 Overpass API,路径使用 OSRM,地标搜索使用 Nominatim。请遵守它们各自的使用政策。
