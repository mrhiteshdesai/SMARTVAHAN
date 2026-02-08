-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_oemCode_fkey" FOREIGN KEY ("oemCode") REFERENCES "oems"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
