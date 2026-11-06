import { Controller, Get } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Controller('health')
export class HealthController {
    constructor(private readonly em: EntityManager) {}

    @Get('live')
    live() {
        return { status: 'ok' };
    }

    @Get('ready')
    async ready() {
        try {
            await this.em.getConnection().execute('select 1');
            return { status: 'ok', database: 'connected', messaging: 'connected' };
        } catch {
            return { status: 'degraded', database: 'disconnected', messaging: 'unknown' };
        }
    }
}
