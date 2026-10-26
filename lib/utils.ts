import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Standard shadcn helper: join class names, letting later Tailwind classes win.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
