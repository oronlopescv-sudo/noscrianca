# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
# O servidor standalone não traz devDependencies (tsx) nem a pasta scripts/,
# mas as operações de manutenção (migrações manuais, cópias, restauro) têm de
# continuar possíveis DENTRO do container. A CLI fica num único ficheiro e
# DELIBERADAMENTE auto-contida — com TODAS as dependências dentro (drizzle-orm
# incluído): o node_modules do standalone só traz o que o Next marca como
# externo (pg, nodemailer) e não tem drizzle-orm, por isso a CLI não pode
# depender de require externas que lhe faltem; a única coisa que fica fora é
# pg-native (opcional do pg, nunca instalado e só tocado em modo nativo).
 && node_modules/.bin/esbuild scripts/tenants.ts --bundle --platform=node \
    --target=node22 --format=cjs --outfile=.next/ops.js

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# pg_dump / pg_restore para as cópias de segurança. O cliente 18 (mais novo)
# lê servidores 16 e 17: se o servidor em produção for um dia mais novo,
# bumpar este cliente também (nunca pode ficar PARA TRÁS do servidor).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN groupadd --system nc && useradd --system --gid nc --home /app nc \
 && mkdir -p /app/storage /app/backups && chown -R nc:nc /app
COPY --from=build --chown=nc:nc /app/.next/standalone ./
COPY --from=build --chown=nc:nc /app/.next/static ./.next/static
COPY --from=build --chown=nc:nc /app/public ./public
COPY --from=build --chown=nc:nc /app/drizzle ./drizzle
COPY --from=build --chown=nc:nc /app/.next/ops.js ./ops.js
COPY --from=build --chown=root:root /app/.next/BUILD_ID ./.next-BUILD_ID
# O service worker recebe o seu cache com o BUILD_ID este deploy: chunks velhos não se acumulam.
RUN sed -i "s/nc-static-dev/nc-static-$(cat .next-BUILD_ID)/" public/sw.js && rm .next-BUILD_ID
USER nc
VOLUME ["/app/storage", "/app/backups"]
EXPOSE 3000
# Liveness: o processo corre. /api/health/db (readiness) é que diz se a base de dados responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(Number(process.env.PORT)||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
