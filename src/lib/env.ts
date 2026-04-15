const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export const AUTH_COOKIE_NAME = "rifa_auth";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const CORS_ORIGINS = (
  process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? DEFAULT_CORS_ORIGINS
);
