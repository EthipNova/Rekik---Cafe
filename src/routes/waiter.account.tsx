import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/waiter/account")({
  head: () => ({
    meta: [
      { title: "Waiter Dashboard — Rekik Café" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Navigate to="/waiter" replace />,
});
