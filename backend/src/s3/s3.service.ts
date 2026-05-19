import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  constructor(private prisma: PrismaService) {}

  private async getClientAndBucket() {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { id: 'SYSTEM_SETTINGS' }
    });

    if (!settings || !settings.awsAccessKey || !settings.awsSecretKey || !settings.awsBucket || !settings.awsRegion) {
      return null;
    }

    const s3Client = new S3Client({
      region: settings.awsRegion,
      credentials: {
        accessKeyId: settings.awsAccessKey,
        secretAccessKey: settings.awsSecretKey
      }
    });

    return {
      s3Client,
      bucket: settings.awsBucket,
      region: settings.awsRegion
    };
  }

  async uploadFile(filePath: string, key: string, contentType: string = 'application/pdf'): Promise<string | null> {
    try {
      const client = await this.getClientAndBucket();
      if (!client) {
        this.logger.warn('AWS S3 settings not configured. Skipping upload.');
        return null;
      }

      const fileContent = fs.readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: client.bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        // ACL: 'public-read' // Optional: depends on bucket policy. 
      });

      await client.s3Client.send(command);

      // Construct URL
      // Virtual-hosted-style access
      const url = `https://${client.bucket}.s3.${client.region}.amazonaws.com/${key}`;
      this.logger.log(`File uploaded to S3: ${url}`);
      
      return url;
    } catch (error) {
      this.logger.error('S3 Upload Failed:', error);
      return null;
    }
  }

  async getObjectStream(key: string): Promise<{ body: NodeJS.ReadableStream; contentType?: string; contentLength?: number } | null> {
    try {
      const client = await this.getClientAndBucket();
      if (!client) {
        this.logger.warn('AWS S3 settings not configured. Cannot download object.');
        return null;
      }

      const result = await client.s3Client.send(
        new GetObjectCommand({
          Bucket: client.bucket,
          Key: key
        })
      );

      if (!result.Body) {
        return null;
      }

      return {
        body: result.Body as unknown as NodeJS.ReadableStream,
        contentType: result.ContentType,
        contentLength: typeof result.ContentLength === 'number' ? result.ContentLength : undefined
      };
    } catch (error) {
      this.logger.error('S3 Download Failed:', error);
      return null;
    }
  }
}
