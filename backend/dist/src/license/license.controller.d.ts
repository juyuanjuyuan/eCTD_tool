import { LicenseService } from './license.service';
import { ActivateLicenseDto } from './dto';
export declare class LicenseController {
    private readonly licenseService;
    constructor(licenseService: LicenseService);
    status(): Promise<import("./license.service").LicenseStatus>;
    activate(dto: ActivateLicenseDto, userId?: string): Promise<import("./license.service").LicenseStatus>;
}
