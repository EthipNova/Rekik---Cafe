import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Coffee,
  FileText,
  HeartHandshake,
  ImagePlus,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ABOUT_CONTENT, isValidUUID, type AboutContent } from "@/lib/content";
import { uploadSiteImage, validateSiteImageFile, type SiteImageCategory } from "@/lib/site-images";
import { fetchAboutContent, updateAboutContent } from "@/services/api";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "Website Content — Rekik Café" },
      {
        name: "description",
        content: "Manage the homepage hero and About page story and values for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminContentPage,
});

interface SiteImageUploaderProps {
  id: string;
  label: string;
  category: SiteImageCategory;
  value: string | null;
  onChange: (url: string | null) => void;
  recommendedText: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

function SiteImageUploader({
  id,
  label,
  category,
  value,
  onChange,
  recommendedText,
  disabled = false,
  onUploadingChange,
}: SiteImageUploaderProps) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up temporary object URLs on unmount or preview changes
  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate file format and size constraint (<= 5 MB)
    const validation = validateSiteImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid image file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Clean up previous local blob preview if one exists
    if (localPreviewUrl && localPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    // 3. Create local preview and mark uploading state
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    setSelectedFileName(file.name);
    setPreviewError(false);
    setIsUploading(true);
    onUploadingChange?.(true);

    try {
      // 4. Upload to site-images/{category}/ folder
      const uploadResult = await uploadSiteImage(category, file);

      if (uploadResult.error || !uploadResult.url) {
        toast.error(uploadResult.error?.message || "Image upload failed. Please try again.");
        // Do not update form state or overwrite existing URL
        setLocalPreviewUrl(null);
        setSelectedFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // 5. Put received public URL into parent form state (marking overall form as dirty)
      onChange(uploadResult.url);
      toast.success("Image uploaded. Click 'Save Changes' to apply.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image.";
      toast.error(msg);
      setLocalPreviewUrl(null);
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    if (localPreviewUrl && localPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(null);
    setSelectedFileName(null);
    setPreviewError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onChange(null);
    toast.info("Image removed. Click 'Save Changes' to apply.");
  };

  const activeImage = localPreviewUrl || value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {isUploading ? (
          <Badge
            variant="outline"
            className="text-primary border-primary/30 bg-primary/10 gap-1 text-[11px]"
          >
            <Loader2 className="size-3 animate-spin" />
            Uploading…
          </Badge>
        ) : activeImage ? (
          <Badge
            variant="outline"
            className="text-success border-success/30 bg-success/10 gap-1 text-[11px]"
          >
            <CheckCircle2 className="size-3" />
            Image Ready
          </Badge>
        ) : null}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
      />

      {activeImage ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-56 h-36 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/30">
              {previewError ? (
                <div className="flex size-full flex-col items-center justify-center p-3 text-center text-muted-foreground">
                  <AlertCircle className="size-6 text-destructive/70 mb-1" />
                  <span className="text-xs">Preview unavailable</span>
                </div>
              ) : (
                <img
                  src={activeImage}
                  alt={label}
                  className="size-full object-cover"
                  onError={() => setPreviewError(true)}
                />
              )}
              {isUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs gap-1.5">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span className="text-xs font-medium text-foreground">Uploading…</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2 w-full">
              {selectedFileName ? (
                <p className="text-xs font-medium text-foreground truncate">
                  Selected: {selectedFileName}
                </p>
              ) : (
                <p className="text-xs font-medium text-foreground">Current website image</p>
              )}
              <p className="text-xs text-muted-foreground">{recommendedText}</p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5 text-xs h-8"
                >
                  <Upload className="size-3.5" />
                  {isUploading ? "Uploading…" : "Change Image"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || isUploading}
                  onClick={handleRemove}
                  className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-muted/10 p-6 sm:p-8 text-center transition hover:border-primary/40 hover:bg-muted/20">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <UploadCloud className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No image selected</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">{recommendedText}</p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Supported formats: JPG, PNG, or WEBP (up to 5 MB)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 gap-2 text-xs"
          >
            {isUploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <ImagePlus className="size-3.5" />
                Choose Image
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminContentPage() {
  const [savedContent, setSavedContent] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);
  const [form, setForm] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAboutContent();
      setSavedContent(data);
      setForm(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load website content";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleUploadingChange = (uploading: boolean) => {
    setUploadingCount((prev) => Math.max(0, prev + (uploading ? 1 : -1)));
  };

  const isUploadingAny = uploadingCount > 0;

  const isDirty =
    (form.homepage_hero_image ?? "") !== (savedContent.homepage_hero_image ?? "") ||
    (form.about_hero_image ?? "") !== (savedContent.about_hero_image ?? "") ||
    form.about_title !== savedContent.about_title ||
    form.about_description !== savedContent.about_description ||
    form.story_title !== savedContent.story_title ||
    form.story_content !== savedContent.story_content ||
    (form.story_image ?? "") !== (savedContent.story_image ?? "") ||
    form.value_1_title !== savedContent.value_1_title ||
    form.value_1_description !== savedContent.value_1_description ||
    form.value_2_title !== savedContent.value_2_title ||
    form.value_2_description !== savedContent.value_2_description ||
    form.value_3_title !== savedContent.value_3_title ||
    form.value_3_description !== savedContent.value_3_description;

  const handleFieldChange = <K extends keyof AboutContent>(key: K, value: AboutContent[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDiscard = () => {
    setForm(savedContent);
    toast.info("Unsaved changes discarded");
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving || isUploadingAny || !isDirty) return;

    // Lightweight client validation
    if (!form.about_title.trim()) {
      toast.error("About page title is required");
      return;
    }
    if (!form.about_description.trim()) {
      toast.error("About page description is required");
      return;
    }
    if (!form.story_title.trim()) {
      toast.error("Story title is required");
      return;
    }
    if (!form.story_content.trim()) {
      toast.error("Story content is required");
      return;
    }
    if (!form.value_1_title.trim() || !form.value_1_description.trim()) {
      toast.error("Value 1 title and description are required");
      return;
    }
    if (!form.value_2_title.trim() || !form.value_2_description.trim()) {
      toast.error("Value 2 title and description are required");
      return;
    }
    if (!form.value_3_title.trim() || !form.value_3_description.trim()) {
      toast.error("Value 3 title and description are required");
      return;
    }

    if (form.id && !isValidUUID(form.id)) {
      toast.error(`Invalid content record ID: "${form.id}". A valid UUID is required.`);
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<AboutContent> = {
        id: form.id,
        homepage_hero_image: form.homepage_hero_image?.trim() || null,
        about_hero_image: form.about_hero_image?.trim() || null,
        about_title: form.about_title.trim(),
        about_description: form.about_description.trim(),
        story_title: form.story_title.trim(),
        story_content: form.story_content.trim(),
        story_image: form.story_image?.trim() || null,
        value_1_title: form.value_1_title.trim(),
        value_1_description: form.value_1_description.trim(),
        value_2_title: form.value_2_title.trim(),
        value_2_description: form.value_2_description.trim(),
        value_3_title: form.value_3_title.trim(),
        value_3_description: form.value_3_description.trim(),
      };

      const updated = await updateAboutContent(payload);
      setSavedContent(updated);
      setForm(updated);
      toast.success("Website content saved successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save website content";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading website content…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card p-12 text-center space-y-4 max-w-xl mx-auto">
        <AlertCircle className="size-10 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">We couldn't load the website content.</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RotateCcw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-semibold">Website Content</h1>
            {isDirty ? (
              <Badge
                variant="outline"
                className="text-amber-600 border-amber-500/30 bg-amber-500/10 text-xs"
              >
                Unsaved changes
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-success border-success/30 bg-success/10 text-xs"
              >
                <CheckCircle2 className="size-3 mr-1" />
                Saved
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the content shown on the Rekik Café website.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscard}
              disabled={isSaving || isUploadingAny}
              className="gap-1.5"
            >
              <Undo2 className="size-4" />
              Discard
            </Button>
          )}
          <Button
            type="button"
            onClick={() => handleSave()}
            disabled={!isDirty || isSaving || isUploadingAny}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : isUploadingAny ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading image…
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Homepage Hero Section */}
        <div className="surface-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Homepage</h2>
              <p className="text-xs text-muted-foreground">
                Visual elements displayed on the public homepage.
              </p>
            </div>
          </div>

          <SiteImageUploader
            id="content-hero-img"
            label="Homepage Hero Image"
            category="homepage"
            value={form.homepage_hero_image}
            onChange={(url) => handleFieldChange("homepage_hero_image", url)}
            recommendedText="Recommended: a wide, high-quality landscape photo (1920×1080 or wider, up to 5 MB)."
            disabled={isSaving}
            onUploadingChange={handleUploadingChange}
          />
        </div>

        {/* 2. About Page Section */}
        <div className="surface-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">About Page</h2>
              <p className="text-xs text-muted-foreground">
                Main headline, introductory narrative, and featured image on the About page.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <SiteImageUploader
              id="content-about-hero"
              label="About Page Hero Image"
              category="about"
              value={form.about_hero_image}
              onChange={(url) => handleFieldChange("about_hero_image", url)}
              recommendedText="Recommended: an inviting photograph representing Rekik Café's space or team."
              disabled={isSaving}
              onUploadingChange={handleUploadingChange}
            />

            <div className="space-y-2">
              <Label htmlFor="content-about-title">
                About Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="content-about-title"
                required
                placeholder="A neighbourhood café, thoughtfully modernised"
                value={form.about_title}
                onChange={(e) => handleFieldChange("about_title", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Main page headline displayed prominently at the top of the About page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content-about-desc">
                About Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="content-about-desc"
                required
                rows={5}
                placeholder="Introductory story about Rekik Café..."
                value={form.about_description}
                onChange={(e) => handleFieldChange("about_description", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Introductory paragraph explaining the café concept, food focus, and ordering
                experience.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Our Story Section */}
        <div className="surface-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coffee className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Our Story</h2>
              <p className="text-xs text-muted-foreground">
                Detailed story narrative explaining the café's kitchen, hospitality, and craft.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="content-story-title">
                Story Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="content-story-title"
                required
                placeholder="Our Story"
                value={form.story_title}
                onChange={(e) => handleFieldChange("story_title", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content-story-content">
                Story Content <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="content-story-content"
                required
                rows={7}
                placeholder="Detailed craft and hospitality story..."
                value={form.story_content}
                onChange={(e) => handleFieldChange("story_content", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Detailed narrative about kitchen preparation, order visibility, and customer
                experience.
              </p>
            </div>

            <SiteImageUploader
              id="content-story-img"
              label="Our Story Image"
              category="story"
              value={form.story_image}
              onChange={(url) => handleFieldChange("story_image", url)}
              recommendedText="Recommended: a photo highlighting your kitchen, coffee brewing, or craft."
              disabled={isSaving}
              onUploadingChange={handleUploadingChange}
            />
          </div>
        </div>

        {/* 4. Our Values Section */}
        <div className="surface-card p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HeartHandshake className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Our Values</h2>
              <p className="text-xs text-muted-foreground">
                The three core commitments displayed in the values grid on the About page.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Value 1 */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-medium text-xs uppercase tracking-wider">
                <Coffee className="size-3.5" aria-hidden />
                Value 1
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-1-title" className="text-xs">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="val-1-title"
                  required
                  placeholder="Food we're proud of"
                  value={form.value_1_title}
                  onChange={(e) => handleFieldChange("value_1_title", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-1-desc" className="text-xs">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="val-1-desc"
                  required
                  rows={4}
                  placeholder="Description of Value 1..."
                  value={form.value_1_description}
                  onChange={(e) => handleFieldChange("value_1_description", e.target.value)}
                />
              </div>
            </div>

            {/* Value 2 */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-medium text-xs uppercase tracking-wider">
                <HeartHandshake className="size-3.5" aria-hidden />
                Value 2
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-2-title" className="text-xs">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="val-2-title"
                  required
                  placeholder="Genuine hospitality"
                  value={form.value_2_title}
                  onChange={(e) => handleFieldChange("value_2_title", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-2-desc" className="text-xs">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="val-2-desc"
                  required
                  rows={4}
                  placeholder="Description of Value 2..."
                  value={form.value_2_description}
                  onChange={(e) => handleFieldChange("value_2_description", e.target.value)}
                />
              </div>
            </div>

            {/* Value 3 */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-medium text-xs uppercase tracking-wider">
                <Sparkles className="size-3.5" aria-hidden />
                Value 3
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-3-title" className="text-xs">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="val-3-title"
                  required
                  placeholder="Modern by design"
                  value={form.value_3_title}
                  onChange={(e) => handleFieldChange("value_3_title", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-3-desc" className="text-xs">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="val-3-desc"
                  required
                  rows={4}
                  placeholder="Description of Value 3..."
                  value={form.value_3_description}
                  onChange={(e) => handleFieldChange("value_3_description", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            {isDirty
              ? "You have unsaved changes. Click Save Changes to apply them."
              : "All changes are saved."}
          </p>

          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDiscard}
                disabled={isSaving || isUploadingAny}
                className="gap-1.5"
              >
                <Undo2 className="size-4" />
                Discard
              </Button>
            )}
            <Button
              type="submit"
              disabled={!isDirty || isSaving || isUploadingAny}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : isUploadingAny ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Uploading image…
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
