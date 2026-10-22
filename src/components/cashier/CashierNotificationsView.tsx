import { Bell, Check, Clock, CheckCircle2, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CashierNotification } from "@/lib/cashier";

interface CashierNotificationsViewProps {
  notifications: CashierNotification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onRefresh: () => void;
}

export function CashierNotificationsView({
  notifications,
  loading,
  onMarkAsRead,
  onRefresh,
}: CashierNotificationsViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
        <div>
          <h3 className="text-base font-bold font-display text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Cashier Activity & Notifications
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time alerts for customer proof submissions, order confirmations, and review updates
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="h-9 text-xs">
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-border bg-card">
          <Bell className="h-10 w-10 text-muted-foreground mb-3 opacity-60" />
          <h3 className="text-lg font-bold font-display text-foreground">No Notifications</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            You're completely up to date. You will be notified here when new payment proofs are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => {
            const isPaymentAlert = n.notification_type?.includes("payment");
            const isApproved = n.notification_type?.includes("approved");
            const isRejected = n.notification_type?.includes("rejected");

            return (
              <div
                key={n.id}
                className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                  !n.is_read
                    ? "bg-primary/5 border-primary/30 shadow-sm"
                    : "bg-card border-border/70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isApproved
                        ? "bg-emerald-500/10 text-emerald-600"
                        : isRejected
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-[#C8102E]"
                    }`}
                  >
                    {isApproved ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isRejected ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{n.title}</h4>
                      {!n.is_read && (
                        <Badge className="bg-[#C8102E] text-white text-[10px] px-1.5 py-0 h-4">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                      {n.message}
                    </p>
                    <span className="text-[11px] text-muted-foreground block font-mono">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {!n.is_read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMarkAsRead(n.id)}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    title="Mark as read"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Mark Read
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
