import { ProjectStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class QueryProjectDto extends PaginationDto {
    search?: string;
    status?: ProjectStatus;
}
