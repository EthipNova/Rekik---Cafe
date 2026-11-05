import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Coffee,
  Eye,
  EyeOff,
  Lock,
  UserCheck,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cashierSupabase, supabase } from "@/lib/supabase";
import type { CashierStaffProfile } from "@/lib/cashier";
import { LanguageSelector } from "@/components/site/LanguageSelector";
import { useTranslation } from "@/lib/i18n";

interface CashierLoginFormProps {
  onSuccess: (profile: CashierStaffProfile) => void;
  onRedirectAdmin?: () => void;
}

export function CashierLoginForm({ onSuccess, onRedirectAdmin }: CashierLoginFormProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [redirectAdminNotice, setRedirectAdminNotice] = useState(false);

  const validate = (): string | null => {
    const trimmedId = staffId.trim();
    if (!trimmedId) return "Please enter your Staff ID.";
    if (!password) return "Please enter your password.";
    return null;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRedirectAdminNotice(false);

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: staffId.trim(),
          password,
          targetPortal: "cashier",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json.status === "deactivated") {
          setErrorMsg(t("error.deactivated", "Your account has been deactivated."));
        } else if (json.status === "role_mismatch") {
          if (json.role === "admin") {
            setRedirectAdminNotice(true);
            setErrorMsg(
              "This account has Administrator privileges. Cashier dashboard is for cashier staff.",
            );
          } else {
            setErrorMsg(t("error.roleMismatch", "You do not have permission to access this portal."));
          }
        } else if (json.status === "not_found") {
          setErrorMsg(t("error.notFound", "Your Staff ID could not be found."));
        } else {
          setErrorMsg(json.message || json.error || t("error.invalidCredentials", "Invalid Staff ID or password."));
        }
        setLoading(false);
        return;
      }

      if (json.session) {
        await cashierSupabase.auth.setSession({
          access_token: json.session.access_token,
          refresh_token: json.session.refresh_token,
        });
      }

      const cashierProfile: CashierStaffProfile = {
        user_id: json.profile.userId,
        full_name: json.profile.fullName,
        role: json.profile.role,
        phone: json.profile.phone,
        is_active: json.profile.isActive,
        is_available: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email: json.user?.email || "",
      };

      toast.success(`Welcome back, ${json.profile.fullName}!`);
      onSuccess(cashierProfile);
      void navigate({ to: "/casher" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setErrorMsg(msg);
      toast.error("Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border border-[#EAE3D9] shadow-xl bg-white rounded-3xl overflow-hidden">
        {/* Top Accent Strip */}
        <div className="h-2 w-full bg-gradient-to-r from-[#1B110B] via-[#C8102E] to-[#E8A87C]" />

        <CardHeader className="space-y-3 text-center pt-8 pb-6 bg-[#FAF7F2]/60 relative">
          <div className="absolute right-4 top-4">
            <LanguageSelector variant="compact" />
          </div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B110B] text-[#E8A87C] shadow-md ring-4 ring-[#EAE3D9]">
            <Coffee className="h-7 w-7" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF2EB] text-[#5C3B28] border border-[#E6D5C7] mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C8102E]" />
              Cashier Portal
            </span>
            <CardTitle className="text-2xl font-bold tracking-tight text-[#2A1810] font-display">
              Rekik Café
            </CardTitle>
            <CardDescription className="text-xs text-[#70645C] mt-1 max-w-xs mx-auto">
              Sign in with your Staff ID to review payment proofs, verify transactions, and authorize kitchen orders
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSignIn}>
          <CardContent className="space-y-4 pt-6 px-6">
            {errorMsg && (
              <div
                className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">{errorMsg}</p>
                  {redirectAdminNotice && onRedirectAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRedirectAdmin}
                      className="mt-2 text-xs border-red-300 text-red-700 hover:bg-red-100 rounded-xl"
                    >
                      Go to Admin Dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cashier-staff-id" className="text-xs font-semibold text-[#2A1810]">
                Staff ID
              </Label>
              <div className="relative">
                <UserCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C7A6E]" />
                <Input
                  id="cashier-staff-id"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="e.g. RK-001"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="pl-9 h-11 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-sm placeholder:text-[#8C7A6E] font-medium"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cashier-password" className="text-xs font-semibold text-[#2A1810]">
                  Password
                </Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C7A6E]" />
                <Input
                  id="cashier-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 h-11 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-sm placeholder:text-[#8C7A6E]"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C7A6E] hover:text-[#2A1810] p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-3 pb-6 px-6">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 font-bold bg-[#C8102E] hover:bg-[#a60d26] text-white rounded-xl shadow-md transition-all active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verifying Credentials...
                </span>
              ) : (
                "Sign In to Cashier Shift"
              )}
            </Button>

            <p className="text-center text-[11px] text-[#8C7A6E]">
              Protected staff portal • Rekik Café Management System
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
