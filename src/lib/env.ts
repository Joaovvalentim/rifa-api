const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export const AUTH_COOKIE_NAME = "rifa_auth";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const APP_WEB_URL =
  process.env.APP_WEB_URL?.trim() || "http://localhost:5173";
export const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL?.trim() || "http://localhost:3001";
export const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET?.trim() || "";
export const PAYMENT_DEBUG_LOGS =
  process.env.PAYMENT_DEBUG_LOGS?.trim().toLowerCase() === "true";
export const DISABLE_RATE_LIMIT =
  process.env.DISABLE_RATE_LIMIT?.trim().toLowerCase() === "true";
export const PAYMENT_PROVIDER_MODE =
  process.env.PAYMENT_PROVIDER_MODE?.trim().toLowerCase() === "mock"
    ? "mock"
    : "mercado_pago";

if (IS_PRODUCTION && JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET deve ter pelo menos 32 caracteres em producao");
}

if (IS_PRODUCTION && !MP_WEBHOOK_SECRET) {
  throw new Error("MP_WEBHOOK_SECRET e obrigatorio em producao");
}

if (IS_PRODUCTION && DISABLE_RATE_LIMIT) {
  throw new Error("DISABLE_RATE_LIMIT nao pode ser true em producao");
}

if (IS_PRODUCTION && PAYMENT_PROVIDER_MODE === "mock") {
  throw new Error("PAYMENT_PROVIDER_MODE=mock nao pode ser usado em producao");
}
const rawPixExpirationMinutes =
  Number.parseInt(process.env.PIX_EXPIRATION_MINUTES?.trim() || "15", 10) || 15;

export const PIX_EXPIRATION_MINUTES = Math.min(
  15,
  Math.max(1, rawPixExpirationMinutes)
);

const configuredCorsOrigins =
  process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export const CORS_ORIGINS =
  configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : IS_PRODUCTION
      ? []
      : DEFAULT_CORS_ORIGINS;
