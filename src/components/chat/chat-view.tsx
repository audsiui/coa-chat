"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { ev } from "@/lib/constants";
import {
  formatDayLabel,
  formatTime,
  sameDay,
  shouldGroupWithPrevious,
} from "@/lib/format";
import { usePusherChannel } from "@/components/providers/pusher-provider";
import type { PublicUser } from "@/lib/types";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
};

type ChatViewProps = {
  me: PublicUser;
  title: string;
  titleIcon?: ReactNode;
  subtitle?: string | null;
  fetchUrl: string;
  sendUrl: string;
  realtimeChannel: string | null;
  headerActions?: ReactNode;
  emptyHint?: string;
};

export function ChatView({
  me,
  title,
  titleIcon,
  subtitle,
  fetchUrl,
  sendUrl,
  realtimeChannel,
  headerActions,
  emptyHint,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /* ---------------- 初始加载 ---------------- */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    void (async () => {
      try {
        const data = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(fetchUrl);
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        nearBottomRef.current = true;
        requestAnimationFrame(() => scrollToBottom());
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "加载消息失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUrl, scrollToBottom]);

  /* ---------------- 向上翻页（保持视口锚点） ---------------- */

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || messages.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const anchorId = messages[0]?.id ?? null;
    try {
      const oldest = messages[0]!;
      const url = `${fetchUrl}${fetchUrl.includes("?") ? "&" : "?"}before=${encodeURIComponent(oldest.createdAt)}`;
      const data = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(url);
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (!node || !anchorId) return;
        const anchor = node.querySelector<HTMLElement>(`[data-mid="${anchorId}"]`);
        if (anchor) node.scrollTop = Math.max(0, anchor.offsetTop - 12);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载历史消息失败");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchUrl, hasMore, messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (el.scrollTop < 80) void loadMore();
  }, [loadMore]);

  /* ---------------- 实时新消息 ---------------- */

  const channel = usePusherChannel(realtimeChannel);
  useEffect(() => {
    if (!channel) return;
    const handler = (data: unknown) => {
      const msg = data as ChatMessage;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      requestAnimationFrame(() => {
        if (nearBottomRef.current) scrollToBottom(true);
      });
    };
    channel.bind(ev.messageNew, handler);
    return () => {
      channel.unbind(ev.messageNew, handler);
    };
  }, [channel, scrollToBottom]);

  /* ---------------- 发送 ---------------- */

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>(sendUrl, { content });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setDraft("");
      if (composerRef.current) composerRef.current.style.height = "auto";
      nearBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }, [draft, sendUrl, sending, scrollToBottom]);

  /* ---------------- 渲染（日期分隔 + 连续消息分组） ---------------- */

  const rows: ReactNode[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
      rows.push(<DayChip key={`day-${m.id}`} label={formatDayLabel(m.createdAt)} />);
    }
    const grouped = shouldGroupWithPrevious(
      prev?.createdAt,
      prev?.author.id,
      m.createdAt,
      m.author.id,
    );
    rows.push(
      <MessageRow
        key={m.id}
        message={m}
        grouped={grouped}
        mine={m.author.id === me.id}
      />,
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        {titleIcon}
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1">{headerActions}</div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-slim relative min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {loading ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">加载中…</p>
        ) : messages.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="text-sm text-muted-foreground">{emptyHint ?? "还没有消息，说点什么吧"}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <p className="mb-3 text-center text-xs text-muted-foreground">
                {loadingMore ? "正在加载历史消息…" : "上滑加载更多"}
              </p>
            )}
            <div className="flex flex-col gap-0.5">{rows}</div>
          </>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="flex items-end gap-2 rounded-lg bg-input px-3 py-2.5">
          <textarea
            ref={composerRef}
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder={`发送消息到 ${title}`}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 flex-1 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <Button
            size="icon-sm"
            aria-label="发送"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
          >
            <SendHorizontal />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DayChip({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  mine,
}: {
  message: ChatMessage;
  grouped: boolean;
  mine: boolean;
}) {
  if (grouped) {
    return (
      <div data-mid={message.id} className="group relative pl-14">
        <span className="absolute top-1 left-0 hidden w-12 text-right text-[10px] text-muted-foreground group-hover:inline">
          {formatTime(message.createdAt)}
        </span>
        <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    );
  }
  return (
    <div data-mid={message.id} className={cn("mt-2 flex items-start gap-3 first:mt-0")}>
      <AvatarInitials
        name={message.author.displayName}
        color={message.author.avatarColor}
        size="md"
        className="mt-0.5"
      />
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              mine ? "text-foreground" : "text-foreground/90",
            )}
          >
            {message.author.displayName}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
