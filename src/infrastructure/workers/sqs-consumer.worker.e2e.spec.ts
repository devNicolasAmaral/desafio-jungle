import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { SQSClient, SendMessageCommand, PurgeQueueCommand } from '@aws-sdk/client-sqs';
import config from '../../mikro-orm.config';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { SqsConsumerWorker } from './sqs-consumer.worker';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';
import { WagerTransactionKind } from '../../domain/wallet/entities/wager-transaction.entity';
import { InboxMessage } from '../../domain/wallet/entities/inbox-message.entity';

describe('SqsConsumerWorker - E2E LocalStack', () => {
    let orm: MikroORM;
    let em: any;
    let worker: SqsConsumerWorker;
    let walletId: string;
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

        const createWallet = new CreateWalletUseCase(em);
        const wallet = await createWallet.execute({
            playerId: 'player-e2e',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        });
        walletId = wallet.id;

        const processUseCase = new ProcessWagerTransactionUseCase(em);
        worker = new SqsConsumerWorker(em, processUseCase);
    });

    it('deve consumir mensagem real do LocalStack e persistir no Inbox', async () => {
        const messageBody = {
            messageId: 'e2e-msg-1',
            type: 'WagerTransactionRequested',
            data: {
                providerId: 'p1',
                externalTransactionId: 'ext-e2e-1',
                idempotencyKey: 'p1:ext-e2e-1',
                payloadHash: 'hash',
                walletId,
                playerId: 'player-e2e',
                roundId: 'r1',
                gameId: 'g1',
                kind: WagerTransactionKind.Bet,
                money: { amount: '20.00', currency: 'BRL' },
            }
        };

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messageBody),
            MessageGroupId: 'group-1',
            MessageDeduplicationId: 'e2e-msg-1',
        }));

        await worker.pollOnce();

        const walletAfter = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfter.balance.toJSON().amount).toBe('80.00');

        const inbox = await em.findOne(InboxMessage as any, { messageId: 'e2e-msg-1' }) as InboxMessage;
        expect(inbox).not.toBeNull();
        expect(inbox.isProcessed()).toBe(true);
    });

    it('deve ignorar redelivery de mensagem ja processada (inbox dedup)', async () => {
        const messageBody = {
            messageId: 'e2e-msg-dup',
            type: 'WagerTransactionRequested',
            data: {
                providerId: 'p1',
                externalTransactionId: 'ext-e2e-dup',
                idempotencyKey: 'p1:ext-e2e-dup',
                payloadHash: 'hash-dup',
                walletId,
                playerId: 'player-e2e',
                roundId: 'r1',
                gameId: 'g1',
                kind: WagerTransactionKind.Bet,
                money: { amount: '10.00', currency: 'BRL' },
            }
        };

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messageBody),
            MessageGroupId: 'group-dup',
            MessageDeduplicationId: 'dup-first',
        }));

        await worker.pollOnce();

        const afterFirst = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(afterFirst.balance.toJSON().amount).toBe('90.00');

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messageBody),
            MessageGroupId: 'group-dup',
            MessageDeduplicationId: 'dup-second',
        }));

        await worker.pollOnce();

        const afterSecond = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(afterSecond.balance.toJSON().amount).toBe('90.00');

        const inboxCount = await em.count(InboxMessage as any, { messageId: 'e2e-msg-dup' });
        expect(inboxCount).toBe(1);
    });
});