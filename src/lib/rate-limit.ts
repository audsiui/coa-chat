/**
 * 进程内滑动窗口限流（单实例足够；水平扩展时换 Redis 实现，接口不变）。
 */
type Bucket = number[];

const buckets = new Map<string, Bucket>();

const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < 60_000);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

/**
 * 超出配额返回 false。
 * @param key    维度标识，如 `login:1.2.3.4:alice`
 * @param limit  窗口内最大次数
 * @param windowMs 窗口长度（毫秒）
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** 从请求头提取客户端 IP。取最后一跳：反向代理（Vercel/网关）会把真实客户端
 * 追加到末尾，取最左侧则可被伪造头绕过限流 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",");
    return hops[hops.length - 1].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
