import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { flowFor, statusLabels, type Order } from "@/lib/orders";

export function OrderTimeline({ order }: { order: Order }) {
  const flow = flowFor(order.method);
  const currentIndex = flow.indexOf(order.status);

  return (
    <ol className="relative space-y-0">
      {flow.map((status, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  active && "border-primary bg-primary text-primary-foreground animate-pulse",
                  !done && !active && "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-4" />
                ) : (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
              {index < flow.length - 1 && (
                <span
                  aria-hidden
                  className={cn("h-10 w-0.5", index < currentIndex ? "bg-success" : "bg-border")}
                />
              )}
            </div>
            <div className="pb-6">
              <p className={cn("font-medium", !done && !active && "text-muted-foreground")}>
                {statusLabels[status]}
              </p>
              {active && <p className="text-sm text-muted-foreground">In progress right now</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
