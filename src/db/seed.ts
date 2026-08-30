/**
 * 演示数据种子脚本：npm run seed
 * 创建两个测试账号、一个服务器、默认频道、一条私聊。
 * 幂等：已存在同名用户时跳过。
 */
import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 与 src/lib/auth.ts 保持同一哈希格式，但避免在 Node 脚本中引入 next/headers
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("请在 .env 中配置 DATABASE_URL");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = 'alice'`)
    .limit(1);

  if (existing[0]) {
    console.log("演示数据已存在（alice/bob），跳过 seed。");
    await client.end();
    return;
  }

  const [alice, bob] = await db
    .insert(schema.users)
    .values([
      {
        username: "alice",
        passwordHash: hashPassword("password123"),
        displayName: "爱丽丝",
        avatarColor: "#5865f2",
      },
      {
        username: "bob",
        passwordHash: hashPassword("password123"),
        displayName: "鲍勃",
        avatarColor: "#3ba55c",
      },
    ])
    .returning({ id: schema.users.id });

  if (!alice || !bob) throw new Error("创建测试用户失败");

  const [server] = await db.transaction(async (tx) => {
    const [server] = await tx
      .insert(schema.servers)
      .values({
        name: "极客小队",
        ownerId: alice.id,
        inviteCode: "seed-demo",
        iconColor: "#5865f2",
      })
      .returning({ id: schema.servers.id });

    if (!server) throw new Error("创建测试服务器失败");

    await tx.insert(schema.serverMembers).values([
      { serverId: server.id, userId: alice.id, role: "owner" },
      { serverId: server.id, userId: bob.id, role: "member" },
    ]);

    await tx.insert(schema.channels).values([
      { serverId: server.id, name: "公告", type: "text", position: 0 },
      { serverId: server.id, name: "闲聊", type: "text", position: 1 },
      { serverId: server.id, name: "语音大厅", type: "voice", position: 2 },
    ]);

    return [server];
  });

  const channelRows = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(eq(schema.channels.serverId, server.id));
  const general = channelRows.find((c) => c.id);
  if (general) {
    await db.insert(schema.messages).values([
      { channelId: general.id, authorId: alice.id, content: "欢迎来到 CoaChat！这是演示消息。" },
      { channelId: general.id, authorId: bob.id, content: "收到，界面挺利索的。" },
    ]);
  }

  const [conversation] = await db
    .insert(schema.dmConversations)
    .values({})
    .returning({ id: schema.dmConversations.id });
  if (conversation) {
    await db.insert(schema.dmParticipants).values([
      { conversationId: conversation.id, userId: alice.id },
      { conversationId: conversation.id, userId: bob.id },
    ]);
    await db.insert(schema.dmMessages).values({
      conversationId: conversation.id,
      authorId: alice.id,
      content: "私聊也通了，晚点开个语音房？",
    });
    await db
      .update(schema.dmConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(schema.dmConversations.id, conversation.id));
  }

  console.log("Seed 完成：");
  console.log("  账号 alice / password123");
  console.log("  账号 bob   / password123");
  console.log("  服务器「极客小队」（邀请码 seed-demo）");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
