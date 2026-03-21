import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto, QueryUserDto } from './dto';
export declare class UserService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(query: QueryUserDto): Promise<{
        items: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
            role: import("@prisma/client").$Enums.Role;
            status: import("@prisma/client").$Enums.UserStatus;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        name: string;
        email: string;
        phone: string | null;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.UserStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, dto: UpdateUserDto): Promise<{
        id: string;
        name: string;
        email: string;
        phone: string | null;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.UserStatus;
    }>;
    disable(id: string): Promise<{
        id: string;
        name: string;
        email: string;
        status: import("@prisma/client").$Enums.UserStatus;
    }>;
}
