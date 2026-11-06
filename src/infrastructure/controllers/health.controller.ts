import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Response } from 'express';

@Controller('health')
export class HealthController {
    constructor(private readonly em: EntityManager) {}

    @Get('live')
    live() {
        return { status: 'ok' };
    }

    @Get('ready')
    async ready(@Res({ passthrough: true }) res: Response) {
        let database: 'connected' | 'disconnected' = 'disconnected';
        try {
            await this.em.getConnection().execute('select 1');
            database = 'connected';
        } catch {
            database = 'disconnected';
        }

        const messaging = process.env.SQS_ENDPOINT ? 'connected' : 'mock';

        if (database === 'disconnected') {
            res.status(HttpStatus.SERVICE_UNAVAILABLE);
            return { status: 'degraded', database, messaging };
        }

        return { status: 'ok', database, messaging };
    }
}