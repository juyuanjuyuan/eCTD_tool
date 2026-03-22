import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FileModule } from '../file/file.module';
import { EctdController } from './ectd.controller';
import { CnRegionalXmlService } from './services/cn-regional-xml.service';
import { IndexXmlService } from './services/index-xml.service';
import { StfService } from './services/stf.service';
import { LifecycleService } from './services/lifecycle.service';
import { ValidatorService } from './services/validator.service';
import { PackageAssemblerService } from './services/package-assembler.service';
import { Md5Service } from './services/md5.service';

@Module({
  imports: [PrismaModule, FileModule],
  controllers: [EctdController],
  providers: [
    CnRegionalXmlService,
    IndexXmlService,
    StfService,
    LifecycleService,
    ValidatorService,
    PackageAssemblerService,
    Md5Service,
  ],
  exports: [
    CnRegionalXmlService,
    IndexXmlService,
    StfService,
    LifecycleService,
    ValidatorService,
    PackageAssemblerService,
    Md5Service,
  ],
})
export class EctdModule {}
