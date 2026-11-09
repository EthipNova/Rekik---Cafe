import { createFileRoute } from "@tanstack/react-router";
import { WaiterMenuOrderView } from "@/components/waiter/WaiterMenuOrderView";

export const Route = createFileRoute("/waiter/menu")({
  head: () => ({
    meta: [
      { title: "Menu & Take Order — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterMenuRoutePage,
});

function WaiterMenuRoutePage() {
  return <WaiterMenuOrderView />;
}

