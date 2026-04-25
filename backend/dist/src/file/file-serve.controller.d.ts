import type { Response } from 'express';
import { MinioService } from './minio.service';
export declare class FileServeController {
    private readonly storage;
    constructor(storage: MinioService);
    serve(token: string, res: Response): Promise<void>;
}
