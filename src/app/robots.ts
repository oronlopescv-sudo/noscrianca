import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Portais (de creche, admin, API) não têm nada para indexar: dentro só há
 * dados de crianças e famílias. O público indexável é a página por creche. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/c/", "/admin/", "/offline"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
