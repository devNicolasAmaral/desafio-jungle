import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { InboxMessage } from '../../domain/wallet/entities/inbox-message.entity';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { Money } from '../../domain/wallet/value-objects/money.value-object';

@Injectable()
export class SqsConsumerWorker implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SqsConsumerWorker.name);
    private client?: SQSClient;
    private queueUrl?: string;
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly em: EntityManager,
        private readonly processUseCase: ProcessWagerTransactionUseCase,
    ) {
        if (process.env.SQS_ENDPOINT) {
            this.client = new SQSClient({
                region: process.env.AWS_REGION || 'us-east-1',
                endpoint: process.env.SQS_ENDPOINT,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
                },
            });
            this.queueUrl = process.env.SQS_QUEUE_URL;
        }
    }

    onModuleInit() {
        if (this.client && this.queueUrl) {
            this.timer = setInterval(() => this.pollOnce(), 2000);
            this.logger.log('SQS Consumer Worker iniciado (polling real).');
        } else {
            this.logger.log('SQS Consumer Worker em modo MOCK (aguardando chamada manual).');
        }
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    public async pollOnce() {
        if (this.running || !this.client || !this.queueUrl) return;
        this.running = true;

        try {
            const response = await this.client.send(new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 5,
            }));

            if (response.Messages) {
                for (const msg of response.Messages) {
                    try {
                        const body = JSON.parse(msg.Body!);
                        await this.handleMessage(body, msg.MessageId!);

                        await this.client.send(new DeleteMessageCommand({
                            QueueUrl: this.queueUrl,
                            ReceiptHandle: msg.ReceiptHandle!,
                        }));
                    } catch (error: any) {
                        this.logger.error(`Erro ao processar mensagem ${msg.MessageId}: ${error.message}`);
                    }
                }
            }
        } catch (error: any) {
            this.logger.error(`Erro no polling do SQS: ${error.message}`);
        } finally {
            this.running = false;
        }
    }

    private async handleMessage(body: any, sqsMessageId: string): Promise<void> {
        const consumerName = 'wager-transactions.fifo';
        const messageId = body.messageId;
        const data = body.data;

        if (!messageId) {
            throw new Error(`Mensagem ${sqsMessageId} sem messageId no body`);
        }
        if (!data || !data.payloadHash) {
            throw new Error(`Mensagem ${messageId} sem payloadHash no body`);
        }

        return this.em.transactional(async (em) => {
            let inbox = await em.findOne(InboxMessage as any, { messageId, consumerName }) as InboxMessage | null;

            if (inbox?.isProcessed()) {
                if (inbox.payloadHash !== data.payloadHash) {
                    throw new Error(`Conflito no inbox: messageId ${messageId} processada com payload diferente`);
                }
                this.logger.debug(`Mensagem ${messageId} ja processada. Ignorando.`);
                return;
            }

            if (!inbox) {
                inbox = InboxMessage.receive({
                    messageId,
                    consumerName,
                    payloadHash: data.payloadHash,
                });
                em.persist(inbox as any);
            }

            const result = await this.processUseCase.execute({
                providerId: data.providerId,
                externalTransactionId: data.externalTransactionId,
                idempotencyKey: data.idempotencyKey,
                payloadHash: data.payloadHash,
                walletId: data.walletId,
                playerId: data.playerId,
                roundId: data.roundId,
                gameId: data.gameId,
                kind: data.kind,
                money: Money.from({
                    amount: data.money.amount,
                    currency: data.money.currency,
                }),
                referenceExternalTransactionId: data.referenceExternalTransactionId,
            }, em);

            inbox.markProcessed(new Date());
            em.persist(inbox as any);
            await em.flush();

            this.logger.log(`Mensagem ${messageId} processada com status ${result.transaction.status}.`);
        });
    }
}