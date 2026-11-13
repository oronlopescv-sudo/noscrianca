# NosCriança

Plataforma multi-instituição para creches e jardins de infância, pensada para telemóvel e computador. Tudo corre numa única aplicação Next.js: interface, API (Server Actions e Route Handlers), tarefas de fundo e agendador.

## Arquitetura em resumo

- **Base de dados central** (`nc_central`): plataforma, planos, instituições, registo das bases de dados, faturação da plataforma e auditoria da plataforma.
- **Uma base de dados por instituição** (`nc_t_<slug>`), criada automaticamente no provisionamento, com utilizador próprio e sem permissões sobre as outras bases. Os dados de uma creche nunca ficam misturados com os de outra.
- **Painéis**: Super Administrador (`/admin`), gestão da creche (`/c/<slug>/gestao`), sala em tablet (`/c/<slug>/sala`) e portal dos pais em telemóvel (`/c/<slug>/pais`).
- Pagamentos registados manualmente (numerário, transferência, cheque, depósito). Sem pagamentos online.

## Desenvolvimento local

Requisitos: Node.js 22, PostgreSQL 16.

```bash
cp .env.example .env          # preencha os valores (APP_SECRET com 32+ caracteres)
npm install
npm run db:setup              # cria a base central, as migrações e o Super Administrador
npm run seed:demo             # duas creches de demonstração (opcional)
npm run dev                   # http://localhost:3000
```

Contas de demonstração (palavra-passe `Demo12345`, só para desenvolvimento):

| Perfil | Email | Acesso |
|---|---|---|
| Direção (Creche Sol Nascente) | diretora@creche-sol.demo | `/c/creche-sol/gestao` |
| Educadora (Creche Sol Nascente) | educadora@creche-sol.demo | `/c/creche-sol/sala` |
| Encarregada (Creche Sol Nascente) | rosa@familia.demo | `/c/creche-sol/pais` |
| Direção (Creche Lua Cheia) | diretora@creche-lua.demo | `/c/creche-lua/gestao` |

## Testes

```bash
npm test                      # unitários e de integração (usa a base central e a seed de demonstração)
npm run typecheck
npm run build
npm run start &               # noutro terminal, com a seed carregada
npm run test:pages            # percorre todas as páginas de cada perfil e verifica acessos
```

Os testes de integração cobrem o isolamento entre bases de dados (uma creche não consegue ligar-se à base da outra), a idempotência da faturação, a imutabilidade dos pagamentos (um pagamento não pode ser apagado) e os estornos.

## Cópias de segurança e migrações

```bash
npm run tenants:migrate                 # aplica migrações a todas as instituições ativas
npm run tenants:backup -- <slug>        # cópia de segurança manual (formato pg_dump)
npm run tenants:restore -- <slug> <id>  # repõe uma cópia (o id está na tabela backup_records)
npm run tenants:central-backup          # cópia da base central (plataforma)
npm run tenants:central-list            # lista as cópias da central no servidor
npm run tenants:central-restore -- <f>  # repõe a central a partir de um ficheiro (site PARADO)
```

As cópias automáticas são feitas diariamente (instituições **e central**) e apagadas após `BACKUP_RETENTION_DAYS` dias (14 por omissão). As cópias manuais e os ficheiros subidos pelo painel são mantidos.

No painel do admin, em **Backups**, cada cópia pode ser **descarregada** para fora do servidor — faça isso regularmente: se o servidor se perder, os ficheiros que estavam só no disco perdem-se com ele. Um ficheiro descarregado pode ser **subido de volta** («Carregar cópia»), validado e depois restaurado.

### Recuperação de desastre (o servidor perdeu-se)

1. Instale o sistema num servidor novo e confirme que o painel abre (base central vazia).
2. Pare o site e restaure a base central a partir da cópia mais recente que tenha fora do servidor:
   copie o ficheiro para a pasta de backups (`BACKUP_DIR/platform/`) e corra
   `npm run tenants:central-restore -- <ficheiro>.dump`. Isto devolve os administradores da
   plataforma, as instituições, os planos e o registo das cópias.
3. Inicie o site, entre no painel e, para cada instituição, suba o ficheiro da sua cópia
   (**Instituição → Backups → Carregar cópia**) e restaure por lá.
4. Se só se perdeu uma instituição (não a central), basta o passo 3: subir e restaurar.

As cópias contêm todos os dados da instituição (incluindo haxixes de senhas, para os logins continuarem válidos). Guarde-as cifradas ou num local privado.

## Deploy num VPS (Docker)

1. Instale Docker e Docker Compose no servidor e aponte o domínio para o IP.
2. No `Caddyfile`, troque `noscrianca.exemplo.cv` pelo seu domínio.
3. Crie o `.env` a partir de `.env.example`. Defina `POSTGRES_PASSWORD`, `APP_SECRET` (32+ caracteres aleatórios), `SUPERADMIN_PASSWORD` e os dados SMTP. **Troque todas as palavras-passe de exemplo.**
4. Arranque os serviços:
   ```bash
   docker compose up -d --build
   docker compose logs -f app
   ```
5. Abra `https://<seu-domínio>/admin/entrar` com o Super Administrador e crie a primeira creche em **Instituições → Nova instituição**.

Dados persistentes: volumes `pgdata` (bases de dados), `storage` (ficheiros enviados) e `backups` (cópias de segurança). Inclua-os nas cópias de segurança do servidor.

## Segurança

- Palavras-passe com scrypt; sessões com tokens opacos guardados apenas como hash; cookies `httpOnly`, `sameSite=lax` e `secure` em HTTPS.
- Bloqueio temporário após 5 falhas de início de sessão.
- Convites válidos 72 horas e de uso único; redefinição de palavra-passe válida 1 hora.
- Âmbito de dados: encarregados vêem apenas os próprios filhos; funcionários vêem apenas as turmas atribuídas.
- Fotografias das crianças só aparecem aos encarregados e no diário quando há autorização registada.
- Acções sensíveis (faturas, pagamentos, cargos, acessos) ficam registadas na auditoria da instituição.
