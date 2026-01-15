import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { authRoutes } from "./routes/auth.routes";
import { rafflesRoutes } from "./routes/raffles.routes";
import { ordersRoutes } from "./routes/orders.routes";
import { startExpirePendingOrdersJob } from "./jobs/expirePendingOrders";
import { meRoutes } from "./routes/me.routes";
import { myOrdersRoutes } from "./routes/myOrders.routes";
import { adminRafflesRoutes } from "./routes/adminRaffles.routes";
import { adminOrdersRoutes } from "./routes/adminOrders.routes";
import { adminDrawRoutes } from "./routes/adminDraw.routes";
import { raffleWinnerRoutes } from "./routes/raffleWinner.routes";
import { adminRaffleStatsRoutes } from "./routes/adminRaffleStats.routes";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/raffles", rafflesRoutes);
app.use("/orders", ordersRoutes);
app.use("/me", meRoutes);
app.use("/my-orders", myOrdersRoutes);
app.use("/admin/raffles", adminRafflesRoutes);
app.use("/admin/orders", adminOrdersRoutes);
app.use("/admin", adminDrawRoutes);
app.use("/", raffleWinnerRoutes);
app.use("/admin", adminRaffleStatsRoutes);

app.listen(3001, () => {
  console.log("Servidor rodando em http://localhost:3001");
});

startExpirePendingOrdersJob();
