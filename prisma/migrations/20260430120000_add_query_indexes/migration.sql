-- Add indexes used by public listing, account history, admin filters and expiration job.
CREATE INDEX "Raffle_status_idx" ON "Raffle"("status");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_raffleId_idx" ON "Order"("raffleId");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
CREATE INDEX "Order_raffleId_status_idx" ON "Order"("raffleId", "status");
CREATE INDEX "OrderNumber_raffleId_status_idx" ON "OrderNumber"("raffleId", "status");
