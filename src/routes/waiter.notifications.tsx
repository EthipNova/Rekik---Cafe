import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Eye,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchWaiterNotifications,
  formatTimeAgo,
  markWaiterNotificationRead,
} from "@/lib/waiter";
import type { WaiterNotification } from "@/types/waiter";

export const Route = createFileRoute("/waiter/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterNotificationsPage,
});

export function WaiterNotificationsPage() {
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const loadNotifications = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await fetchWaiterNotifications();
      setNotifications(data || []);
    } catch (err: unknown) {
      console.warn("Error fetching waiter notifications:", err);
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadNotifications();

    const handleUpdate = () => void loadNotifications();
    window.addEventListener("neba:waiter-notif-update", handleUpdate);
    const interval = setInterval(() => void loadNotifications(), 15000);

    return () => {
      window.removeEventListener("neba:waiter-notif-update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markWaiterNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      toast.success("Notification marked as read");
    } catch {
      toast.error("Failed to update notification");
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    try {
      await Promise.all(unread.map((n) => markWaiterNotificationRead(n.id)));
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const filtered = notifications.filter((n) => (filter === "unread" ? !n.isRead : true));
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              Station Alerts
            </h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs px-2 py-0.5">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time notifications for order assignments and cashier payment reviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-9 gap-1.5 text-xs"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadNotifications(true)}
            disabled={refreshing}
            className="h-9 gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-1 text-xs w-fit">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded font-medium transition-colors ${
            filter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`px-3 py-1 rounded font-medium transition-colors ${
            filter === "unread" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading alerts from database…
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-2">
          <Bell className="size-8 mx-auto text-muted-foreground" />
          <p className="font-semibold text-sm">No alerts</p>
          <p className="text-xs text-muted-foreground">
            {filter === "unread"
              ? "You have read all your notifications!"
              : "No notifications recorded for your station yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`surface-card p-4 flex items-start justify-between gap-4 transition-all ${
                !n.isRead ? "border-primary/40 bg-primary/[0.03]" : ""
              }`}
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      !n.isRead ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                  <h3 className="font-semibold text-sm text-foreground">{n.title}</h3>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {n.notificationType}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-4">
                  {n.message}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/80 pl-4 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {formatTimeAgo(n.createdAt)}
                  </span>
                  {n.order && (
                    <span className="font-medium text-foreground">
                      Order #{n.order.orderNumber}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!n.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleMarkAsRead(n.id)}
                    title="Mark as read"
                  >
                    <Check className="size-3.5 mr-1" /> Read
                  </Button>
                )}
                {n.orderId && (
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                    <Link to="/waiter/orders">View Order</Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
