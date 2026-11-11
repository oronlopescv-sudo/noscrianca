import { LogIn, LogOut, MoreHorizontal, Undo2 } from "lucide-react";
import { ActionForm, FormFooter, Modal, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { checkInAction, checkOutAction, clearAttendanceAction, markAbsentAction } from "@/server/daily";

export type AttendanceRow = { status: "PRESENT" | "ABSENT"; checkInAt: Date | null; checkOutAt: Date | null; droppedBy: string; pickedBy: string; absenceReason: string } | undefined;
export type AttState = "none" | "in" | "out" | "absent";

export function attState(a: AttendanceRow): AttState {
  if (!a) return "none";
  if (a.status === "ABSENT") return "absent";
  return a.checkOutAt ? "out" : "in";
}

/** Botões de presença de uma criança: 1 toque para entrada/saída + opções. */
export function AttendanceActions({ slug, childId, childName, date, isToday, row, pickupNames, big }: {
  slug: string; childId: string; childName: string; date: string; isToday: boolean; row: AttendanceRow; pickupNames: string[]; big?: boolean;
}) {
  const state = attState(row);
  const hid = { slug, childId, date };
  const btn = big ? "btn w-full" : "btn btn-sm";
  const people = (name: string, label: string) => (
    <Field label={label}>
      <input name={name} className="input" maxLength={120} list={`people-${childId}`} placeholder="Opcional" />
      <datalist id={`people-${childId}`}>{pickupNames.map((n) => <option key={n} value={n} />)}</datalist>
    </Field>
  );
  const time = !isToday ? <Field label="Hora"><input name="time" type="time" className="input" required /></Field> : <Field label="Hora" hint="Deixe vazio para usar a hora atual"><input name="time" type="time" className="input" /></Field>;

  return (
    <div className={big ? "flex items-stretch gap-2" : "flex flex-wrap items-center justify-end gap-2"}>
      {state === "none" && isToday && (
        <ActionForm action={checkInAction} hidden={hid} className={big ? "flex-1" : "inline"}>
          <Submit className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600`}><LogIn size={16} /> Entrada</Submit>
        </ActionForm>
      )}
      {state === "in" && isToday && (
        <ActionForm action={checkOutAction} hidden={hid} className={big ? "flex-1" : "inline"}>
          <Submit className={`${btn} bg-navy text-white hover:bg-navy-light`}><LogOut size={16} /> Saída</Submit>
        </ActionForm>
      )}
      {(state === "out" || state === "absent") && big && <span className="flex flex-1 items-center justify-center rounded-btn bg-surface text-sm font-medium text-ink-soft">{state === "out" ? "Já saiu" : "Falta"}</span>}
      <Modal trigger={<MoreHorizontal size={18} />} triggerClass={`${big ? "btn" : "btn btn-sm"} border border-line bg-white px-3 text-ink`} title={`Presença — ${childName}`}>
        <div className="space-y-6">
          {(state === "none" || state === "absent") && (
            <ActionForm action={checkInAction} hidden={hid} className="space-y-3">
              <h3 className="text-sm">Registar entrada</h3>
              {people("droppedBy", "Quem entregou")}
              {time}
              <FormFooter submit="Registar entrada" cancel={false} />
            </ActionForm>
          )}
          {state === "in" && (
            <ActionForm action={checkOutAction} hidden={hid} className="space-y-3">
              <h3 className="text-sm">Registar saída</h3>
              {people("pickedBy", "Quem recolheu")}
              {time}
              <FormFooter submit="Registar saída" cancel={false} />
            </ActionForm>
          )}
          {state === "none" && (
            <ActionForm action={markAbsentAction} hidden={hid} className="space-y-3 border-t border-line pt-5">
              <h3 className="text-sm">Marcar falta</h3>
              <Field label="Motivo"><input name="reason" className="input" maxLength={200} placeholder="Opcional (ex.: doença)" /></Field>
              <FormFooter submit="Marcar falta" cancel={false} />
            </ActionForm>
          )}
          {state !== "none" && (
            <ActionForm action={clearAttendanceAction} hidden={{ ...hid, what: state === "out" ? "out" : "all" }} className="border-t border-line pt-5">
              <p className="mb-3 text-sm text-ink-soft">{state === "out" ? "Anular a saída (a criança volta a estar presente)." : state === "in" ? "Anular a entrada registada." : "Anular a falta registada."}</p>
              <Submit className="btn-ghost"><Undo2 size={16} /> {state === "out" ? "Anular saída" : "Anular registo"}</Submit>
            </ActionForm>
          )}
        </div>
      </Modal>
    </div>
  );
}
