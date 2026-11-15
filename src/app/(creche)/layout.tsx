import type { ReactNode } from "react";
import { PlainShell } from "@/components/shell";

/** O site de cada creche tem cabeçalho e rodapé próprios (ver creche/[slug]/page.tsx). */
export default function CrecheSiteLayout({ children }: { children: ReactNode }) {
  return <PlainShell>{children}</PlainShell>;
}
