-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "videoUrl" TEXT;
