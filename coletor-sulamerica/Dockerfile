# Coletor SulAmérica — serviço separado do app (nada compartilhado com outros
# projetos). A imagem oficial do Playwright já traz o Chromium e as
# dependências de sistema; a versão precisa ser a mesma do pacote npm.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

# Roda como o usuário sem privilégios que a imagem do Playwright já cria.
USER pwuser
CMD ["node", "src/index.mjs"]
