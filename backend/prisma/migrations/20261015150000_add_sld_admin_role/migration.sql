-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SLD_ADMIN';

-- CreateTable (implicit M2M: A = SldOem, B = User — alphabetical by model name)
CREATE TABLE "_UserToSldOem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserToSldOem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserToSldOem_B_index" ON "_UserToSldOem"("B");

-- AddForeignKey
ALTER TABLE "_UserToSldOem" ADD CONSTRAINT "_UserToSldOem_A_fkey" FOREIGN KEY ("A") REFERENCES "sld_oems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToSldOem" ADD CONSTRAINT "_UserToSldOem_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
