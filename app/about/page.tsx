import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "关于 · CityWalk Planner" };

const CHALLENGES = [
  {
    title: "把“时长”变成一条长度合适的路线",
    body: "评分里的绕路惩罚不是离得越近越好,而是离“理想步长”(目标距离 ÷ 站数)越近越好。之后按估算长度增删站点,拿到真实步行距离后再用 1.5 倍上限复核。",
  },
  {
    title: "排序时兼顾距离和节奏",
    body: "最近邻构造、2-opt 优化。连续两站同类会被记作多走 150 米,所以算法会在“少走路”和“别连喝两家咖啡”之间自己权衡。",
  },
  {
    title: "在不稳定的公共 API 上保持可用",
    body: "Overpass 和 OSRM 都封装成 provider,带超时、有限重试、缓存和 User-Agent。Overpass 不可用时退回内置的真实数据快照,路由不可用时退回直线,并明确告诉用户。",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-6 p-4 py-8 lg:py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">关于这个项目</h1>
        <p className="leading-relaxed text-muted">
          CityWalk Planner 根据城市、时长、主题和起点生成一条步行路线。所有地点和路径都来自
          OpenStreetMap 的真实数据,没有任何坐标是模型编出来的。
        </p>
        <ol className="space-y-3">
          {CHALLENGES.map((c, i) => (
            <li key={c.title} className="rounded-xl border border-line bg-surface p-4">
              <h2 className="font-semibold">
                {i + 1}. {c.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm leading-relaxed text-muted">
          技术栈:Next.js 15、TypeScript、Tailwind CSS、react-leaflet、Zod、Vitest、Playwright。数据 ©{" "}
          <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2">
            OpenStreetMap 贡献者
          </a>
          。
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-accent underline underline-offset-2">
          ← 去规划一条路线
        </Link>
      </main>
    </div>
  );
}
