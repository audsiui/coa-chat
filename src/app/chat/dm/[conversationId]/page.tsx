import { requirePageUser } from "@/lib/rsc";
import { DmView } from "@/components/chat/dm-view";

export default async function DmPage(
  props: PageProps<"/chat/dm/[conversationId]">,
) {
  const user = await requirePageUser();
  const { conversationId } = await props.params;
  return <DmView me={user} conversationId={conversationId} />;
}
