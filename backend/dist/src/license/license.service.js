"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LicenseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseService = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
const prisma_service_1 = require("../prisma/prisma.service");
const public_key_1 = require("./public-key");
let LicenseService = LicenseService_1 = class LicenseService {
    prisma;
    logger = new common_1.Logger(LicenseService_1.name);
    cachedMachineId = null;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        try {
            this.getMachineId();
        }
        catch (err) {
            this.logger.warn(`Machine fingerprint unavailable at boot: ${err?.message ?? err}`);
        }
    }
    isEnforced() {
        const flag = process.env.LICENSE_ENFORCE;
        if (flag === 'true')
            return true;
        if (flag === 'false')
            return false;
        return process.env.NODE_ENV === 'production';
    }
    getMachineId() {
        if (this.cachedMachineId)
            return this.cachedMachineId;
        const injected = process.env.MACHINE_ID || process.env.LICENSE_MACHINE_ID_OVERRIDE;
        if (injected && /^[a-f0-9]{16}$/i.test(injected)) {
            this.cachedMachineId = injected.toLowerCase();
            return this.cachedMachineId;
        }
        this.cachedMachineId = this.collectFingerprint();
        return this.cachedMachineId;
    }
    collectFingerprint() {
        const platform = process.platform;
        let cpu = '';
        let serial = '';
        let mac = '';
        try {
            if (platform === 'darwin') {
                cpu = (0, child_process_1.execSync)('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
                serial = (0, child_process_1.execSync)("ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '\"'", { encoding: 'utf8' }).trim();
                mac = (0, child_process_1.execSync)("ifconfig en0 | awk '/ether/ {print $2}'", { encoding: 'utf8' }).trim();
            }
            else if (platform === 'win32') {
                const cpuOut = (0, child_process_1.execSync)('wmic cpu get ProcessorId /value', { encoding: 'utf8' });
                cpu = (cpuOut.match(/ProcessorId=(.+)/) || [])[1]?.trim() || '';
                const boardOut = (0, child_process_1.execSync)('wmic baseboard get SerialNumber /value', { encoding: 'utf8' });
                serial = (boardOut.match(/SerialNumber=(.+)/) || [])[1]?.trim() || '';
                const macOut = (0, child_process_1.execSync)('getmac /fo csv /nh', { encoding: 'utf8' });
                mac = (macOut.split('\n')[0] || '').split(',')[0]?.replace(/"/g, '').trim() || '';
            }
            else {
                cpu = (0, child_process_1.execSync)('cat /proc/cpuinfo | grep "model name" | head -1', { encoding: 'utf8' }).trim();
                try {
                    serial = (0, child_process_1.execSync)('cat /sys/class/dmi/id/board_serial 2>/dev/null', { encoding: 'utf8' }).trim();
                }
                catch {
                    serial = 'linux-no-board-serial';
                }
                mac = (0, child_process_1.execSync)("ip link show | awk '/ether/ {print $2; exit}'", { encoding: 'utf8' }).trim();
            }
        }
        catch (err) {
            this.logger.warn(`Fingerprint collection partial failure on ${platform}: ${err?.message ?? err}`);
        }
        const seed = `${cpu}${serial}${mac}`.trim();
        if (!seed) {
            throw new Error(`Unable to collect machine fingerprint on ${platform}`);
        }
        return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
    }
    verifyLicenseString(code, machineIdOverride) {
        const trimmed = code?.trim();
        if (!trimmed || !trimmed.includes('.')) {
            return { valid: false, reason: 'malformed' };
        }
        const [payloadPart, signaturePart] = trimmed.split('.');
        if (!payloadPart || !signaturePart) {
            return { valid: false, reason: 'malformed' };
        }
        let payloadJson;
        let payload;
        try {
            payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
            payload = JSON.parse(payloadJson);
        }
        catch {
            return { valid: false, reason: 'malformed' };
        }
        if (!payload.customer || !payload.machineId || !payload.issuedAt || !payload.expiresAt) {
            return { valid: false, reason: 'malformed' };
        }
        let signatureValid = false;
        try {
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(payloadJson);
            verifier.end();
            const signature = Buffer.from(signaturePart, 'base64url');
            signatureValid = verifier.verify(public_key_1.LICENSE_PUBLIC_KEY, signature);
        }
        catch (err) {
            this.logger.warn(`License signature verify error: ${err?.message ?? err}`);
            signatureValid = false;
        }
        if (!signatureValid) {
            return { valid: false, reason: 'bad-signature', payload };
        }
        const today = this.todayUTC();
        if (payload.issuedAt > today) {
            return { valid: false, reason: 'not-yet-valid', payload };
        }
        if (payload.expiresAt < today) {
            return { valid: false, reason: 'expired', payload };
        }
        const currentFingerprint = (machineIdOverride ?? this.getMachineId()).toLowerCase();
        if (payload.machineId.toLowerCase() !== currentFingerprint) {
            return { valid: false, reason: 'fingerprint-mismatch', payload };
        }
        return { valid: true, payload };
    }
    async activate(code, userId) {
        const result = this.verifyLicenseString(code);
        if (!result.valid || !result.payload) {
            throw new common_1.BadRequestException(this.reasonToMessage(result.reason));
        }
        const payload = result.payload;
        const trimmedCode = code.trim();
        await this.prisma.$transaction(async (tx) => {
            await tx.license.updateMany({
                where: { isActive: true },
                data: { isActive: false },
            });
            await tx.license.upsert({
                where: { code: trimmedCode },
                create: {
                    code: trimmedCode,
                    customer: payload.customer,
                    machineId: payload.machineId.toLowerCase(),
                    issuedAt: new Date(payload.issuedAt),
                    expiresAt: new Date(payload.expiresAt),
                    nonce: payload.nonce ?? '',
                    activatedBy: userId,
                    isActive: true,
                },
                update: {
                    isActive: true,
                    activatedBy: userId ?? null,
                    activatedAt: new Date(),
                },
            });
        });
        return this.getStatus();
    }
    async getStatus() {
        const machineId = this.tryGetMachineId();
        const enforced = this.isEnforced();
        const row = await this.prisma.license.findFirst({
            where: { isActive: true },
            orderBy: { activatedAt: 'desc' },
        });
        if (!row) {
            return { activated: false, enforced, machineId };
        }
        const result = this.verifyLicenseString(row.code, machineId);
        const expiresAt = this.formatDate(row.expiresAt);
        const daysRemaining = this.daysUntil(expiresAt);
        return {
            activated: true,
            enforced,
            machineId,
            license: {
                customer: row.customer,
                issuedAt: this.formatDate(row.issuedAt),
                expiresAt,
                daysRemaining,
                valid: result.valid,
                reason: result.reason,
            },
        };
    }
    async isAccessAllowed() {
        if (!this.isEnforced())
            return true;
        const status = await this.getStatus();
        return status.activated && status.license?.valid === true;
    }
    todayUTC() {
        return new Date().toISOString().slice(0, 10);
    }
    formatDate(d) {
        if (typeof d === 'string')
            return d.slice(0, 10);
        return d.toISOString().slice(0, 10);
    }
    daysUntil(dateString) {
        const today = new Date(this.todayUTC() + 'T00:00:00Z').getTime();
        const target = new Date(dateString + 'T00:00:00Z').getTime();
        return Math.floor((target - today) / (24 * 60 * 60 * 1000));
    }
    tryGetMachineId() {
        try {
            return this.getMachineId();
        }
        catch {
            return 'unavailable';
        }
    }
    reasonToMessage(reason) {
        switch (reason) {
            case 'malformed':
                return '激活码格式错误';
            case 'bad-signature':
                return '激活码签名校验失败（可能已被篡改或来源非法）';
            case 'fingerprint-mismatch':
                return '激活码与本机指纹不匹配（请确认是为本机签发）';
            case 'expired':
                return '激活码已过期';
            case 'not-yet-valid':
                return '激活码尚未生效';
            default:
                return '激活码无效';
        }
    }
};
exports.LicenseService = LicenseService;
exports.LicenseService = LicenseService = LicenseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LicenseService);
//# sourceMappingURL=license.service.js.map