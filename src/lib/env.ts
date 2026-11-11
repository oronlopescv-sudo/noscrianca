function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente em falta: ${name}`);
  return v;
}

export const env = {
  get centralUrl() { return required("CENTRAL_DATABASE_URL"); },
  get appSecret() {
    const s = required("APP_SECRET");
    if (s.length < 32) throw new Error("APP_SECRET deve ter pelo menos 32 caracteres");
    return s;
  },
  get appUrl() { return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""); },
  get storageDir() { return process.env.STORAGE_DIR || "./storage"; },
  get backupDir() { return process.env.BACKUP_DIR || "./backups"; },
  get backupRetentionDays() { return Number(process.env.BACKUP_RETENTION_DAYS || 14); },
  get maxTenantPools() { return Number(process.env.MAX_TENANT_POOLS || 50); },
  get isProd() { return process.env.NODE_ENV === "production"; },
  get secureCookies() { return this.appUrl.startsWith("https://"); },
};
