import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../../mikro-orm.config';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { PendingReferenceWorker } from './pending-reference.worker';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';
import {
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../../domain/wallet/entities/wager-transaction.entity';

describe('PendingReferenceWorker', () => {
    let orm: MikroORM;
    let em: any;
    let worker: PendingReferenceWorker;
    let walletId: string;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
        await orm.em.getConnection().execute(`drop schema public cascade; create schema public;`);
        await orm.migrator.up();
    });

    afterAll(async () => {
        await orm.migrator.down();
        await orm.close(true);
    });

    beforeEach(async () => {
        await orm.schema.clear();
        em = orm.em.fork();

        const createWallet = new CreateWalletUseCase(em);
        const wallet = await createWallet.execute({
            playerId: 'player-pending',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        });
        walletId = wallet.id;

        const processUseCase = new ProcessWagerTransactionUseCase(em);
        worker = new PendingReferenceWorker(em, processUseCase);
    });

    it('deve retomar PENDING_REFERENCE quando a referencia chegar', async () => {
        const processUseCase = new ProcessWagerTransactionUseCase(em);

        const refundInput = {
            providerId: 'p1',
            externalTransactionId: 'refund-pending',
            idempotencyKey: 'p1:refund-pending',
            payloadHash: 'hash-refund',
            walletId,
            playerId: 'player-pending',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Refund,
            money: Money.from({ amount: '20.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-futura',
        };

        const result1 = await processUseCase.execute(refundInput);
        expect(result1.transaction.status).toBe(WagerTransactionStatus.PendingReference);
        expect(result1.idempotentReplay).toBe(false);

        const betInput = {
            providerId: 'p1',
            externalTransactionId: 'bet-futura',
            idempotencyKey: 'p1:bet-futura',
            payloadHash: 'hash-bet',
            walletId,
            playerId: 'player-pending',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: Money.from({ amount: '20.00', currency: 'BRL' }),
        };

        const betResult = await processUseCase.execute(betInput);
        expect(betResult.transaction.status).toBe(WagerTransactionStatus.Processed);

        const walletAfterBet = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfterBet.balance.toJSON().amount).toBe('80.00');

        await worker.tick();
        

        const refundTx = await em.findOne(WagerTransaction as any, { id: result1.transaction.id }) as WagerTransaction;
        expect(refundTx.status).toBe(WagerTransactionStatus.Processed);

        const walletAfterRefund = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfterRefund.balance.toJSON().amount).toBe('100.00');
    });

    it('deve rejeitar PENDING_REFERENCE apos TTL esgotado', async () => {
        const processUseCase = new ProcessWagerTransactionUseCase(em);

        const refundInput = {
            providerId: 'p1',
            externalTransactionId: 'refund-expire',
            idempotencyKey: 'p1:refund-expire',
            payloadHash: 'hash-expire',
            walletId,
            playerId: 'player-pending',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Refund,
            money: Money.from({ amount: '10.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-inexistente',
        };

        const result = await processUseCase.execute(refundInput);
        expect(result.transaction.status).toBe(WagerTransactionStatus.PendingReference);

        await em.nativeUpdate(
            WagerTransaction as any,
            { id: result.transaction.id } as any,
            { createdAt: new Date(Date.now() - 10 * 60 * 1000) } as any,
        );
        em.clear();

        await worker.tick();
        em.clear()

        const refundTx = await em.findOne(WagerTransaction as any, { id: result.transaction.id }) as WagerTransaction;
        expect(refundTx.status).toBe(WagerTransactionStatus.Rejected);
        expect(refundTx.failureCode).toBe('REFERENCE_NOT_FOUND');
    });
});