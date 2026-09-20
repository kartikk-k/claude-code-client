import { Suspense } from "react";
import { ClientShell } from "./ClientShell";

export default function Home() {
  // ClientShell reads ?session= via useSearchParams, which requires a Suspense
  // boundary during prerender.
  return (
    <Suspense fallback={null}>
      <ClientShell />
    </Suspense>
  );
}
