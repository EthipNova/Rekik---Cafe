import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Coffee,
  Eye,
  EyeOff,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
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
import { supabase } from "@/lib/supabase";
import { fetchCashierMe } from "@/services/cashier";
import type { CashierStaffProfile } from "@/lib/cashier";

interface CashierLoginFormProps {
  onSuccess: (profile: CashierStaffProfile) => void;
  onRedirectAdmin?: () => void;
}

export function CashierLoginForm({ onSuccess, onRedirectAdmin }: CashierLoginFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [redirectAdminNotice, setRedirectAdminNotice] = useState(false);

  const validate = (): string | null => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "Please enter your cashier email address.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) return "Please enter a valid email address.";
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
      // 1. Supabase Auth sign-in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setErrorMsg("Incorrect email or password. Please verify your credentials.");
        } else if (authError.message.includes("Email not confirmed")) {
          setErrorMsg("Your email has not been verified yet. Please check your inbox.");
        } else {
          setErrorMsg(authError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setErrorMsg("Failed to authenticate user. Please try again.");
        setLoading(false);
        return;
      }

      // 2. Authoritative role check via server API /api/cashier/me
      const meResult = await fetchCashierMe();

      if (!meResult.success) {
        // Sign out if role check fails so no rogue sessions linger
        await supabase.auth.signOut();

        if (meResult.status === "inactive") {
          setErrorMsg("Your staff account is currently inactive. Please contact the café manager.");
        } else if (meResult.status === "role_mismatch") {
          if (meResult.role === "admin") {
            setRedirectAdminNotice(true);
            setErrorMsg(
              "This account has Administrator privileges. Cashier dashboard is for cashier staff.",
            );
          } else if (meResult.role === "waiter") {
            setErrorMsg("Waiters do not have cashier authorization. Please use the Waiter portal.");
          } else {
            setErrorMsg("Your account does not have cashier permissions.");
          }
        } else if (meResult.status === "no_profile") {
          setErrorMsg("No staff profile found for this account. Access denied.");
        } else {
          setErrorMsg(meResult.message || "Access denied.");
        }

        setLoading(false);
        return;
      }

      toast.success(`Welcome back, ${meResult.profile.full_name}!`);
      onSuccess(meResult.profile);
      void navigate({ to: "/casher" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setErrorMsg(msg);
      toast.error("Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail("cashier@rekikcafe.com");
    setPassword("Password123!");
    setErrorMsg(null);
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border border-[#EAE3D9] shadow-xl bg-white rounded-3xl overflow-hidden">
        {/* Top Accent Strip */}
        <div className="h-2 w-full bg-gradient-to-r from-[#1B110B] via-[#C8102E] to-[#E8A87C]" />

        <CardHeader className="space-y-3 text-center pt-8 pb-6 bg-[#FAF7F2]/60">
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
              Sign in to review payment proofs, verify transactions, and authorize kitchen orders
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
              <Label htmlFor="cashier-email" className="text-xs font-semibold text-[#2A1810]">
                Cashier Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C7A6E]" />
                <Input
                  id="cashier-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="cashier@rekikcafe.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-11 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-sm placeholder:text-[#8C7A6E]"
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

            {/* Quick Demo Autofill Helper */}
            <div className="pt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={handleFillDemo}
                className="text-xs text-[#8C7A6E] hover:text-[#2A1810] flex items-center gap-1 font-medium transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                Fill Demo Cashier Credentials
              </button>
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
