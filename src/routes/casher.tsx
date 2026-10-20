import { createFileRoute } from "@tanstack/react-router";
import { CashierRoutePage } from "./cashier";

export const Route = createFileRoute("/casher")({
  head: () => ({
    meta: [
      { title: "Cashier Dashboard — Rekik Café" },
      {
        name: "description",
        content: "Secure payment proof review, verification, and order confirmation portal for Rekik Café cashiers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashierRoutePage,
});
