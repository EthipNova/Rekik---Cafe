import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/waiter/payments")({
  head: () => ({
    meta: [
      { title: "Order History — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Navigate to="/waiter/history" replace />,
});
