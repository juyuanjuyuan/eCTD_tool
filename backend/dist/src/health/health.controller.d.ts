import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
export declare class HealthController {
    private health;
    private prisma;
    constructor(health: HealthCheckService, prisma: PrismaService);
    check(): Promise<HealthCheckResult>;
}
