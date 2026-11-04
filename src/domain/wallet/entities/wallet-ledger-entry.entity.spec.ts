import { describe, expect, it } from 'bun:test';
import { Money } from '../value-objects/money.value-object';
import {
    LedgerDirection,
    WalletLedgerEntry,
} from './wallet-ledger-entry.entity';
import { Wallet } from '../aggregates/wallet.aggregate';
import { LegacyRouteConverter } from '@nestjs/core/internal';

describe('WalletLedgerEntry Entity', () => {
    const baseProps = {
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        money: Money.from({ amount: '30.00', currency: 'BRL'}),
    };

    it('deve criar uma entrada de crédito válida e verificar balanceamento', () => {
        const entry = WalletLedgerEntry.create({
            ...baseProps,
            direction: LedgerDirection.Credit,
            balanceBefore: Money.from({ amount: '100.00', currency: 'BRL'}),
            balanceAfter: Money.from({ amount: '130.00', currency: 'BRL'}),
        });

        expect(entry.id).toBe('entry-1');
        expect(entry.direction).toBe(LedgerDirection.Credit);
        expect(entry.isBalanced()).toBe(true);
    });

    it('deve criar uma entrada de débito válida e verificar balanceamento', () => {
        const entry = WalletLedgerEntry.create({
            ...baseProps,
            direction: LedgerDirection.Debit,
            balanceBefore: Money.from({ amount: '100.00', currency: 'BRL'}),
            balanceAfter: Money.from({ amount: '70.00', currency: 'BRL'}),
        });

        expect(entry.direction).toBe(LedgerDirection.Debit);
        expect(entry.isBalanced()).toBe(true);
    });

    it('deve lançar erro ao tentar criar um crédito desbalanceado', () => {
        expect(() =>
            WalletLedgerEntry.create({
                ...baseProps,
                direction: LedgerDirection.Credit,
                balanceBefore: Money.from({ amount: '100.00', currency: 'BRL'}),
                // Erro: 100 + 30 seria 130, mas está sendo enviado 150
                balanceAfter: Money.from({ amount: '150.00', currency: 'BRL'}),
            }),
        ).toThrow('Inconsistência no ledger');
    });

    it('deve lançar erro ao tentar criar um débito desbalanceado', () => {
        expect(() =>
            WalletLedgerEntry.create({
                ...baseProps,
                direction: LedgerDirection.Debit,
                balanceBefore: Money.from({ amount: '100.00', currency: 'BRL'}),
                //Erro: 100 - 30 seria 70, mas está sendo enviado 50
                balanceAfter: Money.from({ amount: '50.00', currency: 'BRL'}),
            }),
        ).toThrow('Inconsistência no ledger');
    });
});
