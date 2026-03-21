# Prisma ORM 数据库操作规范

## 1. Schema 编写规范

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String
  phone        String?
  role         Role     @default(EDITOR)
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Relations
  projects     ProjectMember[]
  documents    Document[]

  @@map("user")
}

enum Role {
  ADMIN
  MANAGER
  EDITOR
  VIEWER
}

enum UserStatus {
  ACTIVE
  DISABLED
}
```

### Schema 约定

- 使用 `@map()` 将 camelCase 字段映射为 snake_case 数据库列名
- 使用 `@@map()` 将 PascalCase 模型映射为 snake_case 表名
- 主键统一使用 UUID: `@id @default(uuid())`
- 时间字段: `createdAt @default(now())`, `updatedAt @updatedAt`
- 枚举使用 Prisma enum，在 Schema 中定义
- 关系字段使用显式 FK 字段 + @relation

## 2. 迁移操作

```bash
# 创建迁移（开发环境）
npx prisma migrate dev --name add_document_table

# 重置数据库（开发环境，丢失数据）
npx prisma migrate reset

# 生产环境迁移
npx prisma migrate deploy

# 生成 Prisma Client
npx prisma generate

# 可视化数据库
npx prisma studio
```

## 3. PrismaService

```typescript
// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

## 4. 事务操作

```typescript
// 交互式事务（推荐用于多步操作）
async createSequenceWithNodes(dto: CreateSequenceDto) {
  return this.prisma.$transaction(async (tx) => {
    // 1. 创建序列
    const sequence = await tx.sequence.create({
      data: { ... },
    });

    // 2. 从模板创建 CTD 目录节点
    const templateNodes = await tx.ctdTemplateNode.findMany({
      where: { applicableAppTypes: { has: dto.applicationType } },
    });

    await tx.sequenceNode.createMany({
      data: templateNodes.map(node => ({
        sequenceId: sequence.id,
        templateNodeId: node.id,
        title: node.titleCn,
        sortOrder: node.sortOrder,
        operation: 'new',
        status: 'EMPTY',
      })),
    });

    return sequence;
  });
}
```

## 5. 分页查询

```typescript
async findAll(query: QueryDto) {
  const { page = 1, pageSize = 20, search, ...filters } = query;

  const where = {
    ...filters,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    this.prisma.xxx.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { /* relations */ },
    }),
    this.prisma.xxx.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
```

## 6. 种子数据

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 创建管理员
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      name: '管理员',
      role: 'ADMIN',
    },
  });

  // 导入 CTD 模板节点
  // ... (从 JSON 文件批量导入)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

在 `package.json` 中配置:
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

## 7. JSON 字段操作 (PostgreSQL JSONB)

```typescript
// 写入 JSON
await prisma.document.create({
  data: {
    contentJson: { type: 'doc', content: [...] },  // Prisma 自动处理 JSON
  },
});

// 查询 JSON 字段
await prisma.ctdTemplateNode.findMany({
  where: {
    applicableAppTypes: {
      has: 'CLINICAL_TRIAL',  // JSONB 数组包含查询
    },
  },
});
```
