import Arena from "@/components/Arena";
import { getBots } from "@/lib/bbpl/client";

export const revalidate = 3600;

export default async function ArenaPage() {
  const { bots, source } = await getBots();
  // Alternates don't compete in the group stage; keep them out of the draw.
  const competitors = bots.filter((b) => !b.isAlternate);
  return <Arena bots={competitors} source={source} />;
}
