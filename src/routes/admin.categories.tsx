import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  toggleAdminCategoryActive,
  type AdminCategory,
} from "@/lib/categories";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Rekik Café Admin" },
      {
        name: "description",
        content: "Organise the menu and control what customers see.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCategories,
});

function AdminCategories() {
  const [rows, setRows] = useState<AdminCategory[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<AdminCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await fetchAdminCategories();
      if (error) {
        setError(error.message);
        return;
      }
      setRows(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const create = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a category name");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await createAdminCategory({ name: trimmed });
      if (error || !data) {
        toast.error(error?.message || "Failed to create category");
        return;
      }

      setRows((prev) => [...prev, data]);
      setName("");
      toast.success("Category created");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (c: AdminCategory, checked: boolean) => {
    const previousState = c.active;
    setTogglingId(c.id);

    // Optimistically update local state
    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, active: checked } : r)));

    try {
      const { success, error } = await toggleAdminCategoryActive(c.id, checked);
      if (!success) {
        // Rollback to previous state on failure
        setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, active: previousState } : r)));
        toast.error(error?.message || "Failed to update category status");
      } else {
        toast.success(`${c.name} ${checked ? "activated" : "deactivated"}`);
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    if (categoryToDelete.productCount > 0) {
      toast.error(
        `Cannot delete "${categoryToDelete.name}" because it contains ${categoryToDelete.productCount} product(s). Reassign or remove those products first, or disable the category instead.`,
      );
      setCategoryToDelete(null);
      return;
    }

    const target = categoryToDelete;
    setIsDeleting(true);

    try {
      const { success, error: delError } = await deleteAdminCategory(target.id);
      if (!success) {
        toast.error(delError?.message || "Failed to delete category");
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== target.id));
      setCategoryToDelete(null);
      toast.success("Category deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organise the menu and control what customers see.
        </p>
      </header>

      <form onSubmit={create} className="surface-card flex flex-col sm:flex-row gap-3 p-3.5 sm:p-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          aria-label="New category name"
          className="w-full sm:max-w-xs h-11 sm:h-9"
          disabled={isSubmitting}
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto h-11 sm:h-9 gap-1.5"
        >
          <Plus className="size-4" /> {isSubmitting ? "Adding…" : "Add category"}
        </Button>
      </form>

      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading menu categories from Supabase…</p>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Failed to load categories</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            <span>Retry connection</span>
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">No categories yet.</p>
          <p className="text-xs text-muted-foreground">Create your first menu category above.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className={cn(
                "surface-card p-4 sm:p-5 transition-opacity",
                !c.active && "opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h2
                      className={cn(
                        "font-display text-lg font-semibold break-words",
                        !c.active && "text-muted-foreground",
                      )}
                    >
                      {c.name}
                    </h2>
                    <Badge
                      variant={c.active ? "secondary" : "outline"}
                      className={cn(
                        "text-[10px] px-1.5 py-0 font-normal shrink-0",
                        !c.active && "text-muted-foreground border-muted-foreground/30",
                      )}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {c.tagline ? (
                    <p className="text-sm text-muted-foreground mt-0.5">{c.tagline}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <Switch
                    checked={c.active}
                    disabled={togglingId === c.id || isDeleting}
                    aria-label={`Toggle ${c.name}`}
                    onCheckedChange={(checked) => handleToggleActive(c, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setCategoryToDelete(c)}
                    aria-label={`Delete ${c.name}`}
                    disabled={isDeleting}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">{c.productCount} product(s)</p>
            </li>
          ))}
        </ul>
      )}

      {/* DELETE CONFIRMATION ALERT DIALOG */}
      <AlertDialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => !open && !isDeleting && setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {categoryToDelete && categoryToDelete.productCount > 0
                ? "Cannot delete category"
                : "Delete category?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {categoryToDelete && categoryToDelete.productCount > 0 ? (
                <>
                  This category cannot be deleted because it contains{" "}
                  <strong>{categoryToDelete.productCount}</strong>{" "}
                  {categoryToDelete.productCount === 1 ? "product" : "products"}. Reassign or remove
                  those products first, or disable the category instead.
                </>
              ) : (
                <>
                  Are you sure you want to delete <strong>{categoryToDelete?.name}</strong>? This
                  action permanently removes the category from the menu.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {categoryToDelete && categoryToDelete.productCount > 0 ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {categoryToDelete && categoryToDelete.productCount === 0 && (
              <AlertDialogAction
                disabled={isDeleting}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDeleteConfirm();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
