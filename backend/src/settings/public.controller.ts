import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DealersService } from '../dealers/dealers.service';
import { SettingsService } from './settings.service';

@Controller('api/public')
export class PublicController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly dealersService: DealersService
  ) {}

  @Public()
  @Get('home')
  getHome() {
    return this.settingsService.getHomePagePublic();
  }

  @Public()
  @Post('contact')
  submitContact(@Body() body: any) {
    return this.settingsService.submitContact(body);
  }

  @Public()
  @Post('dealer-registration')
  submitDealerRegistration(@Body() body: any) {
    return this.dealersService.submitRegistrationRequest(body);
  }
}
