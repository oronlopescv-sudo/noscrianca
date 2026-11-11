"use server";

import { z } from "zod";
import { central, c } from "@/db/central";
import { getInstitutionBySlug } from "@/lib/tenant";
import { lockedFor, recordFailure } from "@/lib/auth";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { headers } from "next/headers";

const signupSchema = z.object({
  institutionName: z.string().min(2, "Indique o nome da instituição.").max(120),
  contactName: z.string().min(2, "Indique o seu nome.").max(120),
  email: z.string().email("Email inválido.").max(160),
  phone: z.string().max(40),
  city: z.string().max(80),
  childrenEstimate: z.string().regex(/^\d{0,5}$/, "Número de crianças inválido."),
  message: z.string().max(1000),
});

export async function requestSignupAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    if (str(fd, "website")) return { ok: true, redirect: "/pedir-adesao?enviado=1" }; // honeypot anti-spam
    const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const key = `signup:${ip}`;
    if (await lockedFor(key)) fail("Demasiados pedidos. Tente novamente mais tarde.");
    await recordFailure(key);
    const d = signupSchema.parse({
      institutionName: str(fd, "institutionName"), contactName: str(fd, "contactName"), email: str(fd, "email").toLowerCase(),
      phone: str(fd, "phone"), city: str(fd, "city"), childrenEstimate: str(fd, "childrenEstimate"), message: str(fd, "message"),
    });
    await central().insert(c.signupRequests).values({ ...d, childrenEstimate: d.childrenEstimate ? Number(d.childrenEstimate) : null });
    return { ok: true, redirect: "/pedir-adesao?enviado=1" };
  });
}

export async function findInstitutionAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const code = str(fd, "code").toLowerCase().replace(/^.*\/c\//, "").replace(/\/.*$/, "");
    const inst = await getInstitutionBySlug(code);
    if (!inst || inst.status === "ARCHIVED" || inst.status === "PENDING") fail("Não encontrámos nenhuma instituição com esse código.");
    return { ok: true, redirect: `/c/${inst!.slug}/entrar` };
  });
}
