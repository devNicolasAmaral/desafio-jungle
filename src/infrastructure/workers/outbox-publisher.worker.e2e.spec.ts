import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { SQSClient, ReceiveMessageCommand, PurgeQueueCommand } from '@aws-sdk/client-sqs';
import config from '../../../mikro-orm.config';
import { OutboxPublisherWorker } from './outbox-publisher.worker';
import { SqsPublisherService } from '../messaging/sqs-publisher.service';
import { OutboxMessage } from '../../domain/wallet/entities/outbox-message.entity';
import { WagerTransactionProcessed } from '../../domain/wallet/events/wager-transaction.events';

describe('OutboxPublisherWorker - E2E LocalStack', () => {
    let orm: MikroORM;
    let em: any;
    let worker: OutboxPublisherWorker;
    let sqsClient: SQSClient;

    const queueUrl = 'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transactions.fifo';

    beforeAll(async () => {
        process.env.SQS_ENDPOINT = 'http://localhost:4566';
        process.env.SQS_QUEUE_URL = queueUrl;

        orm = await MikroORM.init(config);
        await orm.em.getConnection().execute(`drop schema public cascade; create schema public;`);
        await orm.migrator.up();

        sqsClient = new SQSClient({
            region: 'us-east-1',
            endpoint: 'http://localhost:4566',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        });

        await sqsClient.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
    });

    afterAll(async () => {
        await orm.migrator.down();
        await orm.close(true);
        delete process.env.SQS_ENDPOINT;
        delete process.env.SQS_QUEUE_URL;
    });

    beforeEach(async () => {
        await orm.schema.clear();
        em = orm.em.fork();

        const publisher = new SqsPublisherService();
        worker = new OutboxPublisherWorker(em, publisher);
    });

    it('deve ler da outbox, publicar no LocalStack SQS e marcar como publicado', async () => {
        const event = new WagerTransactionProcessed({
            eventId: '11111111-1111-4111-8111-111111111111',
            aggregateId: 'wallet-1',
            correlationId: 'tx-1',
            occurredAt: new Date(),
            data: {
                transactionId: 'tx-1',
                walletId: 'wallet-1',
                kind: 'BET',
                status: 'PROCESSED',
                money: { amount: '100.00', currency: 'BRL' },
            }
        });

        const outbox = OutboxMessage.enqueue(event);
        em.persist(outbox as any);
        await em.flush();

        await worker.pollOnce();

        const updatedOutbox = await em.findOne(OutboxMessage as any, { id: '11111111-1111-4111-8111-111111111111' }) as OutboxMessage;
        expect(updatedOutbox.publishedAt).not.toBeNull();

        const response = await sqsClient.send(new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 2,
        }));

        expect(response.Messages).toBeDefined();
        expect(response.Messages!.length).toBe(1);

        const body = JSON.parse(response.Messages![0].Body!);
        expect(body.eventType).toBe('WagerTransactionProcessed');
        expect(body.data.transactionId).toBe('tx-1');
    });
});