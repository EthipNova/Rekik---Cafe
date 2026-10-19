import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  fetchAvailabilityProducts,
  toggleAdminProductAvailability,
  type AvailabilityProduct,
} from "@/lib/availability";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/availability")({
  head: () => ({
    meta: [
      { title: "Menu Availability — Rekik Coffee Admin" },
      { name: "description", content: "Manage menu item availability for orders." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAvailability,
});

function AdminAvailability() {
  const [rows, setRows] = useState<AvailabilityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await fetchAvailabilityProducts();
      if (fetchErr) {
        setError(fetchErr.message);
        return;
      }
      setRows(data || []);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleToggleAvailability = async (p: AvailabilityProduct, checked: boolean) => {
    const prevAvailable = p.available;
    setTogglingId(p.id);

    // Optimistically update local state immediately
    setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, available: checked } : r)));

    try {
      const { success, error: toggleErr } = await toggleAdminProductAvailability(p.id, checked);

      if (!success) {
        // Roll back to previous state if Supabase mutation failed
        setRows((prev) =>
          prev.map((r) => (r.id === p.id ? { ...r, available: prevAvailable } : r)),
        );
        toast.error(toggleErr?.message || "Failed to update availability");
      } else {
        toast.success(`${p.name} marked ${checked ? "available" : "unavailable"}`);
      }
    } catch (err: any) {
      setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, available: prevAvailable } : r)));
      toast.error("Failed to update availability");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Flip an item off and customers can no longer add it to a new order.
        </p>
      </header>

      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading menu availability from Supabase…</p>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Failed to load availability</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            <span>Retry connection</span>
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">No menu products found.</p>
          <p className="text-xs text-muted-foreground">Add products in the Products tab.</p>
        </div>
      ) : (
        <ul className="surface-card divide-y divide-border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full",
                    p.available ? "bg-success" : "bg-muted-foreground/40",
                  )}
                />
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.available ? "Available" : "Unavailable"}
                  </p>
                </div>
              </div>
              <Switch
                checked={p.available}
                disabled={togglingId === p.id}
                aria-label={`Availability for ${p.name}`}
                onCheckedChange={(checked) => handleToggleAvailability(p, checked)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
