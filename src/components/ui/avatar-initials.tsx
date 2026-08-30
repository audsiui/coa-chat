import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[11px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-20 text-2xl",
} as const;

/** 纯色首字母头像（无图片资源依赖） */
export function AvatarInitials({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = name.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      aria-label={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}
