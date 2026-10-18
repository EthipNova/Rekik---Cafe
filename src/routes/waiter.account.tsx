import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  LogOut,
  Mail,
  Phone,
  Shield,
  ToggleLeft,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import {
  fetchWaiterProfile,
  updateWaiterAvailability,
  type WaiterProfile,
} from "@/lib/waiter";

export const Route = createFileRoute("/waiter/account")({
  head: () => ({
    meta: [
      { title: "Staff Account — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterAccountPage,
});

export function WaiterAccountPage() {
  const [profile, setProfile] = useState<WaiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    void fetchWaiterProfile()
      .then((p) => setProfile(p))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleDuty = async (nextState: boolean) => {
    if (!profile) return;
    setToggling(true);
    try {
      const res = await updateWaiterAvailability(nextState);
      setProfile((prev: WaiterProfile | null) =>
        prev ? { ...prev, isAvailable: res.isAvailable } : null,
      );
      toast.success(res.isAvailable ? "Availability set to: ON DUTY" : "Availability set to: OFF DUTY");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update availability";
      toast.error(msg);
    } finally {
      setToggling(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = "/waiter";
    } catch {
      toast.error("Error signing out");
    }
  };

  if (loading) {
    return (
      <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading staff profile…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="surface-card p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Staff profile could not be loaded.</p>
        <Button onClick={() => window.location.reload()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  const initials = profile.fullName
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "W";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Staff Account
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Manage your station duty status and view account credentials.
        </p>
      </div>

      {/* Profile Card */}
      <div className="surface-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-border">
          <Avatar className="size-16 border-2 border-primary/20 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-bold text-foreground">
                {profile.fullName}
              </h2>
              <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                {profile.role}
              </Badge>
            </div>
            {profile.email && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground/70" />
                {profile.email}
              </p>
            )}
            {profile.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground/70" />
                {profile.phone}
              </p>
            )}
          </div>
        </div>

        {/* Duty Availability Card */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2.5 rounded-full ${
                    profile.isAvailable ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <Label htmlFor="duty-toggle" className="font-semibold text-sm cursor-pointer">
                  {profile.isAvailable ? "On Duty — Available for Tables" : "Off Duty — Paused"}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {profile.isAvailable
                  ? "Customers and checkout flow can select your station for order assignments."
                  : "You will not receive new order assignments until you switch back on duty."}
              </p>
            </div>
            <Switch
              id="duty-toggle"
              checked={profile.isAvailable}
              disabled={toggling}
              onCheckedChange={handleToggleDuty}
            />
          </div>
        </div>

        {/* System Information */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Station Details</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded bg-muted/40 p-2.5">
              <span className="block text-[10px] uppercase text-muted-foreground/70">
                Staff ID
              </span>
              <span className="font-mono text-[11px] text-foreground truncate block">
                {profile.userId}
              </span>
            </div>
            <div className="rounded bg-muted/40 p-2.5">
              <span className="block text-[10px] uppercase text-muted-foreground/70">
                Account Status
              </span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="size-3" /> Active Profile
              </span>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div className="pt-4 border-t border-border flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleSignOut}
            className="text-xs gap-2"
          >
            <LogOut className="size-4" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
