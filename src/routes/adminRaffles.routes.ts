import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

export const adminRafflesRoutes = Router();

// tudo aqui exige JWT + admin
adminRafflesRoutes.use(auth, requireAdmin);

// listar todas (inclusive draft/finished)
adminRafflesRoutes.get("/", async (_req, res) => {
  const raffles = await prisma.raffle.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(raffles);
});

// criar rifa
adminRafflesRoutes.post("/", async (req, res) => {
  const schema = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    minNumber: z.number().int().min(1).optional(),
    maxNumber: z.number().int().min(1),
    pricePerNumber: z.number().int().min(1),
    status: z.enum(["draft", "active", "finished"]).optional(),
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    images: z.array(z.string().url()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;

  const raffle = await prisma.raffle.create({
    data: {
      title: data.title,
      description: data.description,
      minNumber: data.minNumber ?? 1,
      maxNumber: data.maxNumber,
      pricePerNumber: data.pricePerNumber,
      status: data.status ?? "draft",
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      images: data.images ?? (data.imageUrl ? [data.imageUrl] : []),
    },
  });

  res.status(201).json(raffle);
});

// editar rifa (MVP)
adminRafflesRoutes.patch("/:id", async (req, res) => {
  const schema = z.object({
    title: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    maxNumber: z.number().int().min(1).optional(),
    pricePerNumber: z.number().int().min(1).optional(),
    status: z.enum(["draft", "active", "finished"]).optional(),
    imageUrl: z.string().url().nullable().optional(),
    videoUrl: z.string().url().nullable().optional(),
    images: z.array(z.string().url()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const raffleId = req.params.id;

    // Busca o estado atual + se já tem winner
    const current = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { id: true, status: true, winner: { select: { id: true } } },
    });

    if (!current) return res.status(404).json({ error: "Rifa não encontrada" });

    const hasWinner = !!current.winner;

    // Se está tentando alterar status, aplica regras
    if (typeof parsed.data.status === "string") {
      const next = parsed.data.status;

      // ✅ REGRA A: Se já tem winner, nunca pode voltar pra active
      if (hasWinner && next === "active") {
        return res.status(400).json({
          error: "Rifa já foi sorteada e não pode voltar para active.",
        });
      }

      // ✅ REGRA B: Se já está finished, só aceita draft ou finished
      if (current.status === "finished" && next === "active") {
        return res.status(400).json({
          error: "Rifa finalizada não pode voltar para active.",
        });
      }

      // ✅ Opcional (mais forte): se tem winner, só permitir draft/finished
      if (hasWinner && next !== "draft" && next !== "finished") {
        return res.status(400).json({
          error: "Rifa sorteada só pode ficar em draft ou finished.",
        });
      }
    }

    const raffle = await prisma.raffle.update({
      where: { id: raffleId },
      data: parsed.data,
    });

    res.json(raffle);
  } catch {
    res.status(404).json({ error: "Rifa não encontrada" });
  }
});
