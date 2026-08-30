/**
 * Next.js instrumentation：服务进程启动时执行一次。
 * 仅在 Node.js 运行时注册周期任务（过期会话清理）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerSessionCleaner } = await import("./lib/session-cleaner");
    registerSessionCleaner();
  }
}
