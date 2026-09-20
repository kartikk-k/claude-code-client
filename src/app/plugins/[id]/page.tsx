import { notFound } from "next/navigation";
import { PLUGINS, getPlugin } from "../catalog";
import { PluginDetail } from "./PluginDetail";

/** Pre-render a detail page per known plugin. */
export function generateStaticParams() {
  return PLUGINS.map((p) => ({ id: p.id }));
}

export default async function PluginDetailPage({
  params,
}: PageProps<"/plugins/[id]">) {
  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin) notFound();
  return <PluginDetail plugin={plugin} />;
}
