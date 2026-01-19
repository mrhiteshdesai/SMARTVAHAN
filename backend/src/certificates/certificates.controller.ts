import { Controller, Post, Body, BadRequestException, UseGuards, Req, Get, Query } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';

@Controller('api/certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('validate-qr')
  @UseGuards(JwtAuthGuard)
  async validateQr(@Body() body: any, @Req() req: any) {
    const { qrContent, qrValue } = body;
    if (!qrContent && !qrValue) {
      throw new BadRequestException('QR content is required (provide qrContent or qrValue)');
    }
    if (qrContent) {
      return this.certificatesService.validateQr(qrContent, req.user);
    }
    return this.certificatesService.validateQrByValue(qrValue, req.user);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createCertificate(@Body() body: CreateCertificateDto, @Req() req: any) {
    // Inject dealerId if the user is a dealer
    if (req.user && (req.user.role === 'DEALER' || req.user.role === 'DEALER_USER')) {
      (body as any).dealerId = req.user.userId;
    }
    return this.certificatesService.createCertificate(body);
  }

  @Get('public-verify')
  @Public()
  async publicVerify(
    @Query('url') url?: string,
    @Query('state') state?: string,
    @Query('oem') oem?: string,
    @Query('product') product?: string,
    @Query('value') value?: string
  ) {
    return this.certificatesService.publicVerify({ url, state, oem, product, value });
  }

  @Get('search-qr')
  @UseGuards(JwtAuthGuard)
  async searchQr(
    @Query('state') state: string,
    @Query('oem') oem: string,
    @Query('serial') serial: string,
    @Req() req: any
  ) {
    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.certificatesService.searchQrBySerial({ state, oem, serial, baseUrl });
  }

  @Get('search-cert')
  @UseGuards(JwtAuthGuard)
  async searchCertificate(
    @Query('state') state: string,
    @Query('oem') oem: string,
    @Query('by') by: 'QR_SERIAL' | 'VEHICLE' | 'CERTIFICATE',
    @Query('serial') serial?: string,
    @Query('registrationRto') registrationRto?: string,
    @Query('series') series?: string,
    @Query('certificateNumber') certificateNumber?: string
  ) {
    return this.certificatesService.searchCertificate({
      state,
      oem,
      by,
      serial,
      registrationRto,
      series,
      certificateNumber
    });
  }

  @Get('download-list')
  @UseGuards(JwtAuthGuard)
  async downloadList(
    @Query('state') state?: string,
    @Query('oem') oem?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Req() req?: any
  ) {
    return this.certificatesService.listCertificatesForDownload({ state, oem, from, to, user: req?.user });
  }
}
