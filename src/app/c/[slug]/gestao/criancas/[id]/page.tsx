import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ChildCalendar, calendarMonth } from "@/components/tenant/child-calendar";
import { ChildForm } from "@/components/tenant/child-form";
import { DiaryFeed, type FeedEntry } from "@/components/tenant/diary";
import { ActionButton, ActionForm, ConfirmAction, Submit } from "@/components/ui/client";
import { Avatar, Badge, Card, DL, EmptyState, Field, PageHeader, Check } from "@/components/ui/kit";
import { addDays, ageLabel, fmtDate, fmtTime, money, todayIn } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";

const ATT_LABEL = { none: "Por registar", in: "Presente", out: "Saiu", absent: "Falta" } as const;
import { addPickupAction, linkGuardianAction, removePickupAction, setChildStatusAction, setPhotoConsentAction, unlinkGuardianAction, uploadChildPhotoAction, uploadDocumentAction, deleteDocumentAction } from "@/server/people";
import { fileUrl, requireTenant, visibleClassrooms } from "@/lib/tenant";
import { attState } from "@/components/tenant/attendance";

export const dynamic = "force-dynamic";

export default async function ChildPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug, { permission: "children.view" });
  const child = await ctx.db.query.children.findFirst({
    where: eq(t.children.id, id),
    with: {
      classroom: true, feePlan: true,
      guardians: { with: { guardian: { with: { user: true } } } },
      pickups: true,
      documents: true,
    },
  });
  if (!child) notFound();
  if (ctx.classroomIds !== null && (!child.classroomId || !ctx.classroomIds.includes(child.classroomId))) notFound();

  const canManage = ctx.can("children.manage") && !ctx.readOnly;
  const today = todayIn(ctx.settings.timezone);
  const from = addDays(today, -13);
  const [att, diary, invoices, classrooms, feePlans, allGuardians] = await Promise.all([
    ctx.db.select().from(t.attendance).where(and(eq(t.attendance.childId, id), gte(t.attendance.date, from))).orderBy(desc(t.attendance.date)),
    ctx.can("diary.view") ? ctx.db.query.diaryEntries.findMany({ where: and(eq(t.diaryEntries.childId, id), eq(t.diaryEntries.visible, true)), orderBy: [desc(t.diaryEntries.occurredAt)], limit: 25 }) : Promise.resolve([]),
    ctx.can("finance.view") ? ctx.db.query.invoices.findMany({ where: eq(t.invoices.childId, id), orderBy: [desc(t.invoices.period)], limit: 12 }) : Promise.resolve([]),
    visibleClassrooms(ctx, false),
    ctx.db.query.feePlans.findMany({ orderBy: (f, { asc }) => asc(f.name) }),
    ctx.db.query.guardians.findMany({ with: { user: true }, orderBy: (g, { asc }) => asc(g.createdAt) }),
  ]);
  const linked = new Set(child.guardians.map((g) => g.guardianId));
  const available = allGuardians.filter((g) => !linked.has(g.id));
  const hidden = { slug, childId: id };
  const cur = ctx.settings.currency;

  const feed: FeedEntry[] = diary.map((e) => ({
    id: e.id, type: e.type, title: e.title, details: e.details, occurredAt: e.occurredAt,
    photoUrl: child.photoConsent ? fileUrl(ctx, e.photoPath) : null,
    createdByName: e.createdByName, createdById: e.createdById, groupId: e.groupId, visible: e.visible,
  }));

  return (
    <>
      <PageHeader
        back={{ href: `${ctx.base}/gestao/criancas`, label: "Crianças" }}
        title={`${child.firstName} ${child.lastName}`}
        subtitle={<>{ageLabel(child.birthDate, today)} · {child.classroom?.name ?? "Sem turma"} · <Badge tone={child.status === "ACTIVE" ? "green" : "gray"}>{child.status === "ACTIVE" ? "Ativa" : "Inativa"}</Badge></>}
        actions={canManage && (
          <ActionButton action={setChildStatusAction} hidden={{ slug, childId: id, status: child.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}>
            {child.status === "ACTIVE" ? "Marcar como inativa" : "Reativar"}
          </ActionButton>
        )}
      />

      <div className="mb-5">
        <ChildCalendar ctx={ctx} childId={id} month={calendarMonth((await searchParams).mes, today)} basePath={`${ctx.base}/gestao/criancas/${id}`}
          showFinance={ctx.can("finance.view")} showAttendance={ctx.can("attendance.view")} manage canPay={ctx.can("finance.manage") && !ctx.readOnly} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Ficha da criança">
            {canManage ? (
              <ChildForm slug={slug} child={{ ...child, classroomId: child.classroomId, feePlanId: child.feePlanId }} classrooms={classrooms} feePlans={feePlans} today={today} />
            ) : (
              <DL items={[
                ["Data de nascimento", fmtDate(child.birthDate)], ["Sexo", child.gender === "F" ? "Feminino" : child.gender === "M" ? "Masculino" : "Não indicado"],
                ["Inscrição", fmtDate(child.enrolledAt)], ["Turma", child.classroom?.name ?? "Sem turma"], ["Mensalidade", child.feePlan ? `${child.feePlan.name} (${money(child.feePlan.amountCents, cur)})` : "Sem mensalidade"],
                ["Saúde e alergias", child.healthNotes || "—"], ["Notas", child.notes || "—"],
              ]} />
            )}
          </Card>

          <Card title="Encarregados de educação" actions={<span className="text-xs text-ink-soft">{child.guardians.length} associados</span>}>
            {child.guardians.length === 0 ? <EmptyState title="Sem encarregados" text="Associe pelo menos um encarregado para que a família veja a criança." /> : (
              <ul className="divide-y divide-line">
                {child.guardians.map((g) => (
                  <li key={g.guardianId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={g.guardian.user.name} size={36} />
                      <div>
                        <p className="font-medium">{g.guardian.user.name} {g.isPrimary && <Badge tone="accent">Principal</Badge>}</p>
                        <p className="text-xs text-ink-soft">{g.relationship}{g.canPickup ? " · pode recolher" : ""}{g.guardian.user.status === "INVITED" ? " · convite pendente" : ""}{g.guardian.user.status === "SUSPENDED" ? " · conta suspensa" : ""}</p>
                        <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                          <div><dt className="inline text-ink-soft">Email: </dt><dd className="inline"><a href={`mailto:${g.guardian.user.email}`} className="link">{g.guardian.user.email}</a></dd></div>
                          <div><dt className="inline text-ink-soft">Telefone: </dt><dd className="inline">{g.guardian.user.phone ? <><a href={`tel:${g.guardian.user.phone}`} className="link">{g.guardian.user.phone}</a>{g.guardian.user.phone.replace(/[^0-9]/g, "").length >= 7 && <> · <a href={`https://wa.me/${g.guardian.user.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener" className="link">WhatsApp</a></>}</> : "—"}</dd></div>
                          <div><dt className="inline text-ink-soft">Morada: </dt><dd className="inline">{g.guardian.address || "—"}</dd></div>
                          <div><dt className="inline text-ink-soft">Profissão: </dt><dd className="inline">{g.guardian.occupation || "—"}</dd></div>
                          <div><dt className="inline text-ink-soft">Documento: </dt><dd className="inline">{g.guardian.idDocument || "—"}</dd></div>
                        </dl>
                      </div>
                    </div>
                    {canManage && <ConfirmAction action={unlinkGuardianAction} hidden={{ slug, childId: id, guardianId: g.guardianId }} label="Desassociar" title="Desassociar encarregado" text="A família deixa de ver esta criança. A conta do encarregado mantém-se." confirmLabel="Desassociar" danger />}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <details className="mt-4 rounded-btn border border-line p-4">
                <summary className="cursor-pointer text-sm font-semibold">Associar encarregado</summary>
                <ActionForm action={linkGuardianAction} hidden={{ slug, childId: id }} className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Encarregado existente" hint="Deixe em branco para criar um novo">
                      <select name="guardianId" className="input" defaultValue="">
                        <option value="">Criar novo encarregado</option>
                        {available.map((g) => <option key={g.id} value={g.id}>{g.user.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Parentesco"><input name="relationship" className="input" maxLength={60} placeholder="Mãe, pai, avó…" defaultValue="Encarregado" /></Field>
                    <Field label="Nome (novo)"><input name="name" className="input" maxLength={120} /></Field>
                    <Field label="Email (novo)"><input name="email" type="email" className="input" maxLength={160} /></Field>
                    <Field label="Telefone (novo)"><input name="phone" type="tel" className="input" maxLength={40} /></Field>
                  </div>
                  <Check name="isPrimary" label="Encarregado principal" />
                  <Check name="canPickup" label="Pode recolher a criança" defaultChecked />
                  <div className="flex justify-end"><Submit>Associar</Submit></div>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Pessoas autorizadas a recolher">
            {child.pickups.length === 0 ? <p className="text-sm text-ink-soft">Nenhuma pessoa adicional autorizada.</p> : (
              <ul className="divide-y divide-line">
                {child.pickups.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div><p className="font-medium">{p.name}</p><p className="text-xs text-ink-soft">{[p.relationship, p.phone, p.idDocument].filter(Boolean).join(" · ") || "—"}</p></div>
                    {canManage && <ConfirmAction action={removePickupAction} hidden={{ slug, id: p.id }} label="Remover" title="Remover pessoa autorizada" confirmLabel="Remover" danger />}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <ActionForm action={addPickupAction} hidden={{ slug, childId: id }} className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Nome"><input name="name" className="input" required maxLength={120} /></Field>
                <Field label="Parentesco"><input name="relationship" className="input" maxLength={60} /></Field>
                <Field label="Telefone"><input name="phone" type="tel" className="input" maxLength={40} /></Field>
                <Field label="Documento"><input name="idDocument" className="input" maxLength={60} /></Field>
                <div className="sm:col-span-2 flex justify-end"><Submit>Adicionar pessoa</Submit></div>
              </ActionForm>
            )}
          </Card>

          {ctx.can("documents.manage") || ctx.can("children.view") ? (
            <Card title="Documentos">
              {child.documents.length === 0 ? <p className="text-sm text-ink-soft">Sem documentos anexados.</p> : (
                <ul className="divide-y divide-line">
                  {child.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0"><a href={fileUrl(ctx, d.path) ?? "#"} className="link truncate">{d.name}</a><p className="text-xs text-ink-soft">Enviado por {d.uploadedByName} · {fmtDate(d.createdAt.toISOString().slice(0, 10))}</p></div>
                      {ctx.can("documents.manage") && !ctx.readOnly && <ConfirmAction action={deleteDocumentAction} hidden={{ slug, id: d.id }} label="Eliminar" title="Eliminar documento" confirmLabel="Eliminar" danger />}
                    </li>
                  ))}
                </ul>
              )}
              {ctx.can("documents.manage") && !ctx.readOnly && (
                <ActionForm action={uploadDocumentAction} hidden={{ slug, childId: id }} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Field label="Ficheiro (PDF ou imagem, até 10 MB)" className="flex-1"><input name="file" type="file" accept="application/pdf,image/*" required className="input" /></Field>
                  <Submit>Enviar documento</Submit>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card title="Foto e consentimento">
            <div className="mb-4 flex items-center gap-4">
              {child.photoPath ? <img src={fileUrl(ctx, child.photoPath) ?? ""} alt={`Foto de ${child.firstName}`} className="h-20 w-20 rounded-2xl object-cover" /> : <Avatar name={child.firstName} size={80} />}
              <div className="text-sm">
                <p className={child.photoConsent ? "font-medium text-emerald-700" : "font-medium text-ink-soft"}>{child.photoConsent ? "Autorização para fotografias: sim" : "Sem autorização para fotografias"}</p>
                {child.photoConsentAt && <p className="text-xs text-ink-soft">Registado em {fmtDate(child.photoConsentAt.toISOString().slice(0, 10))} por {child.photoConsentBy}</p>}
              </div>
            </div>
            <p className="mb-4 text-xs text-ink-soft">As fotografias do diário só são mostradas aos encarregados e registadas quando há autorização.</p>
            {canManage && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={setPhotoConsentAction} hidden={{ slug, childId: id, consent: "1" }} className="btn-secondary btn-sm">Autorizar fotografias</ActionButton>
                  <ActionButton action={setPhotoConsentAction} hidden={{ slug, childId: id, consent: "0" }} className="btn-ghost btn-sm">Retirar autorização</ActionButton>
                </div>
                <ActionForm action={uploadChildPhotoAction} hidden={{ slug, childId: id }} className="space-y-3">
                  <Field label="Foto de perfil (JPG, PNG ou WebP)"><input name="photo" type="file" accept="image/*" required className="input" /></Field>
                  <div className="flex justify-end"><Submit>Carregar foto</Submit></div>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title="Presenças (últimos 14 dias)" pad={false}>
            {att.length === 0 ? <div className="card-pad text-sm text-ink-soft">Sem registos neste período.</div> : (
              <ul className="divide-y divide-line">
                {att.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-5">
                    <span>{fmtDate(a.date)}</span>
                    <span className="text-ink-soft">{ATT_LABEL[attState(a)]}{a.checkInAt ? ` · ${fmtTime(a.checkInAt, ctx.settings.timezone)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {ctx.can("finance.view") && <Card title="Mensalidades" pad={false}>
            {invoices.length === 0 ? <div className="card-pad text-sm text-ink-soft">Sem faturas.</div> : (
              <ul className="divide-y divide-line">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <Link href={`${ctx.base}/gestao/mensalidades/${i.id}`} className="link">{i.number}</Link>
                    <span className="flex items-center gap-2"><span>{money(i.totalCents, cur)}</span><Badge tone={INVOICE_STATUS[i.status]?.tone ?? "gray"}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>}
        </div>
      </div>

      {ctx.can("diary.view") && (
        <Card title="Diário recente" className="mt-5" pad={false}>
          <DiaryFeed entries={feed} timezone={ctx.settings.timezone} canDelete={false} userId={ctx.user.id} emptyText="Ainda não há registos no diário." />
        </Card>
      )}
    </>
  );
}
