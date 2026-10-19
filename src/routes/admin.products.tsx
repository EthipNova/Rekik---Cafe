import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UploadCloud,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAdminProduct,
  fetchAdminCategories,
  fetchAdminProducts,
  formatETB,
  generateProductId,
  toggleAdminProductAvailability,
  updateAdminProduct,
  type Category,
  type Product,
} from "@/lib/products";
import {
  deleteProductImageFromStorage,
  uploadProductImage,
  validateProductImageFile,
} from "@/lib/product-images";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [
      { title: "Menu Products — Rekik Coffee Admin" },
      { name: "description", content: "Manage menu items, categories, pricing, and availability." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminProducts,
});

type Draft = {
  name: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  imageFile: File | null;
  description: string;
};

function ProductThumbnail({ image, name }: { image?: string; name: string }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [image]);

  if (!image || !image.trim() || hasError) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
        <UtensilsCrossed className="size-5" />
      </div>
    );
  }

  return (
    <img
      src={image.trim()}
      alt={name}
      loading="lazy"
      width={768}
      height={768}
      className="size-10 rounded-md object-cover bg-muted shrink-0"
      onError={() => setHasError(true)}
    />
  );
}

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    price: "",
    categoryId: "",
    imageUrl: "",
    imageFile: null,
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, catRes] = await Promise.all([fetchAdminProducts(), fetchAdminCategories()]);

      if (catRes.error) {
        setError(catRes.error.message);
        return;
      }
      if (prodRes.error) {
        setError(prodRes.error.message);
        return;
      }

      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openNew = () => {
    setEditing(null);
    const defaultCategory = categories.find((c) => c.isActive) || categories[0];
    setDraft({
      name: "",
      price: "",
      categoryId: defaultCategory ? defaultCategory.id : "",
      imageUrl: "",
      imageFile: null,
      description: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setDraft({
      name: p.name,
      price: String(p.price),
      categoryId: p.categoryId,
      imageUrl: p.image || "",
      imageFile: null,
      description: p.description,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const price = Number(draft.price);
    if (!draft.name.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error("Enter a name and a valid price");
      return;
    }
    if (!draft.categoryId) {
      toast.error("Please select a category");
      return;
    }

    setIsSubmitting(true);
    let uploadedStoragePath: string | null = null;

    try {
      if (editing) {
        let finalImageUrl = draft.imageUrl.trim();

        // If a device image file was selected, upload it to Supabase Storage
        if (draft.imageFile) {
          setUploadStatus("Uploading image…");
          const uploadResult = await uploadProductImage(editing.id, draft.imageFile);
          if (uploadResult.error || !uploadResult.url) {
            toast.error(uploadResult.error?.message || "Image upload failed. Please try again.");
            return;
          }
          finalImageUrl = uploadResult.url;
          uploadedStoragePath = uploadResult.path;
        }

        setUploadStatus("Saving product…");
        const { data, error } = await updateAdminProduct(
          {
            id: editing.id,
            name: draft.name,
            price,
            categoryId: draft.categoryId,
            imageUrl: finalImageUrl,
            description: draft.description,
          },
          categories,
        );

        if (error || !data) {
          // If upload succeeded but DB update failed, clean up newly uploaded storage object
          if (uploadedStoragePath) {
            await deleteProductImageFromStorage(uploadedStoragePath);
          }
          toast.error(error?.message || "Failed to update product");
          return;
        }

        // If editing replaced or removed an image, clean up old storage file
        if (editing.image && editing.image !== finalImageUrl) {
          void deleteProductImageFromStorage(editing.image);
        }

        setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        toast.success(draft.imageFile ? "Product updated with new image" : "Product updated");
        setDialogOpen(false);
        setEditing(null);
      } else {
        // Creating a new product: pre-generate ID for storage path
        const newProductId = generateProductId();
        let finalImageUrl = draft.imageUrl.trim();

        if (draft.imageFile) {
          setUploadStatus("Uploading image…");
          const uploadResult = await uploadProductImage(newProductId, draft.imageFile);
          if (uploadResult.error || !uploadResult.url) {
            toast.error(uploadResult.error?.message || "Image upload failed. Please try again.");
            return;
          }
          finalImageUrl = uploadResult.url;
          uploadedStoragePath = uploadResult.path;
        }

        setUploadStatus("Saving product…");
        const { data, error } = await createAdminProduct(
          {
            id: newProductId,
            name: draft.name,
            price,
            categoryId: draft.categoryId,
            imageUrl: finalImageUrl,
            description: draft.description,
          },
          categories,
        );

        if (error || !data) {
          // Clean up newly uploaded storage object if product insert failed
          if (uploadedStoragePath) {
            await deleteProductImageFromStorage(uploadedStoragePath);
          }
          toast.error(error?.message || "Failed to create product");
          return;
        }

        setProducts((prev) => [data, ...prev]);
        toast.success(draft.imageFile ? "Product created with image" : "Product created");
        setDialogOpen(false);
        setEditing(null);
      }
    } catch (err: unknown) {
      if (uploadedStoragePath) {
        await deleteProductImageFromStorage(uploadedStoragePath);
      }
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setIsSubmitting(false);
      setUploadStatus(null);
    }
  };

  const handleToggleAvailability = async (p: Product, checked: boolean) => {
    const prevAvailable = p.available;
    setTogglingId(p.id);

    // Optimistically update local state
    setProducts((prev) => prev.map((r) => (r.id === p.id ? { ...r, available: checked } : r)));

    try {
      const { success, error } = await toggleAdminProductAvailability(p.id, checked);
      if (!success) {
        // Revert to previous state if Supabase mutation failed
        setProducts((prev) =>
          prev.map((r) => (r.id === p.id ? { ...r, available: prevAvailable } : r)),
        );
        toast.error(error?.message || "Failed to update product availability");
      } else {
        toast.success(`${p.name} ${checked ? "activated" : "deactivated"}`);
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Products</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Create, edit, price and deactivate menu items.
          </p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto h-11 sm:h-9 gap-1.5">
          <Plus className="size-4" /> New product
        </Button>
      </header>

      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading menu products from Supabase…</p>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Failed to load products</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            <span>Retry connection</span>
          </Button>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto p-2">
          {/* Mobile Product Cards (< md) */}
          <div className="space-y-3 p-1.5 md:hidden">
            {products.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No products found in the database.
              </p>
            ) : (
              products.map((p) => {
                const categoryName =
                  categories.find((c) => c.id === p.categoryId)?.name ??
                  p.categoryName ??
                  p.categorySlug;

                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-border/80 bg-background/60 p-3.5 space-y-3 transition-colors"
                  >
                    {/* Top Row: Thumbnail, Name, Category, Price & Availability Switch */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <ProductThumbnail image={p.image} name={p.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="font-medium text-sm text-foreground truncate">
                              {p.name}
                            </h3>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {categoryName}
                            </Badge>
                          </div>
                          <p className="mt-0.5 font-display text-xs font-semibold text-primary">
                            {formatETB(p.price)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5 flex flex-col items-end gap-1">
                        <Switch
                          checked={p.available}
                          disabled={togglingId === p.id}
                          aria-label={`Toggle ${p.name}`}
                          onCheckedChange={(checked) => handleToggleAvailability(p, checked)}
                        />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {p.available ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Description if present */}
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    )}

                    {/* Bottom Row: Action Edit button */}
                    <div className="pt-2 flex justify-end border-t border-border/40">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                        className="h-8 px-3 text-xs gap-1.5"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Price</th>
                  <th className="p-3 font-medium">Active</th>
                  <th className="p-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No products found in the database.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail image={p.image} name={p.name} />
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {p.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary">
                          {categories.find((c) => c.id === p.categoryId)?.name ??
                            p.categoryName ??
                            p.categorySlug}
                        </Badge>
                      </td>
                      <td className="p-3">{formatETB(p.price)}</td>
                      <td className="p-3">
                        <Switch
                          checked={p.available}
                          disabled={togglingId === p.id}
                          aria-label={`Toggle ${p.name}`}
                          onCheckedChange={(checked) => handleToggleAvailability(p, checked)}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="size-4" /> Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
          }
        }}
      >
        <ProductDialog
          title={editing ? "Edit product" : "New product"}
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          categories={categories}
          isSubmitting={isSubmitting}
          uploadStatus={uploadStatus}
        />
      </Dialog>
    </div>
  );
}

function ProductDialog({
  title,
  draft,
  setDraft,
  onSave,
  categories,
  isSubmitting,
  uploadStatus,
}: {
  title: string;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onSave: () => void;
  categories: Category[];
  isSubmitting: boolean;
  uploadStatus: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Manage local object URL lifecycle for selected device file
  useEffect(() => {
    if (draft.imageFile) {
      const objectUrl = URL.createObjectURL(draft.imageFile);
      setLocalPreviewUrl(objectUrl);
      setPreviewError(false);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
    setLocalPreviewUrl(null);
    setPreviewError(false);
    return undefined;
  }, [draft.imageFile]);

  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProductImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid image file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setDraft((prev) => ({ ...prev, imageFile: file }));
  };

  // Handle removing image
  const handleRemoveImage = () => {
    setDraft((prev) => ({ ...prev, imageUrl: "", imageFile: null }));
    setLocalPreviewUrl(null);
    setPreviewError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // The active display image is either local file preview or existing/entered URL
  const activeImageUrl = localPreviewUrl || draft.imageUrl.trim();

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-1">
        <div className="space-y-2">
          <Label htmlFor="p-name">Product Name</Label>
          <Input
            id="p-name"
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Classic Burger"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-price">Price (ETB)</Label>
          <Input
            id="p-price"
            type="number"
            min={1}
            value={draft.price}
            onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))}
            placeholder="e.g. 250"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-cat">Category</Label>
          <select
            id="p-cat"
            value={draft.categoryId}
            onChange={(e) => setDraft((prev) => ({ ...prev, categoryId: e.target.value }))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {categories.length === 0 ? (
              <option value="">No categories available</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {!c.isActive ? "(Inactive)" : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {/* PRODUCT IMAGE UPLOAD SECTION */}
        <div className="space-y-2">
          <Label>Product Image</Label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            className="hidden"
            onChange={handleFileChange}
          />

          {activeImageUrl ? (
            <div className="rounded-lg border border-border bg-card p-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
                  {previewError ? (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UtensilsCrossed className="size-6 text-muted-foreground/60" />
                    </div>
                  ) : (
                    <img
                      src={activeImageUrl}
                      alt="Product preview"
                      className="size-full object-cover"
                      onError={() => setPreviewError(true)}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  {draft.imageFile ? (
                    <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                      <Check className="size-3.5 text-primary shrink-0" />
                      <span className="truncate">{draft.imageFile.name}</span>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-foreground">Current image</p>
                  )}
                  {draft.imageFile && (
                    <p className="text-[11px] text-muted-foreground">
                      {(draft.imageFile.size / 1024).toFixed(0)} KB • Ready to upload
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 text-xs gap-1.5 px-3"
                    >
                      <Upload className="size-3.5" /> Change image
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                      className="h-9 text-xs gap-1.5 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                <UploadCloud className="size-5" />
              </div>
              <p className="text-sm font-medium text-foreground">Select a product image</p>
              <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, or WEBP up to 5 MB</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 gap-1.5"
              >
                <Upload className="size-3.5" /> Choose Image
              </Button>
            </div>
          )}

          {/* Optional Image URL toggle */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setShowUrlInput((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              {showUrlInput ? "Hide image URL option" : "Or enter an image URL instead"}
            </button>
            {showUrlInput && (
              <div className="mt-2 space-y-1">
                <Input
                  id="p-img-url"
                  type="url"
                  value={draft.imageUrl}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      imageUrl: e.target.value,
                      imageFile: null,
                    }))
                  }
                  placeholder="https://example.com/product-image.jpg"
                  className="text-xs h-9"
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-desc">Description</Label>
          <Input
            id="p-desc"
            value={draft.description}
            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="e.g. Fresh beef patty, cheese and vegetables"
          />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onSave} disabled={isSubmitting}>
          {uploadStatus || (isSubmitting ? "Saving…" : "Save product")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
