import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE_NAME, JWT_SECRET } from "../lib/env";

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

function getTokenFromRequest(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.replace("Bearer ", "");
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME];
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: "Token nao informado" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
    };

    (req as Request & { userId?: string }).userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Token invalido" });
  }
}
