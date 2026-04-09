import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateApplicationDto } from './dto';
import { APPLICATION_NUMBER_REGEX } from './dto/create-application.dto';

@Injectable()
export class ApplicationService {
  constructor(
    private prisma: PrismaService,
    private cvService: ControlledVocabularyService,
  ) {}

  async create(projectId: string, dto: CreateApplicationDto) {
    // Validate project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException(`项目 ${projectId} 不存在`);

    // Get CV versions
    const appTypeVersion = await this.cvService.getCvVersion(
      'application-type',
      dto.applicationTypeCode,
    );
    const productTypeVersion = await this.cvService.getCvVersion(
      'product-type',
      dto.productTypeCode,
    );

    // Determine application number: accept caller-supplied or auto-generate
    const applicationNumber =
      dto.applicationNumber ??
      this.generateApplicationNumber(
        dto.applicationTypeCode,
        dto.productTypeCode,
      );

    // Defense-in-depth: enforce NMPA V1.1 format at the service layer as well.
    // This guards against callers that bypass the DTO validation pipe
    // (e.g. internal service-to-service calls) and against generator bugs.
    if (!APPLICATION_NUMBER_REGEX.test(applicationNumber)) {
      throw new BadRequestException(
        `申请编号格式错误: "${applicationNumber}" 不符合 NMPA V1.1 规范 ` +
          `(字母 x/y/l/s + 4位年份 + 5位流水号，共10个字符)`,
      );
    }

    // Check uniqueness
    const existing = await this.prisma.application.findUnique({
      where: { applicationNumber },
    });
    if (existing) {
      throw new BadRequestException('申请编号已存在，请重试');
    }

    return this.prisma.application.create({
      data: {
        projectId,
        applicationNumber,
        applicationTypeCode: dto.applicationTypeCode,
        applicationTypeVersion: appTypeVersion,
        productTypeCode: dto.productTypeCode,
        productTypeVersion: productTypeVersion,
        productNumber: dto.productNumber,
      },
    });
  }

  async findAllByProject(projectId: string) {
    return this.prisma.application.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { regulatoryActivities: true } },
      },
    });
  }

  async findOne(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        regulatoryActivities: {
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { sequences: true } } },
        },
      },
    });
    if (!app) throw new NotFoundException(`申请 ${id} 不存在`);
    return app;
  }

  async remove(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: { _count: { select: { regulatoryActivities: true } } },
    });
    if (!app) throw new NotFoundException(`申请 ${id} 不存在`);
    if (app._count.regulatoryActivities > 0) {
      throw new ForbiddenException('申请下存在注册行为，无法删除');
    }
    return this.prisma.application.delete({ where: { id } });
  }

  /**
   * Generate application number based on rules:
   * - prefix: x=chemical(clinical/NDA/ANDA), y=biological, l=imported, s=API
   * - format: prefix + 4-digit year + 5-digit serial
   */
  private generateApplicationNumber(
    appTypeCode: string,
    productTypeCode: string,
  ): string {
    let prefix: string;

    if (appTypeCode === 'cnapt4') {
      // 原料药
      prefix = 's';
    } else if (productTypeCode === 'cnprt2') {
      // 生物制品
      prefix = 'y';
    } else {
      // 化学药品 (临床/新药/仿制药)
      prefix = 'x';
    }

    const year = new Date().getFullYear().toString();
    const serial = Math.floor(10000 + Math.random() * 90000).toString();

    return `${prefix}${year}${serial}`;
  }
}
