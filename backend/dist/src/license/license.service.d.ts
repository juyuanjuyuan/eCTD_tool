import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export interface LicensePayload {
    customer: string;
    machineId: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
}
export interface LicenseVerifyResult {
    valid: boolean;
    reason?: 'malformed' | 'bad-signature' | 'fingerprint-mismatch' | 'expired' | 'not-yet-valid';
    payload?: LicensePayload;
}
export interface LicenseStatus {
    activated: boolean;
    enforced: boolean;
    machineId: string;
    license?: {
        customer: string;
        issuedAt: string;
        expiresAt: string;
        daysRemaining: number;
        valid: boolean;
        reason?: LicenseVerifyResult['reason'];
    };
}
export declare class LicenseService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    private cachedMachineId;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    isEnforced(): boolean;
    getMachineId(): string;
    private collectFingerprint;
    verifyLicenseString(code: string, machineIdOverride?: string): LicenseVerifyResult;
    activate(code: string, userId?: string): Promise<LicenseStatus>;
    getStatus(): Promise<LicenseStatus>;
    isAccessAllowed(): Promise<boolean>;
    private todayUTC;
    private formatDate;
    private daysUntil;
    private tryGetMachineId;
    private reasonToMessage;
}
