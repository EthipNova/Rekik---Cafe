import {
  LayoutDashboard,
  Clock,
  History,
  Bell,
  LogOut,
  Coffee,
  User,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CashierStaffProfile } from "@/lib/cashier";

interface CashierSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingCount: number;
  unreadNotificationsCount: number;
  profile: CashierStaffProfile;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function CashierSidebar({
  activeTab,
  onSelectTab,
  pendingCount,
  unreadNotificationsCount,
  profile,
  onLogout,
  mobileOpen,
  onMobileClose,
}: CashierSidebarProps) {
  // Navigation items strictly adhering to reference design:
  // 1. Dashboard, 2. Payment Reviews, 3. Payment History
  const navItems = [
    {
      id: "overview",
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: "pending",
      label: "Payment Reviews",
      icon: Clock,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeColor: "bg-[#D97706] text-white",
    },
    {
      id: "history",
      label: "Payment History",
      icon: History,
      badge: null,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : null,
      badgeColor: "bg-[#C8102E] text-white",
    },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    onMobileClose();
  };

  const navContent = (
    <div className="flex flex-col h-full justify-between select-none">
      {/* Top Section: Brand & Nav Links */}
      <div className="space-y-6">
        {/* Rekik Café Brand Logo Header */}
        <div className="flex items-center gap-3 px-1 py-2 border-b border-[#2D1B13]/70 pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#C8102E] to-[#8E0B20] text-white shadow-md shadow-black/20">
            <Coffee className="h-5 w-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight font-display text-white truncate">
                Rekik Café
              </span>
              <span className="text-[10px] font-semibold bg-[#362219] text-[#E8A87C] px-1.5 py-0.2 rounded border border-[#4D3124]">
                Cashier
              </span>
            </div>
            <div className="text-[11px] text-[#A69485] truncate font-medium">
              Payment Management
            </div>
          </div>
        </div>

        {/* Primary Navigation List */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[#8C7A6E] px-3 mb-2">
            Main Menu
          </div>
          <nav className="space-y-1.5" aria-label="Cashier Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#382319] text-[#FFF8F0] shadow-sm border-l-4 border-[#C8102E] pl-2.5 font-semibold"
                      : "text-[#B3A295] hover:bg-[#281811] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-[#E8A87C]" : "text-[#8C7A6E]"
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-bold ${
                        isActive
                          ? "bg-[#C8102E] text-white"
                          : item.badgeColor || "bg-[#382319] text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Section: Authenticated Cashier Info & Sign Out */}
      <div className="pt-4 border-t border-[#2D1B13] space-y-3">
        {/* Cashier Profile Card */}
        <div className="rounded-xl border border-[#382319] bg-[#241610] p-3 text-xs space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#99877B] flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#E8A87C]" />
              Active Shift
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>
          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="h-8 w-8 rounded-full bg-[#3B251B] border border-[#503426] flex items-center justify-center text-[#FFF8F0] font-semibold text-xs shrink-0">
              {profile.full_name
                ? profile.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "CA"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white truncate text-xs">
                {profile.full_name || "Cashier Staff"}
              </div>
              <div className="text-[11px] text-[#A69485] truncate capitalize">
                {profile.role || "Cashier"}
              </div>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          type="button"
          variant="ghost"
          onClick={onLogout}
          className="w-full justify-start text-xs text-[#C5B3A6] hover:text-white hover:bg-[#342017] border border-[#331F16] h-9 transition-colors"
        >
          <LogOut className="mr-2 h-3.5 w-3.5 text-[#E06B6B]" />
          Logout Shift
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed / Sticky Dark Coffee Brown Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#1B110B] border-r border-[#2A1A12] p-4 shrink-0 min-h-[calc(100vh-4rem)]">
        {navContent}
      </aside>

      {/* Mobile Collapsible Sheet */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <SheetContent side="left" className="w-72 p-5 bg-[#1B110B] border-r border-[#2A1A12] text-[#E8DFD8]">
          <SheetHeader className="sr-only">
            <SheetTitle>Rekik Café Cashier Navigation</SheetTitle>
          </SheetHeader>
          {navContent}
        </SheetContent>
      </Sheet>
    </>
  );
}
