import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateRegulatoryActivityDto } from './dto';

@Injectable()
export class RegulatoryActivityService {
  constructor(
    private prisma: PrismaService,
    private cvService: ControlledVocabularyService,
  ) {}

  async create(applicationId: string, dto: CreateRegulatoryActivityDto) {
    // Validate application exists
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      throw new NotFoundException(`申请 ${applicationId} 不存在`);
    }

    // Validate dependency: is this RAT allowed for this application type?
    const isValid = await this.cvService.validateDependency(
      application.applicationTypeCode,
      dto.regulatoryActivityTypeCode,
    );
    if (!isValid) {
      throw new BadRequestException(
        `申请类型 ${application.applicationTypeCode} 不支持注册行为类型 ${dto.regulatoryActivityTypeCode}`,
      );
    }

    // Get CV version
    const ratVersion = await this.cvService.getCvVersion(
      'regulatory-activity-type',
      dto.regulatoryActivityTypeCode,
    );

    // Determine related-sequence: the global sequence number this RA will
    // start at, i.e. (max sequenceNumber in the application) + 1. For a brand
    // new application it's 0000.
    const lastSequence = await this.prisma.sequence.findFirst({
      where: {
        regulatoryActivity: { applicationId },
      },
      orderBy: { sequenceNumber: 'desc' },
    });
    const nextNum = lastSequence ? parseInt(lastSequence.sequenceNumber) + 1 : 0;
    const relatedSequence = nextNum.toString().padStart(4, '0');

    return this.prisma.regulatoryActivity.create({
      data: {
        applicationId,
        regulatoryActivityTypeCode: dto.regulatoryActivityTypeCode,
        regulatoryActivityTypeVersion: ratVersion,
        relatedSequence,
      },
      include: { _count: { select: { sequences: true } } },
    });
  }

  async findAllByApplication(applicationId: string) {
    return this.prisma.regulatoryActivity.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { sequences: true } },
      },
    });
  }

  async findOne(id: string) {
    const ra = await this.prisma.regulatoryActivity.findUnique({
      where: { id },
      include: {
        application: {
          select: {
            id: true,
            applicationNumber: true,
            applicationTypeCode: true,
            productTypeCode: true,
          },
        },
        sequences: { orderBy: { sequenceNumber: 'asc' } },
      },
    });
    if (!ra) throw new NotFoundException(`注册行为 ${id} 不存在`);
    return ra;
  }
}
