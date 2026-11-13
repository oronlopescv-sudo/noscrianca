"use server";

import { z } from "zod";
import { central, c } from "@/db/central";
import { getTenantDb, t } from "@/db/tenant";
import { isIsoDate } from "@/lib/format";
import { getInstitutionBySlug, institutionUsable, notify, staffWithPermission } from "@/lib/tenant";
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

const enrollmentSchema = z.object({
  guardianName: z.string().min(2, "Indique o seu nome.").max(120),
  email: z.union([z.string().email("Email inválido.").max(160), z.literal("")]),
  phone: z.string().max(40),
  childName: z.string().min(2, "Indique o nome da criança.").max(120),
  message: z.string().max(1000),
});

/** Pedido de inscrição feito por um visitante na página pública de uma creche. */
export async function requestEnrollmentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    if (str(fd, "website")) return { ok: true, redirect: "/" }; // honeypot anti-spam
    const inst = await getInstitutionBySlug(str(fd, "slug"));
    if (!inst || !institutionUsable(inst.status) || inst.status === "SUSPENDED") fail("Esta instituição não está a aceitar pedidos.");
    const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const key = `enroll:${inst!.id}:${ip}`;
    if (await lockedFor(key)) fail("Demasiados pedidos. Tente novamente mais tarde.");
    await recordFailure(key);
    const d = enrollmentSchema.parse({
      guardianName: str(fd, "guardianName"), email: str(fd, "email").toLowerCase(), phone: str(fd, "phone"), childName: str(fd, "childName"), message: str(fd, "message"),
    });
    if (!d.email && !d.phone) fail("Indique um email ou um telefone para a creche o poder contactar.");
    const birth = str(fd, "childBirthDate");
    if (birth && (!isIsoDate(birth) || birth > new Date().toISOString().slice(0, 10))) fail("Data de nascimento inválida.");
    const db = await getTenantDb(inst!.id);
    await db.insert(t.enrollmentRequests).values({ ...d, childBirthDate: birth || null });
    await notify(db, await staffWithPermission(db, "children.manage"), {
      title: "Novo pedido de inscrição", body: `${d.childName} · pedido de ${d.guardianName}`, href: `/c/${inst!.slug}/gestao/inscricoes`,
    });
    return { ok: true, redirect: `/creche/${inst!.slug}?pedido=1#inscricao` };
  });
}
