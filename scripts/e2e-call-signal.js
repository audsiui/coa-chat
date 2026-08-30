/* eslint-disable */
// 通话信令端到端验证：mamama 作为被叫监听 private-user，audsiui 通过 HTTP API 发起通话
require("dotenv/config");
process.env.DATABASE_URL = process.env.DATABASE_URL;
const postgres = require("postgres");
const crypto = require("crypto");
const Pusher = require("pusher-js");

const PROD_LOCAL = "http://localhost:3400";
const CALLER_ID = "76f29543-9204-4a93-be0b-a6da3ab3cd51"; // audsiui
const CALLEE_ID = "d1c71398-3093-4800-8758-9b30bae12bb8"; // mamama

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function makeSession(sql, userId, label) {
  const token = "e2e-" + crypto.randomBytes(24).toString("base64url");
  await sql`insert into sessions (user_id, token_hash, expires_at) values (${userId}, ${sha256(token)}, ${new Date(Date.now() + 3600e3)})`;
  console.log(`[session] ${label} 创建`);
  return token;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  const tokCaller = await makeSession(sql, CALLER_ID, "caller=audsiui");
  const tokCallee = await makeSession(sql, CALLEE_ID, "callee=mamama");

  // 被叫监听器：pusher-js 订阅 private-user-{mamama}，鉴权走本地服务器
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  const pusher = new Pusher(key, {
    cluster,
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        fetch(`${PROD_LOCAL}/api/pusher/auth`, {
          method: "POST",
          headers: {
            cookie: `coachat_session=${tokCallee}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ socket_id: socketId, channel_name: channel.name }).toString(),
        })
          .then((r) => r.json())
          .then((j) => callback(null, j))
          .catch((e) => callback(e, null));
      },
    }),
  });

  const channel = pusher.subscribe(`private-user-${CALLEE_ID}`);
  const timeout = setTimeout(() => {
    console.log("RESULT: FAIL — 15 秒内未收到 call:incoming");
    cleanup();
    process.exit(1);
  }, 15000);

  const cleanup = async () => {
    clearTimeout(timeout);
    pusher.disconnect();
    await sql`delete from sessions where token_hash in (${sha256(tokCaller)}, ${sha256(tokCallee)})`;
    await sql.end();
  };

  channel.bind("pusher:subscription_succeeded", async () => {
    console.log("[listener] private-user 订阅成功（鉴权通过）");
    // 主叫发起通话
    const res = await fetch(`${PROD_LOCAL}/api/calls`, {
      method: "POST",
      headers: { cookie: `coachat_session=${tokCaller}`, "content-type": "application/json" },
      body: JSON.stringify({ toUserId: CALLEE_ID, kind: "audio" }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[caller] POST /api/calls -> HTTP ${res.status}`, JSON.stringify(body).slice(0, 160));
  });

  channel.bind("pusher:subscription_error", (e) => {
    console.log("RESULT: FAIL — 订阅鉴权失败:", JSON.stringify(e).slice(0, 200));
    cleanup();
    process.exit(1);
  });

  channel.bind("call:incoming", (data) => {
    console.log("RESULT: PASS — 被叫收到 call:incoming:", JSON.stringify(data).slice(0, 200));
    cleanup();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("E2E_ERROR:", e.message);
  process.exit(1);
});
