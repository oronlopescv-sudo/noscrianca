import "../scripts/_env";

// Chave de teste por omissão (só para testes; em produção vem do .env / ambiente).
if (!process.env.APP_SECRET) {
  process.env.APP_SECRET = "teste-apenas-chave-com-mais-de-32-caracteres";
}
