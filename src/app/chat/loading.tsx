export default function ChatLoading() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[72px] shrink-0 border-r border-border bg-rail" />
      <div className="flex w-60 shrink-0 flex-col gap-2 border-r border-border bg-sidebar p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-accent" />
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    </div>
  );
}
