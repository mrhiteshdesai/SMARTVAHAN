import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req } from '@nestjs/common';
import { RtosService } from './rtos.service';
import { PrismaService } from '../prisma.service';

@Controller('api/rtos')
export class RtosController {
  constructor(
    private readonly rtosService: RtosService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  create(@Body() createRtoDto: any) {
    return this.rtosService.create(createRtoDto);
  }

  @Get()
  async findAll(@Req() req: any, @Query('stateCode') stateCode?: string) {
    const user = req.user;

    if (user && (user.role === 'DEALER_USER' || user.role === 'DEALER')) {
      const dealer = await this.prisma.dealer.findUnique({
        where: { id: user.userId },
        select: { stateCode: true, passingRtosAll: true, passingRtoCodes: true }
      });

      if (!dealer) {
        return [];
      }

      const effectiveStateCode = stateCode || dealer.stateCode;
      const rtos = await this.rtosService.findAll(effectiveStateCode);

      if (dealer.passingRtosAll) {
        return rtos;
      }

      const allowed = new Set((dealer.passingRtoCodes || []).map((c) => String(c)));
      return rtos.filter((r) => allowed.has(r.code));
    }

    return this.rtosService.findAll(stateCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rtosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRtoDto: any) {
    return this.rtosService.update(id, updateRtoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rtosService.remove(id);
  }
}
