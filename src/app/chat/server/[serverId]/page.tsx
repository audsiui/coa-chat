import { requirePageUser } from "@/lib/rsc";
import { ServerHomeView } from "@/components/chat/server-home-view";

export default async function ServerHomePage() {
  // 页面级鉴权（layout 之外的第二道闸，见 requirePageUser 说明）
  await requirePageUser();
  return <ServerHomeView />;
}
