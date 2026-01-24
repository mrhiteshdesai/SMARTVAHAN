import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus, Ip, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() signInDto: Record<string, any>, @Ip() ip: string) {
    const user = await this.authService.validateUser(signInDto.phone, signInDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }
    return this.authService.login(user, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
      return this.authService.getProfile(req.user.userId, req.user.role);
  }
}
