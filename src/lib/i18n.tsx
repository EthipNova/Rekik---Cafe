import React, { createContext, useContext, useEffect, useState } from "react";

export type SupportedLanguage = "en" | "am" | "sid";

export interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
}

export const LANGUAGE_NAMES: Record<SupportedLanguage, { native: string; english: string; flag: string }> = {
  en: { native: "English", english: "English", flag: "🇬🇧" },
  am: { native: "አማርኛ", english: "Amharic", flag: "🇪🇹" },
  sid: { native: "Sidaamu Afoo", english: "Sidamic", flag: "🌿" },
};

export const translations: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.menu": "Menu",
    "nav.about": "About",
    "nav.contact": "Contact",
    "nav.orders": "Orders",
    "nav.cart": "Cart",
    "nav.admin": "Admin",
    "nav.waiter": "Waiter Station",
    "nav.cashier": "Cashier Dashboard",
    "nav.signIn": "Sign In",
    "nav.signOut": "Sign Out",
    "nav.backToMenu": "Back to Café Menu",
    "nav.backToSite": "Back to Café Site",
    "nav.switchAccount": "Sign Out & Switch Account",
    "nav.language": "Language",

    // Auth & Login
    "login.title": "Sign In",
    "login.adminSignIn": "Admin Sign In",
    "login.staffSignIn": "Staff Sign In",
    "login.cashierPortal": "Cashier Portal",
    "login.waiterStation": "Waiter Station",
    "login.staffId": "Staff ID",
    "login.adminStaffId": "Staff ID",
    "login.password": "Password",
    "login.staffIdPlaceholder": "e.g. RK-001",
    "login.adminStaffIdPlaceholder": "RK-003",
    "login.button": "Sign In",
    "login.signingIn": "Signing in…",
    "login.forgotPassword": "Forgot Password?",
    "login.enterCredentials": "Enter your Rekik staff credentials to access café operations.",
    "login.waiterSubtitle": "Sign in with your staff credentials to manage table orders.",
    "login.cashierSubtitle": "Sign in with your Staff ID to review payments and authorize kitchen orders.",

    // Error messages
    "error.invalidCredentials": "Invalid Staff ID or password.",
    "error.deactivated": "Your account has been deactivated.",
    "error.notFound": "Your Staff ID could not be found.",
    "error.roleMismatch": "You do not have permission to access this portal.",
    "error.missingCredentials": "Please enter both Staff ID and password.",
    "error.missingStaffId": "Please enter your Staff ID.",
    "error.missingPassword": "Please enter your password.",
    "error.accessRestricted": "Access Restricted",
    "error.unauthorizedMessage": "Your account is authenticated, but does not have permission for this portal.",

    // Cashier & Cash Payments
    "cashier.cash": "Cash",
    "cashier.cashBadge": "💵 Cash",
    "cashier.cashPayment": "Cash Payment",
    "cashier.paymentMethod": "Payment Method",
    "cashier.paymentMethodCash": "Payment Method: 💵 Cash",
    "cashier.noProofRequired": "In-person cash transaction. No screenshot or payment proof image required.",
    "cashier.verifiedAtCounter": "Cash collected directly from customer at counter or table.",
    "cashier.pendingReviews": "Pending Payment Reviews",
    "cashier.immediateQueue": "Immediate Review Queue",
    "cashier.verifiedPayments": "Verified & Approved Payments",
    "cashier.rejectedPayments": "Rejected Payment Proofs",
    "cashier.reviewHistory": "Payment Review History",
    "cashier.approvePayment": "Approve Payment",
    "cashier.rejectPayment": "Reject Payment",
    "cashier.confirmCashPayment": "Confirm Cash Payment",
    "cashier.reviewOrder": "Review Order",
    "cashier.inspectProof": "Inspect Proof",
    "cashier.underReview": "Under Review",
    "cashier.readyForKitchen": "Ready for Kitchen",

    // Waiter Station
    "waiter.dashboard": "Dashboard",
    "waiter.currentOrders": "Current Orders",
    "waiter.orderHistory": "Order History",
    "waiter.onDuty": "ON DUTY",
    "waiter.offDuty": "OFF DUTY",
    "waiter.table": "Table",
    "waiter.dineIn": "Dine-in",
    "waiter.delivery": "Delivery",
    "waiter.readyToServe": "Ready to Serve",
    "waiter.activeTables": "Active Tables",
    "waiter.pendingKitchen": "Pending Kitchen",

    // Common Buttons & Labels
    "common.refresh": "Refresh",
    "common.search": "Search...",
    "common.filter": "Filter",
    "common.all": "All",
    "common.total": "Total",
    "common.orderTotal": "Order Total",
    "common.status": "Status",
    "common.actions": "Actions",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.copy": "Copy",
    "common.copied": "Copied!",
  },

  am: {
    // Navigation
    "nav.home": "መነሻ",
    "nav.menu": "ምናሌ",
    "nav.about": "ስለ እኛ",
    "nav.contact": "አግኙን",
    "nav.orders": "ትዕዛዞች",
    "nav.cart": "የግዢ ቅርጫት",
    "nav.admin": "አድሚን",
    "nav.waiter": "የአስተናጋጅ ክፍል",
    "nav.cashier": "የገንዘብ ተቀባይ ዳሽቦርድ",
    "nav.signIn": "ግባ",
    "nav.signOut": "ውጣ",
    "nav.backToMenu": "ወደ ካፌ ምናሌ ተመለስ",
    "nav.backToSite": "ወደ ዋናው ድረ-ገጽ",
    "nav.switchAccount": "ውጣና መለያ ቀይር",
    "nav.language": "ቋንቋ",

    // Auth & Login
    "login.title": "ግባ",
    "login.adminSignIn": "የአድሚን መግቢያ",
    "login.staffSignIn": "የሰራተኞች መግቢያ",
    "login.cashierPortal": "የገንዘብ ተቀባይ ፖርታል",
    "login.waiterStation": "የአስተናጋጅ ክፍል",
    "login.staffId": "የሰራተኛ መለያ (Staff ID)",
    "login.adminStaffId": "የሰራተኛ መለያ (Staff ID)",
    "login.password": "የይለፍ ቃል",
    "login.staffIdPlaceholder": "ለምሳሌ RK-001",
    "login.adminStaffIdPlaceholder": "RK-003",
    "login.button": "ግባ",
    "login.signingIn": "በመግባት ላይ…",
    "login.forgotPassword": "የይለፍ ቃል ረሱ?",
    "login.enterCredentials": "የካፌውን ስራዎች ለማስተዳደር የሰራተኛ መለያዎን ያስገቡ።",
    "login.waiterSubtitle": "የትዕዛዝ ስራዎችን ለማስተናገድ የሰራተኛ መለያዎን ያስገቡ።",
    "login.cashierSubtitle": "ክፍያዎችን ለማረጋገጥና ወደ ማዕድ ቤት ለማስተላለፍ የሰራተኛ መለያዎን ያስገቡ።",

    // Error messages
    "error.invalidCredentials": "የተሳሳተ የሰራተኛ መለያ ወይም የይለፍ ቃል።",
    "error.deactivated": "መለያዎ ቦዝኗል ወይም ታግዷል።",
    "error.notFound": "የሰራተኛ መለያዎ ሊገኝ አልቻለም።",
    "error.roleMismatch": "ይህንን ፖርታል ለመጠቀም ፈቃድ የለዎትም።",
    "error.missingCredentials": "እባክዎን የሰራተኛ መለያ እና የይለፍ ቃል ያስገቡ።",
    "error.missingStaffId": "እባክዎን የሰራተኛ መለያዎን ያስገቡ።",
    "error.missingPassword": "እባክዎን የይለፍ ቃልዎን ያስገቡ።",
    "error.accessRestricted": "መዳረሻ ተከልክሏል",
    "error.unauthorizedMessage": "መለያዎ ገብቷል፣ ነገር ግን ለዚህ ፖርታል የተሰጠ ፈቃድ የለውም።",

    // Cashier & Cash Payments
    "cashier.cash": "ጥሬ ገንዘብ",
    "cashier.cashBadge": "💵 ጥሬ ገንዘብ",
    "cashier.cashPayment": "የጥሬ ገንዘብ ክፍያ",
    "cashier.paymentMethod": "የክፍያ ዘዴ",
    "cashier.paymentMethodCash": "የክፍያ ዘዴ: 💵 ጥሬ ገንዘብ",
    "cashier.noProofRequired": "የቀጥታ ጥሬ ገንዘብ ክፍያ። ምንም ደረሰኝ ማያያዝ አያስፈልግም።",
    "cashier.verifiedAtCounter": "ገንዘቡ በካውንተር ወይም በጠረጴዛ ላይ በቀጥታ ተቀብሏል።",
    "cashier.pendingReviews": "በግምገማ ላይ ያሉ ክፍያዎች",
    "cashier.immediateQueue": "አፋጣኝ የግምገማ ዝርዝር",
    "cashier.verifiedPayments": "የተረጋገጡና የጸደቁ ክፍያዎች",
    "cashier.rejectedPayments": "ውድቅ የተደረጉ ክፍያዎች",
    "cashier.reviewHistory": "የክፍያ ግምገማ ታሪክ",
    "cashier.approvePayment": "ክፍያ አጽድቅ",
    "cashier.rejectPayment": "ክፍያ ውድቅ አድርግ",
    "cashier.confirmCashPayment": "የጥሬ ገንዘብ ክፍያ አረጋግጥ",
    "cashier.reviewOrder": "ትዕዛዝ መርምር",
    "cashier.inspectProof": "ማረጋገጫ መርምር",
    "cashier.underReview": "በግምገማ ላይ",
    "cashier.readyForKitchen": "ለማብሰል ዝግጁ",

    // Waiter Station
    "waiter.dashboard": "ዳሽቦርድ",
    "waiter.currentOrders": "የአሁን ትዕዛዞች",
    "waiter.orderHistory": "የትዕዛዝ ታሪክ",
    "waiter.onDuty": "በስራ ላይ",
    "waiter.offDuty": "ከስራ ውጪ",
    "waiter.table": "ጠረጴዛ",
    "waiter.dineIn": "እዚሁ መመገብ",
    "waiter.delivery": "ማድረስ (Delivery)",
    "waiter.readyToServe": "ለማቅረብ ዝግጁ",
    "waiter.activeTables": "ተጠባባቂ ጠረጴዛዎች",
    "waiter.pendingKitchen": "ወደ ማዕድ ቤት የተላኩ",

    // Common Buttons & Labels
    "common.refresh": "አድስ",
    "common.search": "ፈልግ...",
    "common.filter": "አጣራ",
    "common.all": "ሁሉም",
    "common.total": "ጠቅላላ",
    "common.orderTotal": "የትዕዛዝ ጠቅላላ",
    "common.status": "ሁኔታ",
    "common.actions": "እርምጃዎች",
    "common.save": "አስቀምጥ",
    "common.cancel": "ሰርዝ",
    "common.confirm": "አረጋግጥ",
    "common.copy": "ቅዳ",
    "common.copied": "ተቀድቷል!",
  },

  sid: {
    // Navigation
    "nav.home": "Umi Qoolla",
    "nav.menu": "Sagale Mashalaqqe",
    "nav.about": "Ninke Daafira",
    "nav.contact": "Xaadooshshe",
    "nav.orders": "Ujanna",
    "nav.cart": "Saamete Saanduqa",
    "nav.admin": "Admiine",
    "nav.waiter": "Owaatanchu Kifile",
    "nav.cashier": "Kaasheere Daashboorde",
    "nav.signIn": "Ei",
    "nav.signOut": "Fuli",
    "nav.backToMenu": "Kafeete Mashalaqqera Qolli",
    "nav.backToSite": "Kafeete Qoollara Qolli",
    "nav.switchAccount": "Fuliite Akaawuntte Soorri",
    "nav.language": "Afoo",

    // Auth & Login
    "login.title": "Ei",
    "login.adminSignIn": "Admiinetu Eessamanno Qoolla",
    "login.staffSignIn": "Owaatano Eessantanno Qoolla",
    "login.cashierPortal": "Kaasheerete Poortaale",
    "login.waiterStation": "Owaatanchu Kifile",
    "login.staffId": "Losoosi ID",
    "login.adminStaffId": "Losoosi ID",
    "login.password": "Kullaa (Password)",
    "login.staffIdPlaceholder": "Lawiishshaho RK-001",
    "login.adminStaffIdPlaceholder": "RK-003",
    "login.button": "Ei",
    "login.signingIn": "Eanni No…",
    "login.forgotPassword": "Passworde Hawaootto?",
    "login.enterCredentials": "Kafeete looso massagate Losoosi ID-kkinna passworde eessi.",
    "login.waiterSubtitle": "Mixaalete ujanne owaatate Losoosi ID-kki eessi.",
    "login.cashierSubtitle": "Woxe buuxatenna kushiinaho saaysate Losoosi ID-kki eessi.",

    // Error messages
    "error.invalidCredentials": "Bonsheessitino Losoosi ID woy passworde gariikkitinokkite.",
    "error.deactivated": "Akaawunttikki gatamariishshi hoongino.",
    "error.notFound": "Losoosi ID-kki afama didandiino.",
    "error.roleMismatch": "Tenne poortaale eate fajjote bae dinohe.",
    "error.missingCredentials": "Bonsheesse Losoosi ID nna passworde kulinte eessi.",
    "error.missingStaffId": "Bonsheesse Losoosi ID-kki eessi.",
    "error.missingPassword": "Bonsheesse passwordekki eessi.",
    "error.accessRestricted": "Eonni Karsamino",
    "error.unauthorizedMessage": "Akaawunttikki eino; kayinni tenne poortaale eate fajjote bae dinohe.",

    // Cashier & Cash Payments
    "cashier.cash": "Woraqata Woxe",
    "cashier.cashBadge": "💵 Woraqata Woxe (Cash)",
    "cashier.cashPayment": "Woraqata Woxe Kifillatta",
    "cashier.paymentMethod": "Kifillattu Doogo",
    "cashier.paymentMethodCash": "Kifillattu Doogo: 💵 Woraqata Woxe",
    "cashier.noProofRequired": "Woraqata woxe buuxinanni kaffalantanno; surrate kakkalo dihasiissanno.",
    "cashier.verifiedAtCounter": "Woxu kaawunterete aana woy mixaalete aana buuxamino.",
    "cashier.pendingReviews": "Buuxo Agaranni Noo Kifillatta",
    "cashier.immediateQueue": "Hakkonni Buuxinanni Tarre",
    "cashier.verifiedPayments": "Buuxante Kaajjitinor Kifillatta",
    "cashier.rejectedPayments": "Giwamino Kifillatta",
    "cashier.reviewHistory": "Kifillattu Buuxote Seeda Yanna",
    "cashier.approvePayment": "Kifillatta Kaajjishi",
    "cashier.rejectPayment": "Kifillatta Giwi",
    "cashier.confirmCashPayment": "Woraqata Woxe Kaajjishi",
    "cashier.reviewOrder": "Ujanna Buuxi",
    "cashier.inspectProof": "Kakkalo Buuxi",
    "cashier.underReview": "Buuxo Aana No",
    "cashier.readyForKitchen": "Kushiinaho Qixxaawino",

    // Waiter Station
    "waiter.dashboard": "Daashboorde",
    "waiter.currentOrders": "Xaa Ujanna",
    "waiter.orderHistory": "Ujanna Yanna",
    "waiter.onDuty": "LOOSAHO NOO",
    "waiter.offDuty": "BOOLE HOONGINO",
    "waiter.table": "Mixaale",
    "waiter.dineIn": "Konnira Sagalanna",
    "waiter.delivery": "Daga Iillisha",
    "waiter.readyToServe": "Owaatate Qixxaawino",
    "waiter.activeTables": "Loosunni No Mixaalla",
    "waiter.pendingKitchen": "Kushiinaho Agarantanni No",

    // Common Buttons & Labels
    "common.refresh": "Haaroomsi",
    "common.search": "Hasi...",
    "common.filter": "Doori",
    "common.all": "Baala",
    "common.total": "Kaphote",
    "common.orderTotal": "Ujannate Kaphote",
    "common.status": "Gari",
    "common.actions": "Assano",
    "common.save": "Wodi",
    "common.cancel": "Hagiishi",
    "common.confirm": "Kaajjishi",
    "common.copy": "Koppe Assi",
    "common.copied": "Koppe Assinoonni!",
  },
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "rekik_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
      if (saved && (saved === "en" || saved === "am" || saved === "sid")) {
        setLanguageState(saved);
        if (typeof document !== "undefined") {
          document.documentElement.lang = saved;
        }
      }
    } catch {
      /* ignore storage access error */
    }
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      if (typeof document !== "undefined") {
        document.documentElement.lang = lang;
      }
    } catch {
      /* ignore */
    }
  };

  const t = (key: string, fallback?: string): string => {
    const langDict = translations[language];
    if (langDict && key in langDict) {
      return langDict[key] as string;
    }
    const enDict = translations.en;
    if (enDict && key in enDict) {
      return enDict[key] as string;
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback outside LanguageProvider
    return {
      language: "en",
      setLanguage: () => {},
      t: (key: string, fallback?: string) => translations.en[key] || fallback || key,
    };
  }
  return context;
}

