import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus, Ip } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

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
}
