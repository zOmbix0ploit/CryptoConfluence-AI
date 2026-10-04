import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("terminal-panel p-4", className)} {...props} />;
}
