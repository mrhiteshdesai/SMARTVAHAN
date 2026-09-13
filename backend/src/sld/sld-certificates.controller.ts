import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { SldCertKind, SldCertStatus, UserRole } from '@prisma/client';
import { SldCertificatesService } from './sld-certificates.service';
import { SettingsService } from '../settings/settings.service';

@Controller('api/sld')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SldCertificatesController {
  constructor(
    private readonly sldCertificatesService: SldCertificatesService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('public-verify')
  @Public()
  publicVerify(@Query('certificateNumber') certificateNumber: string) {
    return this.sldCertificatesService.publicVerify(certificateNumber);
  }

  @Get('dealer/bootstrap')
  @Roles(UserRole.DEALER_USER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  bootstrap(@Req() req: any, @Query('dealerId') dealerId?: string) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    const id = isDealer ? req.user.userId : dealerId;
    return this.sldCertificatesService.getDealerBootstrap(id, req.user?.role);
  }

  @Get('dealer/serials')
  @Roles(UserRole.DEALER_USER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  serials(
    @Req() req: any,
    @Query('sldOemId') sldOemId: string,
    @Query('modelId') modelId: string,
    @Query('dealerId') dealerId?: string,
  ) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    const id = isDealer ? req.user.userId : dealerId;
    return this.sldCertificatesService.listAssignedSerials(
      id,
      sldOemId,
      modelId,
      req.user?.role,
    );
  }

  @Get('dealer/prior-certificate')
  @Roles(UserRole.DEALER_USER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  priorCertificate(
    @Query('sldOemId') sldOemId: string,
    @Query('serialNumber') serialNumber: string,
  ) {
    return this.sldCertificatesService.lookupPriorCertificate(sldOemId, serialNumber);
  }

  @Get('dealer/certificates')
  @Roles(UserRole.DEALER_USER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  history(
    @Req() req: any,
    @Query('dealerId') dealerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const isDealer = req.user?.role === 'DEALER_USER' || req.user?.role === 'DEALER';
    const isFullAdmin =
      req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const id = isDealer ? req.user.userId : dealerId;
    return this.sldCertificatesService.listDealerHistory(id, from, to, isFullAdmin);
  }

  @Get('certificates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STATE_ADMIN)
  listAdmin(
    @Req() req: any,
    @Query('status') status?: SldCertStatus,
    @Query('kind') kind?: SldCertKind,
    @Query('sldOemId') sldOemId?: string,
    @Query('dealerId') dealerId?: string,
    @Query('stateCode') stateCode?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    let finalStateCode = stateCode;
    if (req.user?.role === 'STATE_ADMIN') finalStateCode = req.user.stateCode;
    return this.sldCertificatesService.listAdminCertificates({
      status,
      kind,
      sldOemId,
      dealerId,
      stateCode: finalStateCode,
      search,
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Post('certificates/reinstate-bulk')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  reinstateBulk(@Body() body: { csvText: string }, @Req() req: any) {
    return this.sldCertificatesService.reinstateBulk(body.csvText, req.user.userId);
  }

  @Post('certificates/:id/vahan')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  uploadVahan(
    @Param('id') id: string,
    @Body() body: { pdfBase64: string },
    @Req() req: any,
  ) {
    return this.sldCertificatesService.uploadVahanPdf(id, body.pdfBase64, req.user.userId);
  }

  @Post('certificates/:id/reinstate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  reinstate(@Param('id') id: string, @Req() req: any) {
    return this.sldCertificatesService.reinstateCertificate(id, req.user.userId);
  }

  @Post('certificates')
  @Roles(UserRole.DEALER_USER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async create(@Body() body: any, @Req() req: any) {
    await this.settingsService.enforceMobileAppVersion(req?.headers || {}, 'CERTIFICATE');
    return this.sldCertificatesService.createCertificate(body, req.user);
  }
}
