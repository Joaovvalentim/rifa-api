import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao definida para o seed.");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const userPasswordHash = await bcrypt.hash("cliente123", 10);

  await prisma.user.upsert({
    where: { email: "admin@rifa.local" },
    update: {
      name: "Administrador",
      passwordHash: adminPasswordHash,
      isAdmin: true,
    },
    create: {
      name: "Administrador",
      email: "admin@rifa.local",
      passwordHash: adminPasswordHash,
      isAdmin: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "cliente@rifa.local" },
    update: {
      name: "Cliente Demo",
      passwordHash: userPasswordHash,
      isAdmin: false,
    },
    create: {
      name: "Cliente Demo",
      email: "cliente@rifa.local",
      passwordHash: userPasswordHash,
      isAdmin: false,
    },
  });

  const raffles = [
    {
      title: "Mustang GT 5.0 Premium",
      description:
        "Rifa demo com carro destaque para validar a vitrine publica e o fluxo da home.",
      minNumber: 1,
      maxNumber: 5000,
      pricePerNumber: 25,
      status: "active",
      imageUrl:
        "https://images.unsplash.com/photo-1494976688153-c4f5d94fdf8f?auto=format&fit=crop&w=1600&q=80",
      images: [
        "https://images.unsplash.com/photo-1494976688153-c4f5d94fdf8f?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80",
      ],
    },
    {
      title: "Jetta GLI Stage 2",
      description:
        "Rifa ativa secundaria para testar listagem, detalhe publico e cards do marketplace.",
      minNumber: 1,
      maxNumber: 3500,
      pricePerNumber: 18,
      status: "active",
      imageUrl:
        "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=1600&q=80",
      images: [
        "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=1600&q=80",
      ],
    },
    {
      title: "Opala SS Restaurado",
      description:
        "Rifa finalizada para validar filtros por status e exibicao de campanhas encerradas.",
      minNumber: 1,
      maxNumber: 2000,
      pricePerNumber: 15,
      status: "finished",
      imageUrl:
        "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1600&q=80",
      images: [
        "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1600&q=80",
      ],
    },
  ] as const;

  for (const raffle of raffles) {
    const existingRaffle = await prisma.raffle.findFirst({
      where: { title: raffle.title },
      select: { id: true },
    });

    if (existingRaffle) {
      await prisma.raffle.update({
        where: { id: existingRaffle.id },
        data: raffle,
      });
      continue;
    }

    await prisma.raffle.create({
      data: raffle,
    });
  }

  console.log("Seed concluido com usuarios e rifas de exemplo.");
  console.log("Admin: admin@rifa.local / admin123");
  console.log("Cliente: cliente@rifa.local / cliente123");
}

main()
  .catch((error) => {
    console.error("Erro ao executar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
