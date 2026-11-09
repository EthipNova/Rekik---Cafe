import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Plus,
  RotateCcw,
  Trash2,
  Pencil,
  Upload,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Utensils,
  Loader2,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  updateAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  toggleAdminCategoryActive,
  type AdminCategory,
} from "@/lib/categories";
import {
  uploadCategoryImage,
  deleteCategoryImageFromStorage,
  validateProductImageFile,
} from "@/lib/product-images";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Rekik Café Admin" },
      {
        name: "description",
        content: "Organise the menu, manage cover images, and control what customers see.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCategories,
});

function AdminCategories() {
  const [rows, setRows] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog state
  const [categoryToEdit, setCategoryToEdit] = useState<AdminCategory | null>(null);
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Actions state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<AdminCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clean up object URLs on unmount / change
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (editPreviewUrl && editPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(editPreviewUrl);
      }
    };
  }, [editPreviewUrl]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await fetchAdminCategories();
      if (fetchErr) {
        setError(fetchErr.message);
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

  // Handle file selection for Create
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProductImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid image file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleClearSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Create new category
  const create = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a category name");
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadedImageUrl: string | null = null;

      // 1. If an image was selected, upload to Supabase Storage first
      if (selectedFile) {
        const tempId = crypto.randomUUID();
        const uploadRes = await uploadCategoryImage(tempId, selectedFile);
        if (uploadRes.error || !uploadRes.url) {
          toast.error(uploadRes.error?.message || "Failed to upload category cover image");
          setIsSubmitting(false);
          return;
        }
        uploadedImageUrl = uploadRes.url;
      }

      // 2. Insert category record with image_url
      const { data, error: createErr } = await createAdminCategory({
        name: trimmed,
        tagline: tagline.trim() || undefined,
        imageUrl: uploadedImageUrl,
      });

      if (createErr || !data) {
        if (uploadedImageUrl) {
          void deleteCategoryImageFromStorage(uploadedImageUrl);
        }
        toast.error(createErr?.message || "Failed to create category");
        return;
      }

      setRows((prev) => [...prev, data]);
      setName("");
      setTagline("");
      handleClearSelectedFile();
      toast.success(`Category "${data.name}" created successfully`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Dialog
  const handleOpenEdit = (category: AdminCategory) => {
    setCategoryToEdit(category);
    setEditName(category.name);
    setEditTagline(category.tagline || "");
    setEditFile(null);
    setEditPreviewUrl(null);
    setEditRemoveImage(false);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  // Handle file selection in Edit
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProductImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid image file");
      if (editFileInputRef.current) editFileInputRef.current.value = "";
      return;
    }

    if (editPreviewUrl && editPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(editPreviewUrl);
    }

    setEditFile(file);
    setEditPreviewUrl(URL.createObjectURL(file));
    setEditRemoveImage(false);
  };

  const handleClearEditFile = () => {
    if (editPreviewUrl && editPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(editPreviewUrl);
    }
    setEditFile(null);
    setEditPreviewUrl(null);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  // Save Edit Changes
  const handleSaveEdit = async () => {
    if (!categoryToEdit) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error("Category name is required");
      return;
    }

    setIsSavingEdit(true);
    try {
      const oldImageUrl = categoryToEdit.imageUrl;
      let finalImageUrl: string | null | undefined = oldImageUrl;

      // 1. If removing existing image
      if (editRemoveImage) {
        finalImageUrl = null;
      }

      // 2. If new file uploaded
      if (editFile) {
        const uploadRes = await uploadCategoryImage(categoryToEdit.id, editFile);
        if (uploadRes.error || !uploadRes.url) {
          toast.error(uploadRes.error?.message || "Failed to upload new cover image");
          setIsSavingEdit(false);
          return;
        }
        finalImageUrl = uploadRes.url;
      }

      // 3. Update database record
      const { data: updated, error: updateErr } = await updateAdminCategory({
        id: categoryToEdit.id,
        name: trimmedName,
        tagline: editTagline.trim(),
        imageUrl: finalImageUrl,
      });

      if (updateErr || !updated) {
        if (editFile && finalImageUrl) {
          void deleteCategoryImageFromStorage(finalImageUrl, categoryToEdit.id);
        }
        toast.error(updateErr?.message || "Failed to update category");
        return;
      }

      // 4. If old image was replaced or removed, safely clean up old storage file
      if (oldImageUrl && oldImageUrl !== finalImageUrl) {
        void deleteCategoryImageFromStorage(oldImageUrl, categoryToEdit.id);
      }

      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Category "${updated.name}" updated successfully`);
      setCategoryToEdit(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (c: AdminCategory, checked: boolean) => {
    const previousState = c.active;
    setTogglingId(c.id);

    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, active: checked } : r)));

    try {
      const { success, error: toggleErr } = await toggleAdminCategoryActive(c.id, checked);
      if (!success) {
        setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, active: previousState } : r)));
        toast.error(toggleErr?.message || "Failed to update category status");
      } else {
        toast.success(`${c.name} ${checked ? "activated" : "deactivated"}`);
      }
    } finally {
      setTogglingId(null);
    }
  };

  // Delete category confirm
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
      const { success, error: delError } = await deleteAdminCategory(target.id, target.imageUrl);
      if (!success) {
        toast.error(delError?.message || "Failed to delete category");
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== target.id));
      setCategoryToDelete(null);
      toast.success("Category and associated image deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Menu Categories
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Organise the menu, upload category cover images, and manage what customers and staff see.
        </p>
      </header>

      {/* Add Category Section */}
      <div className="surface-card p-4 sm:p-6 rounded-xl space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            Add New Menu Category
          </h2>
          <p className="text-xs text-muted-foreground">
            Create a category with an optional descriptive tagline and cover image.
          </p>
        </div>

        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category-name" className="text-xs font-semibold">
                Category Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Specialty Coffee, Gourmet Burgers"
                disabled={isSubmitting}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category-tagline" className="text-xs font-semibold">
                Tagline / Description (Optional)
              </Label>
              <Input
                id="category-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Freshly roasted Ethiopian single-origins"
                disabled={isSubmitting}
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Cover Image Upload & Preview Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Category Cover Image</Label>

            {previewUrl ? (
              <div className="relative aspect-[16/6] sm:aspect-[21/6] max-h-48 w-full rounded-xl overflow-hidden border border-border bg-secondary/30 group">
                <img
                  src={previewUrl}
                  alt="Selected cover preview"
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    <Upload className="size-3.5" />
                    <span>Change</span>
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={handleClearSelectedFile}
                    disabled={isSubmitting}
                  >
                    <X className="size-3.5" />
                    <span>Remove</span>
                  </Button>
                </div>
                <div className="absolute bottom-2 left-2">
                  <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-xs">
                    {selectedFile?.name} ({(selectedFile ? selectedFile.size / (1024 * 1024) : 0).toFixed(1)} MB)
                  </Badge>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-border hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40 transition-all cursor-pointer text-center space-y-1"
              >
                <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                  <ImageIcon className="size-4.5" />
                </div>
                <p className="text-xs font-medium text-foreground">
                  Click to upload category cover image
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supports JPG, PNG, WEBP up to 5 MB
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleFileChange}
              className="hidden"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="h-10 px-5 text-xs font-semibold gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving Category…</span>
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Add Category</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Categories Catalog */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            All Categories ({rows.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RotateCcw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="surface-card p-12 text-center text-sm text-muted-foreground rounded-xl">
            <Loader2 className="size-6 text-primary animate-spin mx-auto mb-2" />
            <p className="animate-pulse">Loading menu categories from Supabase…</p>
          </div>
        ) : error ? (
          <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5 rounded-xl">
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
          <div className="surface-card p-12 text-center text-sm text-muted-foreground space-y-1 rounded-xl">
            <p className="font-medium text-foreground">No categories yet.</p>
            <p className="text-xs text-muted-foreground">Create your first menu category above.</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "surface-card rounded-xl overflow-hidden border border-border flex flex-col justify-between transition-all hover:shadow-md",
                  !c.active && "opacity-75 bg-muted/20",
                )}
              >
                <div>
                  {/* Category Cover Image Header */}
                  <div className="relative aspect-[16/8] w-full bg-secondary/40 overflow-hidden border-b border-border/50">
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={`${c.name} cover`}
                        className="size-full object-cover transition-transform duration-300 hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/hero.jpg";
                        }}
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center gap-1 text-muted-foreground/60 bg-linear-to-b from-secondary/40 to-secondary/80">
                        <Utensils className="size-6 opacity-30" />
                        <span className="text-[11px] font-medium text-muted-foreground/70">
                          No cover image
                        </span>
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <Badge
                        variant={c.active ? "secondary" : "outline"}
                        className={cn(
                          "text-[10px] px-1.5 py-0 font-semibold backdrop-blur-xs shadow-xs",
                          c.active
                            ? "bg-emerald-500/90 text-white border-0"
                            : "bg-background/90 text-muted-foreground border-border",
                        )}
                      >
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="absolute top-2 right-2">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-medium bg-background/85 backdrop-blur-xs shadow-xs text-foreground"
                      >
                        {c.productCount} {c.productCount === 1 ? "product" : "products"}
                      </Badge>
                    </div>
                  </div>

                  {/* Category Info */}
                  <div className="p-4 space-y-1">
                    <h3 className="font-display text-base font-semibold text-foreground line-clamp-1">
                      {c.name}
                    </h3>
                    {c.tagline ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {c.tagline}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No tagline provided</p>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 pt-2 border-t border-border/50 flex items-center justify-between gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.active}
                      disabled={togglingId === c.id || isDeleting}
                      aria-label={`Toggle ${c.name}`}
                      onCheckedChange={(checked) => handleToggleActive(c, checked)}
                    />
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {c.active ? "Visible" : "Hidden"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs gap-1.5"
                      onClick={() => handleOpenEdit(c)}
                      disabled={isDeleting}
                    >
                      <Pencil className="size-3" />
                      <span>Edit</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setCategoryToDelete(c)}
                      aria-label={`Delete ${c.name}`}
                      disabled={isDeleting}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* EDIT CATEGORY DIALOG */}
      <Dialog
        open={Boolean(categoryToEdit)}
        onOpenChange={(open) => {
          if (!open && !isSavingEdit) {
            handleClearEditFile();
            setCategoryToEdit(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Edit Category
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update name, tagline, or replace the category cover image.
            </DialogDescription>
          </DialogHeader>

          {categoryToEdit && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">
                  Category Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={isSavingEdit}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-tagline" className="text-xs font-semibold">
                  Tagline / Description
                </Label>
                <Input
                  id="edit-tagline"
                  value={editTagline}
                  onChange={(e) => setEditTagline(e.target.value)}
                  disabled={isSavingEdit}
                  className="h-9 text-sm"
                />
              </div>

              {/* Cover Image in Edit Mode */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category Cover Image</Label>

                {/* 1. New preview selected */}
                {editPreviewUrl ? (
                  <div className="relative aspect-[16/7] w-full rounded-xl overflow-hidden border border-primary/40 bg-secondary/30 group">
                    <img
                      src={editPreviewUrl}
                      alt="New cover preview"
                      className="size-full object-cover"
                    />
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-primary text-primary-foreground text-[10px]">
                        New selected (unsaved)
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 right-2 flex gap-1">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleClearEditFile}
                      >
                        Cancel New Image
                      </Button>
                    </div>
                  </div>
                ) : editRemoveImage ? (
                  /* 2. Image marked for removal */
                  <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Cover image marked for removal. It will be removed when you save.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditRemoveImage(false)}
                    >
                      Undo Removal
                    </Button>
                  </div>
                ) : categoryToEdit.imageUrl ? (
                  /* 3. Existing cover image */
                  <div className="relative aspect-[16/7] w-full rounded-xl overflow-hidden border border-border bg-secondary/30 group">
                    <img
                      src={categoryToEdit.imageUrl}
                      alt={`${categoryToEdit.name} cover`}
                      className="size-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={isSavingEdit}
                      >
                        <Upload className="size-3.5" />
                        <span>Replace</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => setEditRemoveImage(true)}
                        disabled={isSavingEdit}
                      >
                        <Trash2 className="size-3.5" />
                        <span>Remove</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* 4. No image currently */
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40 transition-all cursor-pointer text-center space-y-1"
                  >
                    <ImageIcon className="size-5 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground">
                      Click to upload cover image
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Supports JPG, PNG, WEBP up to 5 MB
                    </p>
                  </div>
                )}

                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={handleEditFileChange}
                  className="hidden"
                  disabled={isSavingEdit}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleClearEditFile();
                setCategoryToEdit(null);
              }}
              disabled={isSavingEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || !editName.trim()}
              className="gap-2"
            >
              {isSavingEdit ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  action permanently removes the category and any associated cover image.
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
