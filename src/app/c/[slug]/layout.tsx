import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { tenantBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await tenantBranding((await params).slug);
  return b.name ? { title: { default: b.name, template: `%s · ${b.name}` } } : {};
}

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const b = await tenantBranding((await params).slug);
  return <div style={{ "--accent": b.accent } as CSSProperties}>{children}</div>;
}
