import { NextFunction, Request, Response } from "express";
import { DISABLE_RATE_LIMIT } from "../lib/env";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  message: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    if (DISABLE_RATE_LIMIT) {
      return next();
    }

    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({ error: options.message });
    }

    current.count += 1;
    buckets.set(key, current);
    return next();
  };
}
