import React from "react";
import { Globe } from "lucide-react";
import { useTranslation, type SupportedLanguage, LANGUAGE_NAMES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  className?: string;
  variant?: "pills" | "compact" | "minimal";
}

export function LanguageSelector({ className, variant = "pills" }: LanguageSelectorProps) {
  const { language, setLanguage } = useTranslation();

  const options: { id: SupportedLanguage; label: string }[] = [
    { id: "en", label: "English" },
    { id: "am", label: "አማርኛ" },
    { id: "sid", label: "Sidaamu Afoo" },
  ];

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-xs backdrop-blur-xs shadow-2xs",
          className,
        )}
      >
        <Globe className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          className="bg-transparent font-medium text-foreground text-xs focus:outline-hidden cursor-pointer"
          aria-label="Select language"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-background text-foreground">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language selector"
      className={cn(
        "inline-flex items-center rounded-full border border-[#D5C9B8] bg-[#FAF7F2]/90 p-1 shadow-2xs text-xs backdrop-blur-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1 pl-1.5 pr-1 text-muted-foreground">
        <Globe className="size-3.5 text-primary shrink-0" aria-hidden="true" />
      </div>
      <div className="flex items-center divide-x divide-[#E3D9CC]">
        {options.map((opt) => {
          const isActive = language === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLanguage(opt.id)}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-full transition-all duration-150 cursor-pointer whitespace-nowrap",
                isActive
                  ? "bg-[#C8102E] text-white shadow-2xs"
                  : "text-[#5C4538] hover:text-[#1A110D] hover:bg-[#EFE8DC]",
              )}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

