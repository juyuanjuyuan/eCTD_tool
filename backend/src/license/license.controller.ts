import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LicenseService } from './license.service';
import { ActivateLicenseDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from './public.decorator';

@ApiTags('license')
@Controller('api/v1/license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /**
   * Public: the activation page must be reachable before login,
   * since an unactivated machine has no useful business state to log in to.
   */
  @Public()
  @Get('status')
  status() {
    return this.licenseService.getStatus();
  }

  @Public()
  @UseGuards(JwtAuthGuard)
  @Post('activate')
  async activate(@Body() dto: ActivateLicenseDto, @CurrentUser('id') userId?: string) {
    return this.licenseService.activate(dto.code, userId);
  }
}
