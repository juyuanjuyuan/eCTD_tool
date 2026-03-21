# NestJS 后端开发规范

## 1. 模块模板

```typescript
// xxx.module.ts
import { Module } from '@nestjs/common';
import { XxxController } from './xxx.controller';
import { XxxService } from './xxx.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [XxxController],
  providers: [XxxService],
  exports: [XxxService],
})
export class XxxModule {}
```

## 2. Controller 模板

```typescript
// xxx.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { XxxService } from './xxx.service';
import { CreateXxxDto, UpdateXxxDto, QueryXxxDto } from './dto';

@Controller('api/v1/xxx')
@UseGuards(JwtAuthGuard, RolesGuard)
export class XxxController {
  constructor(private readonly xxxService: XxxService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  create(@Body() dto: CreateXxxDto) {
    return this.xxxService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryXxxDto) {
    return this.xxxService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.xxxService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EDITOR)
  update(@Param('id') id: string, @Body() dto: UpdateXxxDto) {
    return this.xxxService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.xxxService.remove(id);
  }
}
```

## 3. Service 模板

```typescript
// xxx.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateXxxDto, UpdateXxxDto, QueryXxxDto } from './dto';

@Injectable()
export class XxxService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateXxxDto) {
    return this.prisma.xxx.create({ data: dto });
  }

  async findAll(query: QueryXxxDto) {
    const { page = 1, pageSize = 20, ...filters } = query;
    const [items, total] = await Promise.all([
      this.prisma.xxx.findMany({
        where: filters,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.xxx.count({ where: filters }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const item = await this.prisma.xxx.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`资源 ${id} 不存在`);
    return item;
  }

  async update(id: string, dto: UpdateXxxDto) {
    await this.findOne(id); // 确保存在
    return this.prisma.xxx.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.xxx.delete({ where: { id } });
  }
}
```

## 4. DTO 模板

```typescript
// dto/create-xxx.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateXxxDto {
  @IsString()
  @IsNotEmpty({ message: '名称不能为空' })
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// dto/update-xxx.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateXxxDto } from './create-xxx.dto';

export class UpdateXxxDto extends PartialType(CreateXxxDto) {}

// dto/query-xxx.dto.ts
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryXxxDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
```

## 5. 统一响应拦截器

```typescript
// common/interceptors/transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => ({
        code: 200,
        data,
        message: 'success',
      })),
    );
  }
}
```

## 6. 全局异常过滤器

```typescript
// common/filters/all-exceptions.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException
      ? exception.getResponse()
      : '服务器内部错误';

    response.status(status).json({
      code: status,
      message: typeof message === 'string' ? message : (message as any).message,
      errors: typeof message === 'object' ? (message as any).errors : undefined,
    });
  }
}
```

## 7. JWT 认证守卫

```typescript
// common/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```
