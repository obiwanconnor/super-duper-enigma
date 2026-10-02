-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('INCIDENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "noticeId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orgAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceNotice" (
    "id" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "status" "NoticeStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "_ProductToServiceNotice" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductToServiceNotice_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ServiceNotice_status_idx" ON "ServiceNotice"("status");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE INDEX "_ProductToServiceNotice_B_index" ON "_ProductToServiceNotice"("B");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ServiceNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotice" ADD CONSTRAINT "ServiceNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToServiceNotice" ADD CONSTRAINT "_ProductToServiceNotice_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToServiceNotice" ADD CONSTRAINT "_ProductToServiceNotice_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
