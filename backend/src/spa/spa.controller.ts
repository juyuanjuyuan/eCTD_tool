import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { Public } from '../license/public.decorator';

const API_PREFIXES = ['/api/', '/health', '/api/docs', '/socket.io'];

function isApiPath(p: string): boolean {
  return API_PREFIXES.some(
    (prefix) => p === prefix.replace(/\/$/, '') || p.startsWith(prefix),
  );
}

// Serving the SPA shell must work pre-activation — the activation page itself
// is part of the SPA, so a LicenseGuard 403 here would brick first-run UX.
// API calls the SPA makes after load (e.g. /api/v1/license/status) still go
// through the guard normally because they're handled by their own controllers.
@Public()
@Controller()
export class SpaController {
  @Get('*')
  serveSpa(@Req() req: Request, @Res() res: Response) {
    if (isApiPath(req.path)) {
      return res.status(404).json({
        code: 404,
        message: `Cannot ${req.method} ${req.path}`,
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }

    const publicDir = process.env.__PUBLIC_DIR__;
    if (!publicDir) {
      return res
        .status(503)
        .send('SPA not built — frontend assets missing from this build');
    }

    const indexHtml = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      return res
        .status(503)
        .send(`SPA not built — ${indexHtml} missing`);
    }

    res.sendFile(indexHtml);
  }
}
