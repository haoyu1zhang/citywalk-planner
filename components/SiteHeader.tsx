import { Footprints } from "lucide-react";
import Link from "next/link";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-paper px-4">
      <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <Footprints className="size-5 text-accent" aria-hidden />
        CityWalk Planner
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        {children}
        <Link href="/about" className="rounded-md px-2 py-2 text-muted hover:text-ink">
          关于
        </Link>
      </nav>
    </header>
  );
}
