import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { AUTH_COOKIE_NAME, IS_PRODUCTION, JWT_SECRET } from "../lib/env";
import { prisma } from "../lib/prisma";
import { createRateLimit } from "../middlewares/rateLimit";

export const authRoutes = Router();

const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PRODUCTION,
  maxAge: 15 * 60 * 1000,
  path: "/",
};

authRoutes.use(
  createRateLimit({
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
    message: "Muitas tentativas de autenticacao. Tente novamente mais tarde.",
  })
);

authRoutes.post("/register", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true },
    });

    return res.status(201).json(user);
  } catch (err: any) {
    console.error("PRISMA REGISTER ERROR ↓↓↓");
    console.error(err);
    console.error("PRISMA REGISTER ERROR ↑↑↑");

    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Email ja cadastrado" });
    }

    return res.status(500).json({
      error: "Erro interno ao criar usuario",
    });
  }
});

authRoutes.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Credenciais invalidas" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciais invalidas" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: "15m",
  });

  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    },
  });
});

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
  return res.json({ ok: true });
});
