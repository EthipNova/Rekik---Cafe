import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeAdminPassword,
  deleteAdminAvatar,
  fetchCurrentAdminAccount,
  updateAdminProfile,
  uploadAdminAvatar,
  getInitials,
  type AdminAccountProfile,
} from "@/lib/admin-account";

export const Route = createFileRoute("/admin/account")({
  head: () => ({
    meta: [
      { title: "Admin Account & Profile — Rekik Coffee" },
      {
        name: "description",
        content:
          "Manage your Rekik Coffee administrator credentials, profile details, and account security.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAccountPage,
});

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function AdminAccountPage() {
  const [profile, setProfile] = useState<AdminAccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Copy ID feedback
  const [copiedId, setCopiedId] = useState(false);

  const loadAccount = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchCurrentAdminAccount();
    if (error || !data) {
      setLoadError(error || "Unable to load account information.");
      setLoading(false);
      return;
    }

    setProfile(data);
    setFullName(data.fullName || "");
    setPhone(data.phone || "");
    setLoading(false);
  };

  useEffect(() => {
    void loadAccount();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    const res = await updateAdminProfile({
      fullName,
      phone,
    });

    setSavingProfile(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update profile.");
      return;
    }

    setProfile((prev) => (prev ? { ...prev, fullName, phone } : prev));
    toast.success("Profile details saved successfully.");
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingAvatar(true);
    const res = await uploadAdminAvatar(file, profile.avatarUrl);
    setUploadingAvatar(false);

    // Reset input value so same file can be re-selected if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!res.success || !res.avatarUrl) {
      toast.error(res.error || "Failed to upload avatar.");
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl } : prev));
    toast.success("Profile photo updated.");
  };

  const handleRemoveAvatar = async () => {
    if (!profile || !profile.avatarUrl) return;

    setUploadingAvatar(true);
    const res = await deleteAdminAvatar(profile.avatarUrl);
    setUploadingAvatar(false);

    if (!res.success) {
      toast.error(res.error || "Failed to remove avatar.");
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
    toast.success("Profile photo removed.");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setUpdatingPassword(true);
    const res = await changeAdminPassword(currentPassword, newPassword);
    setUpdatingPassword(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update password.");
      return;
    }

    toast.success("Password changed successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleCopyId = () => {
    if (!profile?.id) return;
    navigator.clipboard.writeText(profile.id);
    setCopiedId(true);
    toast.success("Account ID copied to clipboard");
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="surface-card p-8 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-20 rounded-full bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-40 bg-muted animate-pulse rounded" />
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="h-10 bg-muted animate-pulse rounded mt-6" />
          <div className="h-10 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="surface-card p-8 max-w-xl text-center space-y-4">
        <AlertCircle className="size-10 text-destructive mx-auto" />
        <h1 className="font-display text-xl font-semibold">Unable to Load Account</h1>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button onClick={() => void loadAccount()} variant="outline">
          <RefreshCw className="size-4 mr-2" /> Try again
        </Button>
      </div>
    );
  }

  const initials = getInitials(profile.fullName, profile.email);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Page Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Account & Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal profile, credentials, and café staff authorization.
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary px-3 py-1 font-semibold text-xs tracking-wider uppercase"
        >
          <Shield className="size-3.5 mr-1" />
          {profile.role} Authorized
        </Badge>
      </header>

      {/* SECTION A: PROFILE */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="border-b border-border/60 pb-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <User className="size-5 text-primary" /> Profile Information
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your display name, contact phone number, and avatar in the Rekik Coffee console.
          </p>
        </div>

        {/* Avatar Management */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-lg bg-background/50 border border-border/60">
          <Avatar className="size-20 border-2 border-primary/30 shadow-sm shrink-0">
            {profile.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt={profile.fullName || profile.email} />
            )}
            <AvatarFallback className="bg-primary/15 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-1.5 flex-1">
            <h3 className="text-sm font-semibold text-foreground">Profile Picture</h3>
            <p className="text-xs text-muted-foreground">JPG, PNG or WEBP. Max file size: 5 MB.</p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileSelect}
                disabled={uploadingAvatar}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="size-3.5 mr-1.5" />
                {uploadingAvatar ? "Uploading…" : "Change photo"}
              </Button>

              {profile.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingAvatar}
                  onClick={handleRemoveAvatar}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Details Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prof-name">Full name</Label>
              <Input
                id="prof-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Abebe Kebede"
                autoComplete="name"
                disabled={savingProfile}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prof-phone">Phone number</Label>
              <Input
                id="prof-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+251 91 123 4567"
                autoComplete="tel"
                disabled={savingProfile}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Email (Read-Only) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prof-email">Email address</Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock className="size-3" /> Read-only
                </span>
              </div>
              <Input
                id="prof-email"
                type="email"
                value={profile.email}
                disabled
                className="bg-muted/50 cursor-not-allowed opacity-80"
              />
              <p className="text-[11px] text-muted-foreground">
                Authentication email is managed securely by Supabase Auth.
              </p>
            </div>

            {/* Role (Read-Only) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prof-role">Café access role</Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock className="size-3" /> Read-only
                </span>
              </div>
              <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/50 text-sm font-medium">
                <Badge
                  variant={profile.role === "ADMIN" ? "default" : "secondary"}
                  className="mr-2"
                >
                  {profile.role}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {profile.role === "ADMIN"
                    ? "Full administrative access to all operations"
                    : "Standard café operations access"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Role modifications require database administrator authorization.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={savingProfile}>
              <Save className="size-4 mr-2" />
              {savingProfile ? "Saving changes…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      {/* SECTION B: SECURITY & PASSWORD */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="border-b border-border/60 pb-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> Security & Password
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Update your authentication credentials. Passwords are encrypted and managed via Supabase
            Auth.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="curr-pwd">Current password</Label>
            <div className="relative">
              <Input
                id="curr-pwd"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={updatingPassword}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-pwd">New password</Label>
              <div className="relative">
                <Input
                  id="new-pwd"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  disabled={updatingPassword}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="conf-pwd">Confirm new password</Label>
              <div className="relative">
                <Input
                  id="conf-pwd"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  required
                  disabled={updatingPassword}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-background/50 border border-border/60 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Password criteria:</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`size-3.5 ${newPassword.length >= 8 ? "text-primary" : "text-muted-foreground/40"}`}
              />
              <span>Minimum 8 characters</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`size-3.5 ${newPassword && newPassword === confirmPassword ? "text-primary" : "text-muted-foreground/40"}`}
              />
              <span>Confirmation matching</span>
            </div>
          </div>

          <Button type="submit" disabled={updatingPassword} className="mt-2">
            <Lock className="size-4 mr-2" />
            {updatingPassword ? "Updating password…" : "Change password"}
          </Button>
        </form>
      </section>

      {/* SECTION C: ACCOUNT INFORMATION */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="border-b border-border/60 pb-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Shield className="size-5 text-primary" /> Account Details
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Read-only metadata and authentication session information.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Account ID</p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono truncate max-w-[200px]" title={profile.id}>
                {profile.id}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={handleCopyId}
                title="Copy Account ID"
              >
                {copiedId ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Authentication Email</p>
            <p className="font-mono text-xs truncate" title={profile.email}>
              {profile.email}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">System Role</p>
            <div>
              <Badge variant="outline" className="font-semibold">
                {profile.role}
              </Badge>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Account Created</p>
            <p className="text-xs text-foreground font-medium">
              {formatDate(profile.accountCreatedAt || profile.dbCreatedAt)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Last Sign-in</p>
            <p className="text-xs text-foreground font-medium">
              {formatDate(profile.lastSignInAt)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-background/50 border border-border/60 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Account Status</p>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Active Staff
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
