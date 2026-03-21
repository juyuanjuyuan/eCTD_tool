import { Role, UserStatus } from '@prisma/client';
export declare class UpdateUserDto {
    name?: string;
    phone?: string;
    role?: Role;
    status?: UserStatus;
}
