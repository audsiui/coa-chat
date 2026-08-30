import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h2 className="text-lg font-semibold">页面不存在</h2>
      <p className="text-sm text-muted-foreground">你访问的地址不存在或已被移除</p>
      <Link
        href="/chat"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        返回主页
      </Link>
    </div>
  );
}
