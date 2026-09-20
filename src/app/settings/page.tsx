import { redirect } from "next/navigation";

/** /settings → default to the General pane. */
export default function SettingsIndex() {
  redirect("/settings/general");
}
