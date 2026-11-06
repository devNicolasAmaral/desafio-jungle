import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../mikro-orm.config';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case';
import { CreateWalletUseCase } from './create-wallet.use-case';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { WagerTransactionKind, WagerTransactionStatus } from '../../domain/wallet/entities/wager-transaction.entity';
import { WalletLedgerEntry } from '../../domain/wallet/entities/wallet-ledger-entry.entity';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';

describe('ProcessWagerTransactionUseCase', () => {
    let orm: MikroORM;
    let em: any;
    let processUseCase: ProcessWagerTransactionUseCase;
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
            playerId: 'player-race',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        });
        walletId = wallet.id;

        processUseCase = new ProcessWagerTransactionUseCase(em);
    });

    it('deve processar apenas uma aposta e rejeitar a outra por saldo insuficiente', async () => {
        const bet80 = (id: string) => ({
            providerId: 'p1',
            externalTransactionId: id,
            idempotencyKey: `p1:${id}`,
            payloadHash: 'hash',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: Money.from({ amount: '80.00', currency: 'BRL' }),
        });

        const results = await Promise.allSettled([
            processUseCase.execute(bet80('tx-1')),
            processUseCase.execute(bet80('tx-2')),
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
        expect(fulfilled.length).toBe(2);

        const processed = fulfilled.filter(r => r.value.transaction.status === WagerTransactionStatus.Processed);
        const rejected = fulfilled.filter(r => r.value.transaction.status === WagerTransactionStatus.Rejected);

        expect(processed.length).toBe(1);
        expect(rejected.length).toBe(1);
        expect(rejected[0].value.transaction.failureCode).toBe('INSUFFICIENT_FUNDS');
        expect(rejected[0].value.idempotentReplay).toBe(false);

        const walletAfter = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfter.balance.toJSON().amount).toBe('20.00');

        const ledgerEntries = await em.find(WalletLedgerEntry as any, { walletId }) as WalletLedgerEntry[];
        expect(ledgerEntries.length).toBe(2);
        expect(ledgerEntries.filter(l => l.direction === 'DEBIT').length).toBe(1);

        const rejectedTxId = rejected[0].value.transaction.id;
        const rejectedLedger = await em.find(WalletLedgerEntry as any, { transactionId: rejectedTxId }) as WalletLedgerEntry[];
        expect(rejectedLedger.length).toBe(0);
    });

    it('deve processar 50 vezes a mesma aposta em paralelo e garantir idempotência', async () => {
        const betInput = {
            providerId: 'p1',
            externalTransactionId: 'tx-idem',
            idempotencyKey: `p1:tx-idem`,
            payloadHash: 'hash',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: Money.from({ amount: '10.00', currency: 'BRL' }),
        };

        const promises = Array.from({ length: 50 }).map(() => processUseCase.execute(betInput));
        const results = await Promise.all(promises);

        const replays = results.filter(r => r.idempotentReplay);
        const firstExecution = results.filter(r => !r.idempotentReplay);

        expect(firstExecution.length).toBe(1);
        expect(replays.length).toBe(49);

        const walletAfter = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfter.balance.toJSON().amount).toBe('90.00');

        const debits = await em.find(WalletLedgerEntry as any, { walletId, direction: 'DEBIT' }) as WalletLedgerEntry[];
        expect(debits.length).toBe(1);
    });

    it('deve rejeitar REFUND duplicado da mesma BET', async () => {
        const bet = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'bet-orig',
            idempotencyKey: 'p1:bet-orig',
            payloadHash: 'hash-bet',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: Money.from({ amount: '20.00', currency: 'BRL' }),
        });
        expect(bet.transaction.status).toBe(WagerTransactionStatus.Processed);

        const refund1 = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'refund-1',
            idempotencyKey: 'p1:refund-1',
            payloadHash: 'hash-refund-1',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Refund,
            money: Money.from({ amount: '20.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-orig',
        });
        expect(refund1.transaction.status).toBe(WagerTransactionStatus.Processed);

        const refund2 = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'refund-2',
            idempotencyKey: 'p1:refund-2',
            payloadHash: 'hash-refund-2',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Refund,
            money: Money.from({ amount: '20.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-orig',
        });
        expect(refund2.transaction.status).toBe(WagerTransactionStatus.Rejected);
        expect(refund2.transaction.failureCode).toBe('REFERENCE_ALREADY_REVERTED');

        const walletAfter = await em.findOne(Wallet as any, { id: walletId }) as Wallet;
        expect(walletAfter.balance.toJSON().amount).toBe('100.00');

        const refundLedgers = await em.find(WalletLedgerEntry as any, { walletId, direction: 'CREDIT' }) as WalletLedgerEntry[];
        expect(refundLedgers.length).toBe(2);
    });

    it('deve rejeitar ROLLBACK duplicado da mesma BET', async () => {
        const bet = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'bet-rb',
            idempotencyKey: 'p1:bet-rb',
            payloadHash: 'hash-bet-rb',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Bet,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
        });
        expect(bet.transaction.status).toBe(WagerTransactionStatus.Processed);

        const rb1 = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'rb-1',
            idempotencyKey: 'p1:rb-1',
            payloadHash: 'hash-rb-1',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Rollback,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-rb',
        });
        expect(rb1.transaction.status).toBe(WagerTransactionStatus.Processed);

        const rb2 = await processUseCase.execute({
            providerId: 'p1',
            externalTransactionId: 'rb-2',
            idempotencyKey: 'p1:rb-2',
            payloadHash: 'hash-rb-2',
            walletId,
            playerId: 'player-race',
            roundId: 'r1',
            gameId: 'g1',
            kind: WagerTransactionKind.Rollback,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-rb',
        });
        expect(rb2.transaction.status).toBe(WagerTransactionStatus.Rejected);
        expect(rb2.transaction.failureCode).toBe('REFERENCE_ALREADY_REVERTED');
    });
});