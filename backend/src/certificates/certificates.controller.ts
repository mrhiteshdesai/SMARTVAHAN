import { Controller, Post, Body, BadRequestException, UseGuards, Req, Get, Query, ForbiddenException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';

@Controller('api/certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('validate-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'DEALER_USER')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'DEALER_USER')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'OEM_ADMIN', 'SUB_ADMIN')
  async searchQr(
    @Query('state') state: string,
    @Query('oem') oem: string,
    @Query('serial') serial: string,
    @Req() req: any
  ) {
    const user = req.user;
    if (user.role === 'OEM_ADMIN' && oem !== user.oemCode) {
         throw new ForbiddenException('You can only search your own OEM.');
    }

    const baseUrl = req.get('origin') || process.env.BASE_URL || 'https://smartvahan.com';
    return this.certificatesService.searchQrBySerial({ state, oem, serial, baseUrl });
  }

  @Get('search-cert')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'OEM_ADMIN', 'SUB_ADMIN', 'GHOST_ADMIN')
  async searchCertificate(
    @Query('state') state: string,
    @Query('oem') oem: string,
    @Query('by') by: 'QR_SERIAL' | 'VEHICLE' | 'CERTIFICATE',
    @Query('serial') serial?: string,
    @Query('registrationRto') registrationRto?: string,
    @Query('series') series?: string,
    @Query('certificateNumber') certificateNumber?: string,
    @Req() req?: any
  ) {
    const user = req?.user;
    if (user && user.role === 'OEM_ADMIN' && oem !== user.oemCode) {
        throw new ForbiddenException('You can only search your own OEM.');
    }

    // Ghost Mode check
    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (isGhost && user.role !== 'SUPER_ADMIN' && user.role !== 'GHOST_ADMIN') {
        throw new ForbiddenException('Ghost Mode is restricted to Super Admin');
    }

    return this.certificatesService.searchCertificate({
      state,
      oem,
      by,
      serial,
      registrationRto,
      series,
      certificateNumber,
      isGhost
    });
  }

  @Get('download-list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STATE_ADMIN', 'OEM_ADMIN', 'DEALER_USER', 'GHOST_ADMIN')
  async downloadList(
    @Query('state') state?: string,
    @Query('oem') oem?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Req() req?: any
  ) {
    const user = req?.user;
    let finalState = state;
    let finalOem = oem;

    if (user.role === 'STATE_ADMIN') finalState = user.stateCode;
    if (user.role === 'OEM_ADMIN') finalOem = user.oemCode;
    if (user.role === 'DEALER_USER') finalState = user.stateCode; // Dealer restricted to State? Or Dealer specific list?
    
    // For Dealer, certificatesService.listCertificatesForDownload likely checks user.role and filters by dealerId if needed.
    // The service method accepts `user`.

    const isGhost = req.headers['x-ghost-mode'] === 'true';
    if (isGhost && user.role !== 'SUPER_ADMIN' && user.role !== 'GHOST_ADMIN') {
         throw new ForbiddenException('Ghost Mode is restricted to Super Admin');
    }
    
    return this.certificatesService.listCertificatesForDownload({ state: finalState, oem: finalOem, from, to, user, isGhost });
  }
}
