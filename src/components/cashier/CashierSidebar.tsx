import { Home, Layers, Clock, LogOut, User, X, CreditCard } from "lucide-react";
import type { CashierStaffProfile } from "@/lib/cashier";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";

interface CashierSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingCount?: number;
  unreadNotificationsCount?: number;
  profile?: CashierStaffProfile | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function CashierSidebar({
  activeTab,
  onSelectTab,
  profile,
  onLogout,
  mobileOpen,
  onMobileClose,
}: CashierSidebarProps) {
  const navItems = [
    {
      id: "overview",
      label: "Dashboard",
      icon: Home,
    },
    {
      id: "pending",
      label: "Payment Reviews",
      icon: CreditCard,
    },
    {
      id: "history",
      label: "Payment History",
      icon: Clock,
    },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    onMobileClose();
  };

  const cashierName = profile?.full_name || "Ahmed Hassan";

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between p-5 select-none bg-[#1A110D] text-white">
      {/* Top Branding & Navigation */}
      <div className="space-y-8">
        {/* Rekik Coffee Logo & Name */}
        <div className="flex flex-col items-center justify-center pt-3 pb-2 text-center">
          <div className="size-16 overflow-hidden rounded-full border-2 border-gold/70 shadow-md bg-white mb-2.5">
            <img
              src={rekikLogo}
              alt="Rekik Coffee logo"
              className="size-full object-contain"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            Rekik Coffee
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-gold mt-0.5">
            Cashier Station
          </span>
        </div>

        {/* Navigation Entries */}
        <nav className="space-y-2" aria-label="Cashier Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#3D291F] border border-[#523A2D] text-white shadow-sm"
                    : "text-[#A39690] hover:text-white hover:bg-[#261A14]"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-[#A39690]"}`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Cashier profile & logout action at the bottom */}
      <div className="flex items-center justify-between pt-4 border-t border-[#2D1E17]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 rounded-full bg-[#2A1B14] border border-[#443026] flex items-center justify-center text-[#D4A373] shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="overflow-hidden leading-tight">
            <div className="text-sm font-semibold text-white truncate">{cashierName}</div>
            <div className="text-xs text-[#8E7E75]">Cashier</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="text-[#8E7E75] hover:text-white p-2 rounded-lg transition-colors shrink-0"
          title="Sign Out"
          aria-label="Sign Out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 h-screen sticky top-0 shrink-0 z-20 shadow-xl border-r border-[#261710]">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onMobileClose} />
          <div className="relative flex-1 max-w-xs w-full bg-[#1A110D] shadow-2xl z-10 flex flex-col">
            <button
              type="button"
              onClick={onMobileClose}
              className="absolute top-4 right-4 p-2 text-[#A39690] hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
