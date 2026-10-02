-- CreateTable
CREATE TABLE "MonthlyReportRun" (
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyReportRun_pkey" PRIMARY KEY ("organizationId","month")
);
