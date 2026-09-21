"use client";

import { ThemeProvider } from "next-themes";
import { StoreHydration } from "@/stores/StoreHydration";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
    >
      <StoreHydration>{children}</StoreHydration>
    </ThemeProvider>
  );
}
