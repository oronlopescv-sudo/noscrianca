export const PERMISSIONS = {
  "children.view": "Ver crianças",
  "children.manage": "Registar e editar crianças",
  "guardians.manage": "Gerir encarregados e convites",
  "classrooms.manage": "Gerir turmas e salas",
  "employees.manage": "Gerir funcionários",
  "roles.manage": "Gerir cargos e permissões",
  "attendance.view": "Ver presenças",
  "attendance.record": "Registar entradas e saídas",
  "diary.view": "Ver diário das crianças",
  "diary.record": "Registar refeições, sestas, atividades e ocorrências",
  "announcements.manage": "Enviar comunicados aos pais",
  "messages.reply": "Ler e responder a mensagens dos pais",
  "finance.view": "Ver mensalidades, dívidas e relatórios financeiros",
  "finance.manage": "Definir mensalidades, registar pagamentos e emitir recibos",
  "reports.view": "Ver relatórios",
  "payroll.manage": "Gerir salários da equipa",
  "documents.manage": "Gerir documentos das crianças",
  "settings.manage": "Gerir perfil e definições da instituição",
  "audit.view": "Ver histórico de atividades",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; items: Permission[] }[] = [
  { label: "Crianças e famílias", items: ["children.view", "children.manage", "guardians.manage", "documents.manage"] },
  { label: "Turmas e equipa", items: ["classrooms.manage", "employees.manage", "roles.manage"] },
  { label: "Dia a dia", items: ["attendance.view", "attendance.record", "diary.view", "diary.record"] },
  { label: "Comunicação", items: ["announcements.manage", "messages.reply"] },
  { label: "Financeiro", items: ["finance.view", "finance.manage", "reports.view", "payroll.manage"] },
  { label: "Administração", items: ["settings.manage", "audit.view"] },
];

export const DIRECTOR_KEY = "DIRECTOR";

export type SystemRole = {
  key: string;
  name: string;
  description: string;
  panel: "MANAGEMENT" | "CLASSROOM";
  allClassrooms: boolean;
  permissions: Permission[];
};

/** Cargos criados automaticamente em cada instituição nova. */
export const SYSTEM_ROLES: SystemRole[] = [
  {
    key: DIRECTOR_KEY, name: "Diretor", description: "Acesso total à instituição",
    panel: "MANAGEMENT", allClassrooms: true, permissions: ALL_PERMISSIONS,
  },
  {
    key: "EDUCATOR", name: "Educador", description: "Regista o dia a dia das turmas autorizadas",
    panel: "CLASSROOM", allClassrooms: false,
    permissions: ["children.view", "attendance.view", "attendance.record", "diary.view", "diary.record", "messages.reply"],
  },
  {
    key: "ASSISTANT", name: "Auxiliar de educação", description: "Apoia o registo diário das turmas autorizadas",
    panel: "CLASSROOM", allClassrooms: false,
    permissions: ["children.view", "attendance.view", "attendance.record", "diary.view", "diary.record"],
  },
  {
    key: "ADMINISTRATIVE", name: "Administrativo", description: "Inscrições, documentação e contacto com as famílias",
    panel: "MANAGEMENT", allClassrooms: true,
    permissions: ["children.view", "children.manage", "guardians.manage", "documents.manage", "attendance.view", "diary.view", "announcements.manage", "messages.reply"],
  },
  {
    key: "FINANCE", name: "Responsável financeiro", description: "Mensalidades, pagamentos, recibos e dívidas",
    panel: "MANAGEMENT", allClassrooms: true,
    permissions: ["children.view", "finance.view", "finance.manage", "reports.view"],
  },
];
