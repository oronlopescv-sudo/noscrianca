import { ActionForm, FormFooter } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { createChildAction, updateChildAction } from "@/server/people";

export type ChildFormValues = {
  id: string; firstName: string; lastName: string; birthDate: string; gender: string; enrolledAt: string;
  classroomId: string | null; feePlanId: string | null; healthNotes: string; notes: string;
};

/** Formulário de criança (criação e edição). Os campos de saúde são visíveis apenas a quem tem permissão de gestão. */
export function ChildForm({ slug, child, classrooms, feePlans, today, onDone }: {
  slug: string; child?: ChildFormValues; classrooms: { id: string; name: string }[]; feePlans: { id: string; name: string; amountCents: number; active: boolean }[];
  today: string; onDone?: () => void;
}) {
  const edit = !!child;
  return (
    <ActionForm action={edit ? updateChildAction : createChildAction} hidden={{ slug, childId: child?.id }} className="space-y-4" resetOnSuccess={!edit} onDone={onDone}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome próprio"><input name="firstName" className="input" required maxLength={80} defaultValue={child?.firstName} /></Field>
        <Field label="Apelido"><input name="lastName" className="input" required maxLength={80} defaultValue={child?.lastName} /></Field>
        <Field label="Data de nascimento"><input name="birthDate" type="date" className="input" required max={today} defaultValue={child?.birthDate} /></Field>
        <Field label="Sexo">
          <select name="gender" className="input" defaultValue={child?.gender ?? ""}>
            <option value="">Não indicado</option><option value="F">Feminino</option><option value="M">Masculino</option>
          </select>
        </Field>
        <Field label="Data de inscrição"><input name="enrolledAt" type="date" className="input" defaultValue={child?.enrolledAt ?? today} /></Field>
        <Field label="Turma">
          <select name="classroomId" className="input" defaultValue={child?.classroomId ?? ""}>
            <option value="">Sem turma</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Mensalidade">
          <select name="feePlanId" className="input" defaultValue={child?.feePlanId ?? ""}>
            <option value="">Sem mensalidade</option>
            {feePlans.filter((f) => f.active || f.id === child?.feePlanId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas de saúde e alergias" hint="Visível para a equipa da sala e para a direção"><textarea name="healthNotes" className="input min-h-[80px]" maxLength={2000} defaultValue={child?.healthNotes} /></Field>
      <Field label="Notas internas"><textarea name="notes" className="input min-h-[70px]" maxLength={2000} defaultValue={child?.notes} /></Field>
      <FormFooter submit={edit ? "Guardar ficha" : "Inscrever criança"} />
    </ActionForm>
  );
}

