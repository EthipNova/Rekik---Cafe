import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-16 md:py-20", className)}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <div className={cn("inline-flex items-center gap-1.5", align === "center" && "justify-center")}>
          <span className="size-1.5 rounded-full bg-gold" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-gold">{eyebrow}</p>
        </div>
      )}
      <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-primary sm:mt-3 sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm text-foreground/75 sm:mt-3 sm:text-base leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
