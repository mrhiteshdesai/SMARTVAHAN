import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [S3Service, PrismaService],
  exports: [S3Service],
})
export class S3Module {}
