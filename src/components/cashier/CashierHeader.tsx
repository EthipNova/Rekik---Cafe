import {
  Coffee,
  Bell,
  LogOut,
  RefreshCw,
  User,
  ShieldCheck,
  CheckCircle2,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CashierStaffProfile, CashierNotification } from "@/lib/cashier";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";

interface CashierHeaderProps {
  profile: CashierStaffProfile;
  notifications: CashierNotification[];
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenMobileNav: () => void;
  onNotificationClick?: () => void;
}

export function CashierHeader({
  profile,
  notifications,
  refreshing,
  onRefresh,
  onLogout,
  onOpenMobileNav,
  onNotificationClick,
}: CashierHeaderProps) {
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "CA";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#EAE3D9] bg-white/95 px-4 sm:px-6 backdrop-blur-md shadow-xs">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenMobileNav}
          className="md:hidden text-[#70645C] hover:text-[#2A1810] hover:bg-[#FAF7F2]"
          aria-label="Open Navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2.5">
          <div className="size-9 overflow-hidden rounded-full border border-gold/70 shrink-0 bg-white shadow-xs">
            <img
              src={rekikLogo}
              alt="Rekik Coffee logo"
              className="size-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight font-display text-primary">
                Rekik Coffee
              </span>
              <Badge className="bg-gold text-espresso text-[10px] font-semibold px-2 py-0 border-none">
                Cashier Portal
              </Badge>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              On Duty • Ready for Payment Reviews
            </div>
          </div>
        </div>
      </div>

      {/* Right Controls: Refresh, Notifications, Profile Dropdown, Logout */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 px-3 text-xs text-[#5C4538] border-[#D6C7B7] hover:bg-[#FAF7F2] hidden sm:flex items-center gap-1.5 rounded-xl"
          title="Refresh payment reviews"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[#C8102E]" : ""}`} />
          <span>Sync</span>
        </Button>

        {/* Notifications Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNotificationClick}
          className="relative h-9 w-9 text-[#70645C] hover:text-[#2A1810] hover:bg-[#FAF7F2] rounded-xl"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C8102E] text-[10px] font-bold text-white px-1 shadow-sm">
              {unreadCount}
            </span>
          )}
        </Button>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 pl-2 pr-2.5 h-10 rounded-xl hover:bg-[#FAF7F2] border border-transparent hover:border-[#EAE3D9]"
            >
              <Avatar className="h-7 w-7 border border-[#D6C7B7] bg-[#2A1810] text-[#E8A87C]">
                <AvatarFallback className="text-xs font-bold text-[#E8A87C] bg-[#2A1810]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left text-xs">
                <div className="font-semibold text-[#2A1810] truncate max-w-[120px]">
                  {profile.full_name}
                </div>
                <div className="text-[10px] text-[#8C7A6E] capitalize">
                  {profile.role || "Cashier"}
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white border-[#EAE3D9] rounded-xl shadow-lg">
            <DropdownMenuLabel className="font-normal">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#2A1810]">{profile.full_name}</p>
                <p className="text-xs text-[#70645C] truncate">{profile.email}</p>
                {profile.phone && (
                  <p className="text-xs text-[#8C7A6E] font-mono">{profile.phone}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#EAE3D9]" />
            <DropdownMenuItem onClick={onRefresh} className="cursor-pointer text-xs text-[#2A1810]">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Sync Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#EAE3D9]" />
            <DropdownMenuItem
              onClick={onLogout}
              className="cursor-pointer text-xs text-red-600 focus:text-red-700 focus:bg-red-50"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out of Shift
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
