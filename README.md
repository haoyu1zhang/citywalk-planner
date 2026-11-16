# CityWalk Planner

城市漫步路线生成器。选城市、步行时长、主题和起点,生成一条能走完、不绕路的路线,画在地图上。地点来自 OpenStreetMap(Overpass),步行路径来自 OSRM。

在线地址:<https://citywalk-planner-pi.vercel.app>

<!-- 截图待补:docs/home-mobile.png、docs/route-mobile.png -->

## 功能

- 5 个预设城市(罗马、佛罗伦萨、米兰、威尼斯、博洛尼亚),起点可以搜地标,也可以直接点地图
- 时长 30 / 60 / 90 / 120 分钟;主题:经典、咖啡、文艺、公园、拍照、雨天
- 约会模式:按“甜品或咖啡 → 散步 → 看风景 → 晚餐或小酌”排一条两个人的路线
- 转盘:随机抽一个附近的地方,抽中可以加进路线
- 附近活动:按时间、类别、关键词筛选,加进路线
- 一键用 Google 地图导航(起点、途经点、终点都带上)
- 删除站点、换一条、分享链接、导出 GeoJSON
- 中文 / English / Italiano

## 本地运行

```bash
npm install
npm run dev

npm run lint
npm test
npm run test:e2e   # 第一次需要 npx playwright install chromium
```

没有网络时可以 `CITYWALK_OFFLINE=1 npm run dev`,只用仓库里的数据。环境变量都是可选的,见 `.env.example`。

## 技术栈

Next.js 15 (App Router)、TypeScript、Tailwind v4、react-leaflet、Zod、Vitest、Playwright。部署在 Vercel。

## 结构

```
app/                  页面和 API(/api/route、/api/places、/api/events、/api/geocode)
components/           表单、结果页、地图、转盘、活动面板
lib/route/            选点、评分、排序、约会模式
lib/providers/        Overpass / OSRM / Nominatim / 活动数据,各自一个接口
lib/i18n/             三种语言的文案
lib/fixtures/         预设城市的 OSM 数据快照(Overpass 挂了的时候用)
data/events.json      活动快照,每天由 GitHub Actions 更新
scripts/              生成 fixtures、更新活动
tests/
```

`POST /api/route` 的请求和响应格式见 `lib/schemas.ts`。

## 路线怎么算的

- 目标距离 = 时长 × 4.5 km/h,允许 ±20%
- 候选地点打分:主题匹配 + 标签丰富度 + 多样性 − 绕路 − 连续同类
- 最近邻排出初始顺序,再用 2-opt 优化
- 真实步行距离超过目标 1.5 倍时,删掉最绕的一站重算
- 约会模式不做 2-opt,按固定的节奏选点(`lib/route/date.ts`)

## 几个踩过的坑

**路线总是太短。** 一开始绕路惩罚是“离得越近越好”,结果所有站点挤在起点旁边,60 分钟的路线十几分钟就走完了。后来改成和“理想步长”(目标距离 ÷ 站数)比,太近太远都扣分。罗马 60 分钟咖啡路线估算 4.1 km,OSRM 实际算出来 4.2 km。

**连着三家咖啡馆。** 纯按距离排序就会这样。没有在排完之后再调,而是把“相邻两站同类”算作多走 150 米,直接放进排序的代价函数里。

**公共 API 不稳定。** Overpass 经常超时,开发期间主站挂过好几个小时。现在的做法是每个镜像试一次,都不行就用仓库里的数据快照;路由不通就画直线。降级的时候页面上会提示。

**分享链接要能复现。** 只存“城市 + 时长 + 主题”不行,OSM 数据会变。所以把站点的 OSM ID 写进 URL。

## 活动数据

两个来源:

- [E-zine](https://e-zine.it/it/api/) 的公开接口,主要是展览和开幕活动。`scripts/update-events.ts` 每天跑一次(`.github/workflows/events.yml`),结果写进 `data/events.json`。接口只给街道地址,脚本用 Nominatim 转成坐标。
- [Ticketmaster](https://developer.ticketmaster.com/)(可选):设置 `TICKETMASTER_API_KEY` 后会多出演出、体育赛事等。

手动更新:`npm run events`,第一次加 `-- --backfill` 把已经开幕、还在展的也拉进来。

## 已知问题

- 路由用的是 FOSSGIS 的公共 OSRM(`routing.openstreetmap.de`),没有 SLA。`router.project-osrm.org` 只有驾车模式,不能用。
- 活动目前基本只有罗马和米兰有数据。
- Ticketmaster 部分还没用真实 key 测过。
- Google 地图链接最多带 9 个途经点,手机浏览器里只支持 3 个(装了 App 没这个限制)。
- 数据快照只覆盖预设城市中心 1.8 km 左右。

## TODO

- [ ] 拖拽排序
- [ ] 环形路线
- [ ] 营业时间
- [ ] 截图

## 数据来源

地图和地点数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)(ODbL)。活动数据来自 E-zine 和 Ticketmaster。
