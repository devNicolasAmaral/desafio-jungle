import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../mikro-orm.config';
import { CreateWalletUseCase } from './create-wallet.use-case';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../domain/wallet/entities/wager-transaction.entity';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/wallet/entities/wallet-ledger-entry.entity';

describe('CreateWalletUseCase', () => {
    let orm: MikroORM;
    let em: any;
    let useCase: CreateWalletUseCase;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
        await orm.em.getConnection().execute(`
            drop schema public cascade;
            create schema public;
        `);
        await orm.migrator.up();
    });

    afterAll(async () => {
        await orm.migrator.down();
        await orm.close(true);
    });

    beforeEach(async () => {
        await orm.schema.clear();
        em = orm.em.fork();
        useCase = new CreateWalletUseCase(em);
    });

    it('deve criar uma carteira com saldo positivo e gerar a transação de abertura e o ledger', async () => {
        const input = {
            playerId: 'player-1',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        };

        const wallet = await useCase.execute(input);

        expect(wallet.balance.toJSON().amount).toBe('100.00');
        expect(wallet.version).toBe(1);

        const transactions = await em.find(WagerTransaction as any, { walletId: wallet.id }) as WagerTransaction[];
        expect(transactions.length).toBe(1);
        expect(transactions[0].kind).toBe(WagerTransactionKind.Opening);
        expect(transactions[0].status).toBe(WagerTransactionStatus.Processed);

        const ledgerEntries = await em.find(WalletLedgerEntry as any, { walletId: wallet.id }) as WalletLedgerEntry[];
        expect(ledgerEntries.length).toBe(1);
        expect(ledgerEntries[0].direction).toBe(LedgerDirection.Credit);
        expect(ledgerEntries[0].balanceAfter.toJSON().amount).toBe('100.00');
    });

    it('deve criar uma carteira com saldo zero sem gerar transação ou ledger', async () => {
        const input = {
            playerId: 'player-1',
            initialBalance: Money.zero('BRL'),
        };

        const wallet = await useCase.execute(input);

        expect(wallet.balance.toJSON().amount).toBe('0.00');

        const transactions = await em.find(WagerTransaction as any, { walletId: wallet.id }) as WagerTransaction[];
        expect(transactions.length).toBe(0);

        const ledgerEntries = await em.find(WalletLedgerEntry as any, { walletId: wallet.id }) as WalletLedgerEntry[];
        expect(ledgerEntries.length).toBe(0);
    });

    it('deve falhar e não persistir dados se tentar criar uma carteira duplicada', async () => {
        const input = {
            playerId: 'player-1',
            initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
        };

        await useCase.execute(input);

        expect(useCase.execute(input)).rejects.toThrow('Já existe uma carteira para este jogador com esta moeda.');
        
        const count = await em.count(WagerTransaction as any, { playerId: 'player-1' });
        expect(count).toBe(1);
    });

        it('deve criar apenas uma carteira quando requisitado em paralelo para o mesmo jogador', async () => {
        const input = {
            playerId: 'player-race',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        };

        // O catch evita que o Promise.all aborte na primeira rejeição, permitindo avaliar todos os resultados
        const promises = Array.from({ length: 5 }).map(() => 
            useCase.execute(input).catch(err => err)
        );

        const results = await Promise.all(promises);

        const successes = results.filter(r => !(r instanceof Error));
        const failures = results.filter(r => r instanceof Error);

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(4);

        const walletCount = await em.count(Wallet as any, { playerId: 'player-race' });
        expect(walletCount).toBe(1);

        const ledgerCount = await em.count(WalletLedgerEntry as any, { walletId: (successes[0] as any).id });
        expect(ledgerCount).toBe(1);
    });
});