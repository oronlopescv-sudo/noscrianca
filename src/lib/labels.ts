import type { Tone } from "@/components/ui/kit";

export const INSTITUTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pendente", tone: "gray" },
  PROVISIONING: { label: "A provisionar", tone: "blue" },
  TRIAL: { label: "Em teste", tone: "purple" },
  ACTIVE: { label: "Ativa", tone: "green" },
  PAST_DUE: { label: "Pagamento em atraso", tone: "amber" },
  SUSPENDED: { label: "Suspensa", tone: "red" },
  FAILED: { label: "Criação falhou", tone: "red" },
  ARCHIVED: { label: "Arquivada", tone: "gray" },
};

export const PLATFORM_INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Em aberto", tone: "amber" },
  PAID: { label: "Paga", tone: "green" },
  VOID: { label: "Anulada", tone: "gray" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Por pagar", tone: "amber" },
  PARTIAL: { label: "Pago em parte", tone: "blue" },
  PAID: { label: "Pago", tone: "green" },
  VOID: { label: "Anulada", tone: "gray" },
};

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  INVITED: { label: "Convite por aceitar", tone: "amber" },
  ACTIVE: { label: "Ativo", tone: "green" },
  SUSPENDED: { label: "Suspenso", tone: "red" },
};

export const DIARY_TYPES: Record<string, { label: string; tone: Tone }> = {
  MEAL: { label: "Refeição", tone: "green" },
  SLEEP: { label: "Sesta", tone: "blue" },
  HYGIENE: { label: "Higiene", tone: "purple" },
  ACTIVITY: { label: "Atividade", tone: "amber" },
  INCIDENT: { label: "Ocorrência", tone: "red" },
  NOTE: { label: "Nota", tone: "gray" },
  PHOTO: { label: "Fotografia", tone: "accent" },
};

export const ROOM_COLORS: Record<string, { label: string; bg: string; hex: string }> = {
  green: { label: "Verde", bg: "bg-room-green", hex: "#5DC98A" },
  coral: { label: "Coral", bg: "bg-room-coral", hex: "#F0714F" },
  blue: { label: "Azul", bg: "bg-room-blue", hex: "#5B8DEF" },
  yellow: { label: "Amarelo", bg: "bg-room-yellow", hex: "#F5B93A" },
  purple: { label: "Lilás", bg: "bg-room-purple", hex: "#A77BDB" },
};
export const ROOM_COLOR_KEYS = Object.keys(ROOM_COLORS);

export const CYCLE_LABEL: Record<string, string> = { MONTHLY: "Mensal", YEARLY: "Anual" };
