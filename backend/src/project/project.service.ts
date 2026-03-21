import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddMemberDto,
  QueryProjectDto,
} from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          createdBy: userId,
          status: 'ACTIVE',
        },
      });

      // Auto-add creator as OWNER
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          role: 'OWNER',
        },
      });

      return project;
    });
  }

  async findAll(query: QueryProjectDto, userId: string) {
    const { page = 1, pageSize = 20, search, status } = query;

    const where: Prisma.ProjectWhereInput = {
      members: { some: { userId } },
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { id: true, name: true } },
          _count: { select: { applications: true, members: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { applications: true } },
      },
    });
    if (!project) throw new NotFoundException(`项目 ${id} 不存在`);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, userId: string) {
    await this.checkMemberRole(id, userId, ['OWNER']);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async archive(id: string, userId: string) {
    await this.checkMemberRole(id, userId, ['OWNER']);
    return this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async addMember(projectId: string, dto: AddMemberDto, userId: string) {
    await this.checkMemberRole(projectId, userId, ['OWNER']);
    return this.prisma.projectMember.create({
      data: {
        projectId,
        userId: dto.userId,
        role: dto.role,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    userId: string,
  ) {
    await this.checkMemberRole(projectId, userId, ['OWNER']);
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: targetUserId },
    });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.role === 'OWNER') {
      throw new ForbiddenException('不能移除项目所有者');
    }
    return this.prisma.projectMember.delete({ where: { id: member.id } });
  }

  private async checkMemberRole(
    projectId: string,
    userId: string,
    allowedRoles: string[],
  ) {
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('权限不足');
    }
  }
}
