import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  HeartHandshake,
  Home,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Phone,
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
import heroFallback from "@/assets/rekik-hero.jpg";
import aboutFallback from "@/assets/rekik-story.jpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_ABOUT_CONTENT, isValidUUID, type AboutContent } from "@/lib/content";
import { DEFAULT_SETTINGS, type NebaSettings } from "@/lib/settings";
import { uploadSiteImage, validateSiteImageFile, type SiteImageCategory } from "@/lib/site-images";
import {
  fetchAboutContent,
  updateAboutContent,
  fetchSettings,
  updateSettings,
} from "@/services/api";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "Website Content Management — Rekik Café Admin" },
      {
        name: "description",
        content: "Manage the words, headings, photos, and public information for Rekik Café.",
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
  aspectRatioClass?: string;
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
  aspectRatioClass = "aspect-video",
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
        setLocalPreviewUrl(null);
        setSelectedFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // 5. Put received public URL into parent form state
      onChange(uploadResult.url);
      toast.success("Image uploaded. Remember to click 'Save Changes' to apply.");
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
            <div
              className={`relative w-full sm:w-56 ${aspectRatioClass} shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/30`}
            >
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
  const [activeTab, setActiveTab] = useState<string>("homepage");

  // Content state (About & Homepage)
  const [savedContent, setSavedContent] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);
  const [contentForm, setContentForm] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);

  // Settings state (Contact Information)
  const [savedSettings, setSavedSettings] = useState<NebaSettings>(DEFAULT_SETTINGS);
  const [settingsForm, setSettingsForm] = useState<NebaSettings>(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentData, settingsData] = await Promise.all([
        fetchAboutContent(),
        fetchSettings(),
      ]);
      setSavedContent(contentData);
      setContentForm(contentData);
      setSavedSettings(settingsData);
      setSettingsForm(settingsData);
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

  // Dirty check for website content
  const isContentDirty =
    (contentForm.homepage_hero_image ?? "") !== (savedContent.homepage_hero_image ?? "") ||
    contentForm.homepage_hero_title !== savedContent.homepage_hero_title ||
    contentForm.homepage_hero_subtitle !== savedContent.homepage_hero_subtitle ||
    (contentForm.about_hero_image ?? "") !== (savedContent.about_hero_image ?? "") ||
    contentForm.about_title !== savedContent.about_title ||
    contentForm.about_description !== savedContent.about_description ||
    contentForm.story_title !== savedContent.story_title ||
    contentForm.story_content !== savedContent.story_content ||
    (contentForm.story_image ?? "") !== (savedContent.story_image ?? "") ||
    contentForm.value_1_title !== savedContent.value_1_title ||
    contentForm.value_1_description !== savedContent.value_1_description ||
    contentForm.value_2_title !== savedContent.value_2_title ||
    contentForm.value_2_description !== savedContent.value_2_description ||
    contentForm.value_3_title !== savedContent.value_3_title ||
    contentForm.value_3_description !== savedContent.value_3_description;

  // Dirty check for contact settings
  const isSettingsDirty =
    settingsForm.phone !== savedSettings.phone ||
    settingsForm.email !== savedSettings.email ||
    settingsForm.address !== savedSettings.address ||
    settingsForm.openingHours !== savedSettings.openingHours;

  const handleContentFieldChange = <K extends keyof AboutContent>(
    key: K,
    value: AboutContent[K],
  ) => {
    setContentForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSettingsFieldChange = <K extends keyof NebaSettings>(
    key: K,
    value: NebaSettings[K],
  ) => {
    setSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDiscardContent = () => {
    setContentForm(savedContent);
    toast.info("Unsaved website content changes discarded.");
  };

  const handleDiscardSettings = () => {
    setSettingsForm(savedSettings);
    toast.info("Unsaved contact changes discarded.");
  };

  const handleSaveContent = async () => {
    if (isSavingContent || isUploadingAny || !isContentDirty) return;

    // Validation
    if (!contentForm.homepage_hero_title.trim()) {
      toast.error("Homepage hero title is required");
      return;
    }
    if (!contentForm.homepage_hero_subtitle.trim()) {
      toast.error("Homepage hero subtitle is required");
      return;
    }
    if (!contentForm.about_title.trim()) {
      toast.error("About page title is required");
      return;
    }
    if (!contentForm.about_description.trim()) {
      toast.error("About page description is required");
      return;
    }
    if (!contentForm.story_title.trim()) {
      toast.error("Story title is required");
      return;
    }
    if (!contentForm.story_content.trim()) {
      toast.error("Story content is required");
      return;
    }

    if (contentForm.id && !isValidUUID(contentForm.id)) {
      toast.error(`Invalid content record ID: "${contentForm.id}". A valid UUID is required.`);
      return;
    }

    setIsSavingContent(true);
    try {
      const payload: Partial<AboutContent> = {
        id: contentForm.id,
        homepage_hero_image: contentForm.homepage_hero_image?.trim() || null,
        homepage_hero_title: contentForm.homepage_hero_title.trim(),
        homepage_hero_subtitle: contentForm.homepage_hero_subtitle.trim(),
        about_hero_image: contentForm.about_hero_image?.trim() || null,
        about_title: contentForm.about_title.trim(),
        about_description: contentForm.about_description.trim(),
        story_title: contentForm.story_title.trim(),
        story_content: contentForm.story_content.trim(),
        story_image: contentForm.story_image?.trim() || null,
        value_1_title: contentForm.value_1_title.trim(),
        value_1_description: contentForm.value_1_description.trim(),
        value_2_title: contentForm.value_2_title.trim(),
        value_2_description: contentForm.value_2_description.trim(),
        value_3_title: contentForm.value_3_title.trim(),
        value_3_description: contentForm.value_3_description.trim(),
      };

      const updated = await updateAboutContent(payload);
      setSavedContent(updated);
      setContentForm(updated);
      toast.success("Website content saved successfully. The public website has been updated.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save website content";
      toast.error(message);
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveSettings = async () => {
    if (isSavingSettings || !isSettingsDirty) return;

    if (!settingsForm.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!settingsForm.email.trim()) {
      toast.error("Email address is required");
      return;
    }
    if (!settingsForm.address.trim()) {
      toast.error("Café address is required");
      return;
    }
    if (!settingsForm.openingHours.trim()) {
      toast.error("Opening hours are required");
      return;
    }

    setIsSavingSettings(true);
    try {
      const updated = await updateSettings({
        phone: settingsForm.phone.trim(),
        email: settingsForm.email.trim(),
        address: settingsForm.address.trim(),
        openingHours: settingsForm.openingHours.trim(),
      });
      setSavedSettings(updated);
      setSettingsForm(updated);
      toast.success("Contact information saved successfully. Updated across the public website.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update contact information";
      toast.error(message);
    } finally {
      setIsSavingSettings(false);
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

  const isAnyDirty = isContentDirty || isSettingsDirty;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-semibold">Website Content</h1>
            {isAnyDirty ? (
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
            Easily update words, headings, descriptions, and photos shown on the public Rekik Café
            website.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/" target="_blank" rel="noopener noreferrer">
              <Eye className="size-3.5" />
              View Live Website
              <ExternalLink className="size-3 opacity-60" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/60 rounded-xl">
          <TabsTrigger value="homepage" className="gap-2 py-2.5 text-xs sm:text-sm">
            <Home className="size-4" />
            Homepage
          </TabsTrigger>
          <TabsTrigger value="about" className="gap-2 py-2.5 text-xs sm:text-sm">
            <FileText className="size-4" />
            About Us
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-2 py-2.5 text-xs sm:text-sm">
            <Phone className="size-4" />
            Contact Info
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-2 py-2.5 text-xs sm:text-sm">
            <ImageIcon className="size-4" />
            Images & Media
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: HOMEPAGE
           ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="homepage" className="space-y-6">
          <div className="surface-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Homepage Hero Section</h2>
                <p className="text-xs text-muted-foreground">
                  The first visual banner and headline customers see when visiting the website.
                </p>
              </div>
            </div>

            {/* Live Visual Preview Card */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Eye className="size-3.5 text-primary" />
                Live Preview (What customers see)
              </Label>
              <div className="relative overflow-hidden rounded-2xl border border-border bg-[#1F1713] p-6 text-warm-white shadow-md">
                <div className="relative z-10 max-w-xl space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#E8A87C] bg-[#E8A87C]/15 px-2.5 py-0.5 rounded-full border border-[#E8A87C]/30 inline-block">
                    Hero Preview
                  </span>
                  <h3 className="font-display text-2xl font-bold leading-tight text-[#FAF7F2]">
                    {contentForm.homepage_hero_title ||
                      "Rooted in Tradition. Crafted for the Modern Palate."}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#F4EBDD]/80 line-clamp-3">
                    {contentForm.homepage_hero_subtitle ||
                      "Discover the pure elegance of Ethiopian highland coffees, small-batch roasted to perfection."}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <span className="inline-block text-[11px] font-semibold bg-[#E8A87C] text-[#1F1713] px-3 py-1 rounded-full">
                      Order Coffee Now
                    </span>
                    <span className="inline-block text-[11px] font-medium border border-white/20 bg-white/10 text-white px-3 py-1 rounded-full">
                      Explore Menu
                    </span>
                  </div>
                </div>

                {/* Background image preview if available */}
                {contentForm.homepage_hero_image && (
                  <div className="absolute inset-0 opacity-25">
                    <img
                      src={contentForm.homepage_hero_image}
                      alt="Hero background preview"
                      className="size-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="content-hero-title">
                  Hero Title / Main Heading <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="content-hero-title"
                  required
                  placeholder="Rooted in Tradition. Crafted for the Modern Palate."
                  value={contentForm.homepage_hero_title}
                  onChange={(e) => handleContentFieldChange("homepage_hero_title", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The primary welcoming heading displayed in large letters on the homepage.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content-hero-subtitle">
                  Hero Subtitle / Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="content-hero-subtitle"
                  required
                  rows={4}
                  placeholder="Discover the pure elegance of Ethiopian highland coffees, small-batch roasted to perfection..."
                  value={contentForm.homepage_hero_subtitle}
                  onChange={(e) =>
                    handleContentFieldChange("homepage_hero_subtitle", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Descriptive welcoming message introducing Rekik Café, single-origin roasts, and
                  ordering options.
                </p>
              </div>

              <div className="pt-2">
                <SiteImageUploader
                  id="content-hero-img"
                  label="Homepage Hero Image"
                  category="homepage"
                  value={contentForm.homepage_hero_image}
                  onChange={(url) => handleContentFieldChange("homepage_hero_image", url)}
                  recommendedText="Recommended: high-resolution landscape photo (1920×1080 or wider, up to 5 MB)."
                  disabled={isSavingContent}
                  onUploadingChange={handleUploadingChange}
                />
              </div>
            </div>

            {/* Save bar for Homepage */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <p className="text-xs text-muted-foreground">
                {isContentDirty
                  ? "You have unsaved changes. Click Save Changes to update the live homepage."
                  : "Homepage content is saved."}
              </p>
              <div className="flex items-center gap-2">
                {isContentDirty && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscardContent}
                    disabled={isSavingContent || isUploadingAny}
                    className="gap-1.5"
                  >
                    <Undo2 className="size-4" />
                    Discard
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSaveContent}
                  disabled={!isContentDirty || isSavingContent || isUploadingAny}
                  className="gap-2"
                >
                  {isSavingContent ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
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
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: ABOUT US
           ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="about" className="space-y-6">
          {/* 1. About Page Intro */}
          <div className="surface-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">About Page Overview</h2>
                <p className="text-xs text-muted-foreground">
                  Headline, intro narrative, and featured photo on the public About page.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content-about-title">
                  About Page Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="content-about-title"
                  required
                  placeholder="A neighbourhood café, thoughtfully modernised"
                  value={contentForm.about_title}
                  onChange={(e) => handleContentFieldChange("about_title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content-about-desc">
                  About Page Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="content-about-desc"
                  required
                  rows={4}
                  placeholder="Introductory story about Rekik Café..."
                  value={contentForm.about_description}
                  onChange={(e) => handleContentFieldChange("about_description", e.target.value)}
                />
              </div>

              <SiteImageUploader
                id="content-about-hero"
                label="About Page Hero Image"
                category="about"
                value={contentForm.about_hero_image}
                onChange={(url) => handleContentFieldChange("about_hero_image", url)}
                recommendedText="Recommended: photograph showing the café interior, roasting bar, or staff."
                disabled={isSavingContent}
                onUploadingChange={handleUploadingChange}
              />
            </div>
          </div>

          {/* 2. Our Story Section */}
          <div className="surface-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Coffee className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Our Story & Heritage</h2>
                <p className="text-xs text-muted-foreground">
                  Detailed story describing the café's kitchen, roasting tradition, and hospitality.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content-story-title">
                  Story Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="content-story-title"
                  required
                  placeholder="Our Story"
                  value={contentForm.story_title}
                  onChange={(e) => handleContentFieldChange("story_title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content-story-content">
                  Story Content <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="content-story-content"
                  required
                  rows={6}
                  placeholder="Detailed craft, coffee roasting, and kitchen story..."
                  value={contentForm.story_content}
                  onChange={(e) => handleContentFieldChange("story_content", e.target.value)}
                />
              </div>

              <SiteImageUploader
                id="content-story-img"
                label="Our Story Image"
                category="story"
                value={contentForm.story_image}
                onChange={(url) => handleContentFieldChange("story_image", url)}
                recommendedText="Recommended: photo highlighting fresh coffee brewing, latte art, or food preparation."
                disabled={isSavingContent}
                onUploadingChange={handleUploadingChange}
              />
            </div>
          </div>

          {/* 3. Core Values */}
          <div className="surface-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HeartHandshake className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Core Values</h2>
                <p className="text-xs text-muted-foreground">
                  The three commitments displayed in the values grid on the About page.
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
                    Title
                  </Label>
                  <Input
                    id="val-1-title"
                    required
                    value={contentForm.value_1_title}
                    onChange={(e) => handleContentFieldChange("value_1_title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-1-desc" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="val-1-desc"
                    required
                    rows={4}
                    value={contentForm.value_1_description}
                    onChange={(e) =>
                      handleContentFieldChange("value_1_description", e.target.value)
                    }
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
                    Title
                  </Label>
                  <Input
                    id="val-2-title"
                    required
                    value={contentForm.value_2_title}
                    onChange={(e) => handleContentFieldChange("value_2_title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-2-desc" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="val-2-desc"
                    required
                    rows={4}
                    value={contentForm.value_2_description}
                    onChange={(e) =>
                      handleContentFieldChange("value_2_description", e.target.value)
                    }
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
                    Title
                  </Label>
                  <Input
                    id="val-3-title"
                    required
                    value={contentForm.value_3_title}
                    onChange={(e) => handleContentFieldChange("value_3_title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-3-desc" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="val-3-desc"
                    required
                    rows={4}
                    value={contentForm.value_3_description}
                    onChange={(e) =>
                      handleContentFieldChange("value_3_description", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            {/* Save bar for About Us */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <p className="text-xs text-muted-foreground">
                {isContentDirty
                  ? "You have unsaved changes. Click Save Changes to update the live website."
                  : "About Us content is saved."}
              </p>
              <div className="flex items-center gap-2">
                {isContentDirty && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscardContent}
                    disabled={isSavingContent || isUploadingAny}
                    className="gap-1.5"
                  >
                    <Undo2 className="size-4" />
                    Discard
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSaveContent}
                  disabled={!isContentDirty || isSavingContent || isUploadingAny}
                  className="gap-2"
                >
                  {isSavingContent ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
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
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: CONTACT INFORMATION
           ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="contact" className="space-y-6">
          <div className="surface-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Phone className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Public Contact Information</h2>
                <p className="text-xs text-muted-foreground">
                  Update the phone number, email address, physical location, and opening hours shown
                  across the website.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-phone" className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-phone"
                  required
                  placeholder="+251 91 123 4567"
                  value={settingsForm.phone}
                  onChange={(e) => handleSettingsFieldChange("phone", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Displayed on the Contact page, in customer order receipts, and in the website
                  footer.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-email" className="flex items-center gap-1.5">
                  <Mail className="size-3.5 text-primary" />
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  placeholder="hello@rekikcafe.com"
                  value={settingsForm.email}
                  onChange={(e) => handleSettingsFieldChange("email", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The primary public contact email address.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contact-address" className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" />
                  Café Physical Location / Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-address"
                  required
                  placeholder="Piassa, Next to Kibru Hospital, Hawassa, Ethiopia."
                  value={settingsForm.address}
                  onChange={(e) => handleSettingsFieldChange("address", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Full street address and neighbourhood description shown to guests and for
                  deliveries.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contact-hours" className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-primary" />
                  Opening Hours <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-hours"
                  required
                  placeholder="Mon – Sun: 7:00 AM – 10:00 PM"
                  value={settingsForm.openingHours}
                  onChange={(e) => handleSettingsFieldChange("openingHours", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Weekly schedule displayed on the Contact page and footer.
                </p>
              </div>
            </div>

            {/* Save bar for Contact */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <p className="text-xs text-muted-foreground">
                {isSettingsDirty
                  ? "You have unsaved changes. Click Save Contact Info to update the website."
                  : "Contact details are saved and up to date."}
              </p>
              <div className="flex items-center gap-2">
                {isSettingsDirty && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscardSettings}
                    disabled={isSavingSettings}
                    className="gap-1.5"
                  >
                    <Undo2 className="size-4" />
                    Discard
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={!isSettingsDirty || isSavingSettings}
                  className="gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      Save Contact Info
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 4: MEDIA & PHOTOS
           ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="media" className="space-y-6">
          <div className="surface-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ImageIcon className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Website Media & Photos</h2>
                <p className="text-xs text-muted-foreground">
                  View, replace, or remove photos displayed across the main website sections.
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Image 1: Homepage Hero */}
              <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">Homepage Hero</h3>
                  <Badge variant="outline" className="text-[11px]">
                    Banner
                  </Badge>
                </div>
                <SiteImageUploader
                  id="media-hero-img"
                  label="Hero Photo"
                  category="homepage"
                  value={contentForm.homepage_hero_image}
                  onChange={(url) => handleContentFieldChange("homepage_hero_image", url)}
                  recommendedText="Landscape photo (1920×1080)."
                  disabled={isSavingContent}
                  onUploadingChange={handleUploadingChange}
                  aspectRatioClass="aspect-video"
                />
              </div>

              {/* Image 2: About Hero */}
              <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">About Page Hero</h3>
                  <Badge variant="outline" className="text-[11px]">
                    Featured
                  </Badge>
                </div>
                <SiteImageUploader
                  id="media-about-img"
                  label="About Photo"
                  category="about"
                  value={contentForm.about_hero_image}
                  onChange={(url) => handleContentFieldChange("about_hero_image", url)}
                  recommendedText="Café interior or team photo."
                  disabled={isSavingContent}
                  onUploadingChange={handleUploadingChange}
                  aspectRatioClass="aspect-video"
                />
              </div>

              {/* Image 3: Story Craft */}
              <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">Our Story Image</h3>
                  <Badge variant="outline" className="text-[11px]">
                    Story
                  </Badge>
                </div>
                <SiteImageUploader
                  id="media-story-img"
                  label="Craft / Roasting Photo"
                  category="story"
                  value={contentForm.story_image}
                  onChange={(url) => handleContentFieldChange("story_image", url)}
                  recommendedText="Coffee brewing or kitchen craft photo."
                  disabled={isSavingContent}
                  onUploadingChange={handleUploadingChange}
                  aspectRatioClass="aspect-video"
                />
              </div>
            </div>

            {/* Save bar for Media */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <p className="text-xs text-muted-foreground">
                {isContentDirty
                  ? "You have unsaved image changes. Click Save Changes to publish."
                  : "All media changes are saved."}
              </p>
              <div className="flex items-center gap-2">
                {isContentDirty && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscardContent}
                    disabled={isSavingContent || isUploadingAny}
                    className="gap-1.5"
                  >
                    <Undo2 className="size-4" />
                    Discard
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSaveContent}
                  disabled={!isContentDirty || isSavingContent || isUploadingAny}
                  className="gap-2"
                >
                  {isSavingContent ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
