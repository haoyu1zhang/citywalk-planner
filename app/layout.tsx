import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CityWalk Planner · 城市漫步路线生成器",
  description: "选个城市、时长和主题,用 OpenStreetMap 的真实数据生成一条可以走完的漫步路线。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf6ef" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
