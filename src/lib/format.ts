const TIME_FMT = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

/** 消息流中的日期分隔文案 */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  const y = date.getFullYear() !== now.getFullYear() ? `${date.getFullYear()}年` : "";
  return `${y}${date.getMonth() + 1}月${date.getDate()}日`;
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** 会话列表的相对时间 */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return formatTime(iso);
  if (days === 1) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 相邻消息分组：同一作者且间隔 5 分钟内合并显示 */
export function shouldGroupWithPrevious(
  prevCreatedAt: string | undefined,
  prevAuthorId: string | undefined,
  createdAt: string,
  authorId: string,
): boolean {
  if (!prevCreatedAt || prevAuthorId !== authorId) return false;
  return new Date(createdAt).getTime() - new Date(prevCreatedAt).getTime() < 5 * 60_000;
}
