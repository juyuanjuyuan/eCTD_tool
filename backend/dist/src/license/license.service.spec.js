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
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const license_service_1 = require("./license.service");
const prisma_service_1 = require("../prisma/prisma.service");
const PRIVATE_KEY_PATH = path.resolve(__dirname, '../../../tools/keys/private.pem');
function signLicense(payload) {
    const json = JSON.stringify(payload);
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(json);
    signer.end();
    const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const signature = signer.sign(privateKey);
    return `${Buffer.from(json).toString('base64url')}.${signature.toString('base64url')}`;
}
function dateOffset(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
describe('LicenseService', () => {
    let service;
    let prisma;
    const FIXED_MACHINE_ID = 'abcdef1234567890';
    beforeAll(() => {
        if (!fs.existsSync(PRIVATE_KEY_PATH)) {
            throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}; tests require keypair.`);
        }
    });
    beforeEach(async () => {
        prisma = {
            license: {
                findFirst: jest.fn(),
                upsert: jest.fn(),
                updateMany: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
        };
        process.env.MACHINE_ID = FIXED_MACHINE_ID;
        process.env.LICENSE_ENFORCE = 'true';
        const module = await testing_1.Test.createTestingModule({
            providers: [
                license_service_1.LicenseService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(license_service_1.LicenseService);
    });
    afterEach(() => {
        delete process.env.MACHINE_ID;
        delete process.env.LICENSE_ENFORCE;
        delete process.env.LICENSE_MACHINE_ID_OVERRIDE;
    });
    describe('getMachineId', () => {
        it('honors process.env.MACHINE_ID when 16 hex chars', () => {
            expect(service.getMachineId()).toBe(FIXED_MACHINE_ID);
        });
        it('honors LICENSE_MACHINE_ID_OVERRIDE as fallback', () => {
            delete process.env.MACHINE_ID;
            process.env.LICENSE_MACHINE_ID_OVERRIDE = '0000000000000001';
            const fresh = new license_service_1.LicenseService(prisma);
            expect(fresh.getMachineId()).toBe('0000000000000001');
        });
    });
    describe('verifyLicenseString', () => {
        it('rejects malformed input', () => {
            expect(service.verifyLicenseString('').valid).toBe(false);
            expect(service.verifyLicenseString('no-dot-here').valid).toBe(false);
            expect(service.verifyLicenseString('a.b').valid).toBe(false);
        });
        it('accepts a freshly-signed valid license', () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(0),
                expiresAt: dateOffset(365),
                nonce: 'abc',
            });
            const result = service.verifyLicenseString(code);
            expect(result.valid).toBe(true);
            expect(result.payload?.customer).toBe('Acme');
        });
        it('rejects bad signature', () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(0),
                expiresAt: dateOffset(365),
                nonce: 'abc',
            });
            const [payloadPart, sigPart] = code.split('.');
            const sigBytes = Buffer.from(sigPart, 'base64url');
            sigBytes[0] = sigBytes[0] ^ 0xff;
            const tampered = `${payloadPart}.${sigBytes.toString('base64url')}`;
            const result = service.verifyLicenseString(tampered);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('bad-signature');
        });
        it('rejects fingerprint mismatch', () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: '0000000000000000',
                issuedAt: dateOffset(0),
                expiresAt: dateOffset(365),
                nonce: 'abc',
            });
            const result = service.verifyLicenseString(code);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('fingerprint-mismatch');
        });
        it('rejects expired', () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(-365),
                expiresAt: dateOffset(-1),
                nonce: 'abc',
            });
            const result = service.verifyLicenseString(code);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('expired');
        });
        it('rejects not-yet-valid', () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(10),
                expiresAt: dateOffset(370),
                nonce: 'abc',
            });
            const result = service.verifyLicenseString(code);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('not-yet-valid');
        });
    });
    describe('activate', () => {
        it('persists a valid license and deactivates previous', async () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(0),
                expiresAt: dateOffset(365),
                nonce: 'abc',
            });
            prisma.license.upsert.mockResolvedValue({});
            prisma.license.findFirst.mockResolvedValue({
                code,
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
                isActive: true,
            });
            const status = await service.activate(code, 'user-1');
            expect(prisma.license.updateMany).toHaveBeenCalledWith({
                where: { isActive: true },
                data: { isActive: false },
            });
            expect(prisma.license.upsert).toHaveBeenCalled();
            expect(status.activated).toBe(true);
            expect(status.license?.customer).toBe('Acme');
            expect(status.license?.daysRemaining).toBeGreaterThan(360);
        });
        it('rejects an invalid license without persisting', async () => {
            await expect(service.activate('garbage')).rejects.toBeInstanceOf(common_1.BadRequestException);
            expect(prisma.license.upsert).not.toHaveBeenCalled();
        });
        it('upsert is idempotent on same code', async () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(0),
                expiresAt: dateOffset(365),
                nonce: 'abc',
            });
            prisma.license.upsert.mockResolvedValue({});
            prisma.license.findFirst.mockResolvedValue({
                code,
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
                isActive: true,
            });
            await service.activate(code);
            await service.activate(code);
            expect(prisma.license.upsert).toHaveBeenCalledTimes(2);
            expect(prisma.license.upsert.mock.calls[0][0].where).toEqual({ code });
        });
    });
    describe('getStatus / isAccessAllowed', () => {
        it('returns activated=false when no license row', async () => {
            prisma.license.findFirst.mockResolvedValue(null);
            const status = await service.getStatus();
            expect(status.activated).toBe(false);
        });
        it('flags valid=false when stored license expired since activation', async () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(-400),
                expiresAt: dateOffset(-1),
                nonce: 'abc',
            });
            prisma.license.findFirst.mockResolvedValue({
                code,
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() - 24 * 3600 * 1000),
                isActive: true,
            });
            const status = await service.getStatus();
            expect(status.activated).toBe(true);
            expect(status.license?.valid).toBe(false);
            expect(status.license?.reason).toBe('expired');
        });
        it('isAccessAllowed denies when expired', async () => {
            const code = signLicense({
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: dateOffset(-400),
                expiresAt: dateOffset(-1),
                nonce: 'abc',
            });
            prisma.license.findFirst.mockResolvedValue({
                code,
                customer: 'Acme',
                machineId: FIXED_MACHINE_ID,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() - 24 * 3600 * 1000),
                isActive: true,
            });
            expect(await service.isAccessAllowed()).toBe(false);
        });
        it('isAccessAllowed allows when enforcement disabled', async () => {
            process.env.LICENSE_ENFORCE = 'false';
            prisma.license.findFirst.mockResolvedValue(null);
            expect(await service.isAccessAllowed()).toBe(true);
        });
    });
});
//# sourceMappingURL=license.service.spec.js.map