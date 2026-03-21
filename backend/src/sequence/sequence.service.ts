import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateSequenceDto, UpdateSequenceDto } from './dto';

@Injectable()
export class SequenceService {
  constructor(
    private prisma: PrismaService,
    private cvService: ControlledVocabularyService,
  ) {}

  async create(regulatoryActivityId: string, dto: CreateSequenceDto) {
    // Validate RA exists and get application context
    const ra = await this.prisma.regulatoryActivity.findUnique({
      where: { id: regulatoryActivityId },
      include: {
        application: {
          select: { applicationTypeCode: true },
        },
      },
    });
    if (!ra) {
      throw new NotFoundException(`注册行为 ${regulatoryActivityId} 不存在`);
    }

    // Validate dependency: is this sequence type allowed?
    const isValid = await this.cvService.validateDependency(
      ra.application.applicationTypeCode,
      ra.regulatoryActivityTypeCode,
      dto.sequenceTypeCode,
    );
    if (!isValid) {
      throw new BadRequestException(
        `当前申请类型和注册行为类型组合不支持序列类型 ${dto.sequenceTypeCode}`,
      );
    }

    // Get CV version
    const sqtVersion = await this.cvService.getCvVersion(
      'sequence-type',
      dto.sequenceTypeCode,
    );

    // Generate sequence number: auto-increment within RA, no gaps allowed
    const lastSeq = await this.prisma.sequence.findFirst({
      where: { regulatoryActivityId },
      orderBy: { sequenceNumber: 'desc' },
    });

    let nextNum: number;
    if (!lastSeq) {
      nextNum = 0;
    } else {
      nextNum = parseInt(lastSeq.sequenceNumber) + 1;
    }
    const sequenceNumber = nextNum.toString().padStart(4, '0');

    // Validate first sequence must be cnsqt1 (Original) if sequence number is 0000
    if (sequenceNumber === '0000' && dto.sequenceTypeCode !== 'cnsqt1') {
      throw new BadRequestException('首个序列的序列类型必须为 cnsqt1（首次提交）');
    }

    return this.prisma.sequence.create({
      data: {
        regulatoryActivityId,
        sequenceNumber,
        sequenceTypeCode: dto.sequenceTypeCode,
        sequenceTypeVersion: sqtVersion,
        description: dto.description,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
      },
    });
  }

  async findAllByRegulatoryActivity(regulatoryActivityId: string) {
    return this.prisma.sequence.findMany({
      where: { regulatoryActivityId },
      orderBy: { sequenceNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const seq = await this.prisma.sequence.findUnique({
      where: { id },
      include: {
        regulatoryActivity: {
          include: {
            application: {
              select: {
                id: true,
                applicationNumber: true,
                applicationTypeCode: true,
                productTypeCode: true,
                productNumber: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!seq) throw new NotFoundException(`序列 ${id} 不存在`);
    return seq;
  }

  async update(id: string, dto: UpdateSequenceDto) {
    const seq = await this.findOne(id);
    if (seq.status === 'SUBMITTED') {
      throw new ForbiddenException('已提交的序列不可修改');
    }
    return this.prisma.sequence.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const seq = await this.findOne(id);
    if (seq.status !== 'DRAFT') {
      throw new ForbiddenException('仅草稿状态的序列可以删除');
    }

    // Check no sequence after this one exists (prevent gap)
    const laterSeq = await this.prisma.sequence.findFirst({
      where: {
        regulatoryActivityId: seq.regulatoryActivityId,
        sequenceNumber: { gt: seq.sequenceNumber },
      },
    });
    if (laterSeq) {
      throw new ForbiddenException('存在后续序列，不能删除此序列（会导致序列号不连续）');
    }

    return this.prisma.sequence.delete({ where: { id } });
  }
}
