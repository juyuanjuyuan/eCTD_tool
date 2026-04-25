import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { LICENSE_PUBLIC_KEY } from './public-key';

export interface LicensePayload {
  customer: string;
  machineId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  reason?:
    | 'malformed'
    | 'bad-signature'
    | 'fingerprint-mismatch'
    | 'expired'
    | 'not-yet-valid';
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

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private cachedMachineId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Touch machine id once so any startup error is surfaced early.
    try {
      this.getMachineId();
    } catch (err: any) {
      this.logger.warn(`Machine fingerprint unavailable at boot: ${err?.message ?? err}`);
    }
  }

  /**
   * Whether license enforcement is active. Disabled by default in non-production so
   * developer machines can run without a real license; enabled by default in production.
   * Override with `LICENSE_ENFORCE=true|false`.
   */
  isEnforced(): boolean {
    const flag = process.env.LICENSE_ENFORCE;
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Resolve current machine fingerprint. Priority:
   *   1. process.env.MACHINE_ID (injected by Electron main on the desktop build)
   *   2. process.env.LICENSE_MACHINE_ID_OVERRIDE (back-compat with verify-license.js)
   *   3. Shell fallback (mac/linux/win) — best-effort, may be slow
   */
  getMachineId(): string {
    if (this.cachedMachineId) return this.cachedMachineId;

    const injected = process.env.MACHINE_ID || process.env.LICENSE_MACHINE_ID_OVERRIDE;
    if (injected && /^[a-f0-9]{16}$/i.test(injected)) {
      this.cachedMachineId = injected.toLowerCase();
      return this.cachedMachineId;
    }

    this.cachedMachineId = this.collectFingerprint();
    return this.cachedMachineId;
  }

  private collectFingerprint(): string {
    const platform = process.platform;
    let cpu = '';
    let serial = '';
    let mac = '';

    try {
      if (platform === 'darwin') {
        cpu = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
        serial = execSync(
          "ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '\"'",
          { encoding: 'utf8' },
        ).trim();
        mac = execSync("ifconfig en0 | awk '/ether/ {print $2}'", { encoding: 'utf8' }).trim();
      } else if (platform === 'win32') {
        const cpuOut = execSync('wmic cpu get ProcessorId /value', { encoding: 'utf8' });
        cpu = (cpuOut.match(/ProcessorId=(.+)/) || [])[1]?.trim() || '';
        const boardOut = execSync('wmic baseboard get SerialNumber /value', { encoding: 'utf8' });
        serial = (boardOut.match(/SerialNumber=(.+)/) || [])[1]?.trim() || '';
        const macOut = execSync('getmac /fo csv /nh', { encoding: 'utf8' });
        mac = (macOut.split('\n')[0] || '').split(',')[0]?.replace(/"/g, '').trim() || '';
      } else {
        cpu = execSync('cat /proc/cpuinfo | grep "model name" | head -1', { encoding: 'utf8' }).trim();
        try {
          serial = execSync('cat /sys/class/dmi/id/board_serial 2>/dev/null', { encoding: 'utf8' }).trim();
        } catch {
          serial = 'linux-no-board-serial';
        }
        mac = execSync(
          "ip link show | awk '/ether/ {print $2; exit}'",
          { encoding: 'utf8' },
        ).trim();
      }
    } catch (err: any) {
      this.logger.warn(`Fingerprint collection partial failure on ${platform}: ${err?.message ?? err}`);
    }

    const seed = `${cpu}${serial}${mac}`.trim();
    if (!seed) {
      throw new Error(`Unable to collect machine fingerprint on ${platform}`);
    }
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  }

  /**
   * Pure verifier: parses license code, checks RSA signature with embedded public key,
   * compares machineId against current machine, checks expiresAt > today.
   * Returns structured result so callers can surface specific errors.
   */
  verifyLicenseString(code: string, machineIdOverride?: string): LicenseVerifyResult {
    const trimmed = code?.trim();
    if (!trimmed || !trimmed.includes('.')) {
      return { valid: false, reason: 'malformed' };
    }

    const [payloadPart, signaturePart] = trimmed.split('.');
    if (!payloadPart || !signaturePart) {
      return { valid: false, reason: 'malformed' };
    }

    let payloadJson: string;
    let payload: LicensePayload;
    try {
      payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
      payload = JSON.parse(payloadJson);
    } catch {
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
      signatureValid = verifier.verify(LICENSE_PUBLIC_KEY, signature);
    } catch (err: any) {
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

  /**
   * Activate using a license code. Verifies signature + fingerprint + expiry, then persists.
   * Marks any previously-active license as inactive in the same transaction.
   */
  async activate(code: string, userId?: string): Promise<LicenseStatus> {
    const result = this.verifyLicenseString(code);
    if (!result.valid || !result.payload) {
      throw new BadRequestException(this.reasonToMessage(result.reason));
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

  /**
   * Active license per `isActive=true`. Re-verifies on every read so a tampered DB row
   * cannot grant access; returns null if no row or row no longer verifies.
   */
  async getStatus(): Promise<LicenseStatus> {
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

  /**
   * Used by the global guard. Returns true if the request should be allowed:
   *   - enforcement disabled, or
   *   - an active, valid license exists.
   */
  async isAccessAllowed(): Promise<boolean> {
    if (!this.isEnforced()) return true;
    const status = await this.getStatus();
    return status.activated && status.license?.valid === true;
  }

  private todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private formatDate(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  private daysUntil(dateString: string): number {
    const today = new Date(this.todayUTC() + 'T00:00:00Z').getTime();
    const target = new Date(dateString + 'T00:00:00Z').getTime();
    return Math.floor((target - today) / (24 * 60 * 60 * 1000));
  }

  private tryGetMachineId(): string {
    try {
      return this.getMachineId();
    } catch {
      return 'unavailable';
    }
  }

  private reasonToMessage(reason: LicenseVerifyResult['reason']): string {
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
}
