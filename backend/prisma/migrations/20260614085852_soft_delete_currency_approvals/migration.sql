-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "converted_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "original_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "original_currency" TEXT NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "left_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "import_approvals" (
    "id" TEXT NOT NULL,
    "anomaly_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "row_data" JSONB NOT NULL,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_approvals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "import_approvals" ADD CONSTRAINT "import_approvals_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "import_anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
