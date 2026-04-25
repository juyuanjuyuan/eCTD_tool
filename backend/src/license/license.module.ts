import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './license.guard';

@Global()
@Module({
  controllers: [LicenseController],
  providers: [
    LicenseService,
    LicenseGuard,
    {
      provide: APP_GUARD,
      useClass: LicenseGuard,
    },
  ],
  exports: [LicenseService],
})
export class LicenseModule {}
