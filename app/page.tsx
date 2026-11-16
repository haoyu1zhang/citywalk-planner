import { PlannerForm } from "@/components/PlannerForm";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PlannerForm />
      </main>
    </div>
  );
}
