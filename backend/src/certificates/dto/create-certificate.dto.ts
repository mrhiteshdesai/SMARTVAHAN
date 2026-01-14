import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateCertificateDto {
  @IsString()
  @IsNotEmpty()
  qrValue: string;

  @IsObject()
  @IsNotEmpty()
  vehicleDetails: any;

  @IsObject()
  @IsNotEmpty()
  ownerDetails: any;

  @IsObject()
  @IsNotEmpty()
  photos: any;

  @IsString()
  @IsOptional()
  locationText?: string;

  @IsString()
  @IsOptional()
  qrCodeImage?: string;

  @IsString()
  @IsOptional()
  systemLogo?: string;

  @IsString()
  @IsOptional()
  systemName?: string;

  @IsObject()
  @IsOptional()
  dealerDetails?: {
    name?: string;
    tradeCertificateNo?: string;
    gstNo?: string;
    tradeValidity?: string;
  };
}
