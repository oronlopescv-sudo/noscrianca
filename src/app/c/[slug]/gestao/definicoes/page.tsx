import { asc } from "drizzle-orm";
import { ActionButton, ActionForm, ConfirmAction, Submit } from "@/components/ui/client";
import { Card, Check, Field, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { requireTenant } from "@/lib/tenant";
import { deletePublicPhotoAction, savePublicPageAction, saveSettingsAction, removeCoverAction, removeLogoAction, uploadCoverAction, uploadLogoAction, uploadPublicPhotoAction } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "settings.manage" });
  const s = ctx.settings;
  const slug = ctx.institution.slug;
  const canWrite = !ctx.readOnly;
  const photos = await ctx.db.query.publicPhotos.findMany({ orderBy: [asc(t.publicPhotos.createdAt)] });
  return (
    <>
      <PageHeader title="Definições da instituição" subtitle="Dados que aparecem em faturas, recibos e no portal dos pais" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Dados gerais" className="lg:col-span-2">
          <ActionForm action={saveSettingsAction} hidden={{ slug }} className="space-y-4" resetOnSuccess={false}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da instituição"><input name="name" className="input" required maxLength={120} defaultValue={s.name} disabled={!canWrite} /></Field>
              <Field label="NIF"><input name="taxId" className="input" maxLength={40} defaultValue={s.taxId} disabled={!canWrite} /></Field>
              <Field label="Email"><input name="email" type="email" className="input" maxLength={160} defaultValue={s.email} disabled={!canWrite} /></Field>
              <Field label="Telefone"><input name="phone" className="input" maxLength={40} defaultValue={s.phone} disabled={!canWrite} /></Field>
              <Field label="Morada" className="sm:col-span-2"><input name="address" className="input" maxLength={200} defaultValue={s.address} disabled={!canWrite} /></Field>
              <Field label="Ano letivo"><input name="schoolYear" className="input" maxLength={20} defaultValue={s.schoolYear} placeholder="2026/2027" disabled={!canWrite} /></Field>
              <Field label="Moeda">
                <select name="currency" className="input" defaultValue={s.currency} disabled={!canWrite}>
                  <option value="CVE">Escudo cabo-verdiano (CVE)</option><option value="EUR">Euro (EUR)</option><option value="USD">Dólar (USD)</option>
                </select>
              </Field>
              <Field label="Dia de vencimento" hint="Dia do mês (1 a 28)"><input name="invoiceDueDay" type="number" min={1} max={28} className="input" defaultValue={s.invoiceDueDay} disabled={!canWrite} /></Field>
              <Field label="Cor de destaque"><input name="accentColor" type="color" className="input h-11 p-1" defaultValue={s.accentColor} disabled={!canWrite} /></Field>
              <Field label="Dados para pagamento" hint="IBAN, referência ou instruções que aparecem nas faturas" className="sm:col-span-2"><textarea name="paymentInfo" className="input min-h-[90px]" maxLength={1000} defaultValue={s.paymentInfo} disabled={!canWrite} /></Field>
            </div>
            <div className="rounded-xl border border-line p-4 space-y-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" name="reminderEnabled" value="1" defaultChecked={s.reminderEnabled} disabled={!canWrite} className="h-4 w-4" />
                Enviar avisos automáticos de faturas em atraso
              </label>
              <Field label="Dias após o vencimento" hint="Separados por vírgula, por exemplo 1,7. Cada aviso é enviado uma só vez por encarregado. Requer email configurado no servidor.">
                <input name="reminderDays" className="input" maxLength={40} defaultValue={s.reminderDays} disabled={!canWrite} />
              </Field>
            </div>
            {canWrite && <div className="flex justify-end"><Submit>Guardar definições</Submit></div>}
          </ActionForm>
        </Card>
        <div className="space-y-5">
          <Card title="Logótipo">
            <div className="mb-4 flex items-center gap-4">
              {s.logoPath ? <img src={`${ctx.base}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}`} alt="Logótipo atual" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface text-xs text-ink-soft">Sem logótipo</div>}
            </div>
            {canWrite && (
              <div className="space-y-3">
                <ActionForm action={uploadLogoAction} hidden={{ slug }} className="space-y-3">
                  <Field label="Imagem (PNG, JPG ou WebP)"><input name="logo" type="file" accept="image/*" required className="input" /></Field>
                  <div className="flex justify-end"><Submit>Carregar logótipo</Submit></div>
                </ActionForm>
                {s.logoPath && <ActionButton action={removeLogoAction} hidden={{ slug }} className="btn-ghost btn-sm">Remover logótipo</ActionButton>}
              </div>
            )}
          </Card>
          <Card title="Capa da página pública">
            <div className="mb-4">
              {s.coverPath ? <img src={`${ctx.base}/capa?v=${encodeURIComponent(s.coverPath.slice(-24))}`} alt="Capa atual" className="h-36 w-full rounded-xl object-cover" /> : <div className="flex h-36 w-full items-center justify-center rounded-xl bg-surface text-xs text-ink-soft">Sem capa — a página usa as fotografias publicadas</div>}
            </div>
            {canWrite && (
              <div className="space-y-3">
                <ActionForm action={uploadCoverAction} hidden={{ slug }} className="space-y-3">
                  <Field label="Fotografia (PNG, JPG ou WebP, até 8 MB)" hint="Ideal na horizontal; aparece em grande no topo da página"><input name="capa" type="file" accept="image/*" required className="input" /></Field>
                  <div className="flex justify-end"><Submit>Carregar capa</Submit></div>
                </ActionForm>
                {s.coverPath && <ActionButton action={removeCoverAction} hidden={{ slug }} className="btn-ghost btn-sm">Remover capa</ActionButton>}
              </div>
            )}
          </Card>
          <Card title="Equipa e conta">
            <p className="text-sm text-ink-soft">Para gerir pessoas e cargos, use as secções Funcionários e Cargos e permissões.</p>
          </Card>
        </div>
      </div>

      <Card title="Página pública" className="mt-5" actions={<a href={`/creche/${slug}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Ver página pública</a>}>
        <p className="mb-4 text-sm text-ink-soft">É a página que qualquer pessoa vê ao escolher a creche na entrada do site. Mostra a capa e o logótipo (aqui ao lado), os contactos e a morada de cima, as salas ativas, e o que preencher aqui.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <ActionForm action={savePublicPageAction} hidden={{ slug }} className="space-y-4" resetOnSuccess={false}>
            <Field label="Apresentação" hint="Quem somos, projeto educativo, o que oferecemos (até 3000 caracteres)">
              <textarea name="publicDescription" className="input min-h-[180px]" maxLength={3000} defaultValue={s.publicDescription} disabled={!canWrite} />
            </Field>
            <Field label="Horário" hint="Exemplo: Segunda a sexta, das 7h30 às 18h30">
              <textarea name="publicHours" className="input min-h-[70px]" maxLength={300} defaultValue={s.publicHours} disabled={!canWrite} />
            </Field>
            {canWrite && <div className="flex justify-end"><Submit>Guardar página pública</Submit></div>}
          </ActionForm>
          <div>
            <p className="mb-2 text-sm font-medium">Fotografias ({photos.length} de 12)</p>
            {photos.length === 0 ? <p className="text-sm text-ink-soft">Ainda sem fotografias.</p> : (
              <ul className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <li key={p.id} className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${ctx.base}/foto/${p.id}`} alt={p.caption || "Fotografia da página pública"} className="aspect-[4/3] w-full rounded-btn object-cover" />
                    {p.caption && <p className="mt-1 truncate text-xs text-ink-soft">{p.caption}</p>}
                    {canWrite && <ConfirmAction action={deletePublicPhotoAction} hidden={{ slug, id: p.id }} label="Remover" title="Remover fotografia" text="A fotografia deixa de aparecer na página pública." confirmLabel="Remover" danger />}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && photos.length < 12 && (
              <ActionForm action={uploadPublicPhotoAction} hidden={{ slug }} className="mt-4 space-y-3 rounded-btn border border-line p-4">
                <Field label="Nova fotografia (JPG, PNG ou WebP, até 5 MB)"><input name="photo" type="file" accept="image/*" required className="input" /></Field>
                <Field label="Legenda (opcional)"><input name="caption" className="input" maxLength={120} /></Field>
                <Check name="confirm" label="Esta fotografia pode ser pública: não mostra crianças, ou tenho autorização dos encarregados." />
                <div className="flex justify-end"><Submit>Publicar fotografia</Submit></div>
              </ActionForm>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
