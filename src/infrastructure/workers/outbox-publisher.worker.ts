import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxMessage } from '../../domain/wallet/entities/outbox-message.entity';
import { SqsPublisherService } from '../messaging/sqs-publisher.service';

@Injectable()
export class OutboxPublisherWorker implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(OutboxPublisherWorker.name);
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly em: EntityManager,
        private readonly publisher: SqsPublisherService,
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => this.tick(), 2000);
        this.logger.log('Outbox Publisher Worker iniciado (intervalo de 2s).');
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    private async tick() {
        if (this.running) return;
        this.running = true;

        try {
            await this.em.transactional(async (em) => {
                // SKIP LOCKED permite que multiplas instancias nao peguem a mesma linha
                const rawIds = await em.getConnection().execute(`
                    SELECT id FROM outbox_messages
                    WHERE published_at IS NULL
                    AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
                    ORDER BY occurred_at ASC
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                `);

                const ids = (rawIds as any[]).map(r => r.id);
                if (ids.length === 0) return;

                const messages = await em.find(OutboxMessage as any, { id: { $in: ids } }) as OutboxMessage[];

                for (const message of messages) {
                    try {
                        await this.publisher.publish(message);
                        message.markPublished(new Date());
                    } catch (error: any) {
                        this.logger.warn(`Falha ao publicar ${message.id}: ${error.message}. Agendando retry.`);
                        message.scheduleRetry(new Date());
                    }
                    em.persist(message as any);
                }

                await em.flush();
            });
        } catch (error: any) {
            this.logger.error(`Erro no tick do worker: ${error.message}`);
        } finally {
            this.running = false;
        }
    }
}