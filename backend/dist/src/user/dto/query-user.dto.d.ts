import { Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryUserDto extends PaginationDto {
    search?: string;
    role?: Role;
}
