import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EntityManager, FilterQuery } from '@mikro-orm/postgresql';
import { WagerTransaction, WagerTransactionStatus } from '../../domain/wallet/entities/wager-transaction.entity';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { OutboxMessage } from '../../domain/wallet/entities/outbox-message.entity';
import { WagerTransactionRejected } from '../../domain/wallet/events/wager-transaction.events';

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PendingReferenceWorker.name);
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    private readonly pollIntervalMs = 30_000;
    readonly maxAgeMs = 5 * 60 * 1000;

    constructor(
        private readonly em: EntityManager,
        private readonly processUseCase: ProcessWagerTransactionUseCase,
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
        this.logger.log(`Pending Reference Worker iniciado (intervalo de ${this.pollIntervalMs}ms).`);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    public async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;

        try {
            const em = this.em.fork();
            const where = {
                _status: WagerTransactionStatus.PendingReference,
            } as unknown as FilterQuery<WagerTransaction>;

            const pendingTxs = await em.find(WagerTransaction, where, {
                limit: 10,
                orderBy: { createdAt: 'asc' },
            });

            if (pendingTxs.length === 0) return;

            const now = new Date();

            for (const tx of pendingTxs) {
                try {
                    const result = await this.processUseCase.execute({
                        providerId: tx.providerId,
                        externalTransactionId: tx.externalTransactionId,
                        idempotencyKey: tx.idempotencyKey,
                        payloadHash: tx.payloadHash,
                        walletId: tx.walletId,
                        playerId: tx.playerId,
                        roundId: tx.roundId,
                        gameId: tx.gameId,
                        kind: tx.kind,
                        money: tx.money,
                        referenceExternalTransactionId: tx.referenceExternalTransactionId,
                    });

                    if (result.transaction.status === WagerTransactionStatus.PendingReference) {
                        const age = now.getTime() - tx.createdAt.getTime();
                        if (age > this.maxAgeMs) {
                            try {
                                await this.rejectExpired(tx);
                            } catch (error: any) {
                                this.logger.warn(`Falha ao rejeitar transacao expirada ${tx.id}: ${error.message}`);
                            }
                        } else {
                            this.logger.debug(`Transacao ${tx.id} ainda aguardando referencia.`);
                        }
                    } else {
                        this.logger.log(`Transacao ${tx.id} retomada com status ${result.transaction.status}.`);
                    }
                } catch (error: any) {
                    this.logger.warn(`Falha ao retomar transacao ${tx.id}: ${error.message}`);
                }
            }
        } catch (error: any) {
            this.logger.error(`Erro no tick do pending worker: ${error.message}`);
        } finally {
            this.running = false;
        }
    }

    private async rejectExpired(tx: WagerTransaction): Promise<void> {
        const em = this.em.fork();
        await em.transactional(async (innerEm) => {
            tx.reject('REFERENCE_NOT_FOUND');
            innerEm.persist(tx as any);

            const rejectedEvent = new WagerTransactionRejected({
                eventId: crypto.randomUUID(),
                aggregateId: tx.walletId,
                correlationId: tx.id,
                occurredAt: new Date(),
                data: {
                    transactionId: tx.id,
                    walletId: tx.walletId,
                    kind: tx.kind,
                    status: tx.status,
                    money: tx.money.toJSON(),
                    failureCode: 'REFERENCE_NOT_FOUND',
                }
            });
            innerEm.persist(OutboxMessage.enqueue(rejectedEvent) as any);

            await innerEm.flush();
        });
        this.logger.warn(`Transacao ${tx.id} expirada (TTL) e rejeitada.`);
    }
}