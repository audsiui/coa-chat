import { requirePageUser } from "@/lib/rsc";
import { ChannelView } from "@/components/chat/channel-view";

export default async function ChannelPage(
  props: PageProps<"/chat/server/[serverId]/[channelId]">,
) {
  const user = await requirePageUser();
  const { serverId, channelId } = await props.params;
  return <ChannelView me={user} serverId={serverId} channelId={channelId} />;
}
