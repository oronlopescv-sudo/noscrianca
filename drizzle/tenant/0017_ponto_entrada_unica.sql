-- Uma única entrada em aberto por funcionário no ponto (impede duplicados
-- por double-tap/corrida; os cliques em excesso recebem 23505 e mensagem clara).
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_open_uq"
	ON "time_entries" ("employee_id") WHERE "clock_out" IS NULL;
