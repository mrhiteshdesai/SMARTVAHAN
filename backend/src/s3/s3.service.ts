import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  constructor(private prisma: PrismaService) {}

  async uploadFile(filePath: string, key: string, contentType: string = 'application/pdf'): Promise<string | null> {
    try {
      const settings = await this.prisma.systemSettings.findUnique({
        where: { id: 'SYSTEM_SETTINGS' }
      });

      if (!settings || !settings.awsAccessKey || !settings.awsSecretKey || !settings.awsBucket || !settings.awsRegion) {
        this.logger.warn('AWS S3 settings not configured. Skipping upload.');
        return null;
      }

      const s3Client = new S3Client({
        region: settings.awsRegion,
        credentials: {
          accessKeyId: settings.awsAccessKey,
          secretAccessKey: settings.awsSecretKey
        }
      });

      const fileContent = fs.readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: settings.awsBucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        // ACL: 'public-read' // Optional: depends on bucket policy. 
      });

      await s3Client.send(command);

      // Construct URL
      // Virtual-hosted-style access
      const url = `https://${settings.awsBucket}.s3.${settings.awsRegion}.amazonaws.com/${key}`;
      this.logger.log(`File uploaded to S3: ${url}`);
      
      return url;
    } catch (error) {
      this.logger.error('S3 Upload Failed:', error);
      return null;
    }
  }
}
