import { describe, expect, it } from 'bun:test';
import { Money } from '../value-objects/money.value-object';
import { Wallet } from './wallet.aggregate';

describe('Wallet Aggregate Root', () => {
    it('deve abrir uma nova carteira com saldo inicial e versão 1', () => {
        const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance,
        });

        expect(wallet.id).toBe('wallet-1');
        expect(wallet.playerId).toBe('player-1');
        expect(wallet.currency).toBe('BRL');
        expect(wallet.balance.toJSON().amount).toBe('100.00');
        expect(wallet.version).toBe(1);
    });

    it('deve reidratar uma carteira a partir do estado persistido', () => {
        const now = new Date();
        const balance = Money.from({ amount: '250.00', currency: 'BRL' });
        
        const wallet = Wallet.rehydrate({
            id: 'wallet-2',
            playerId: 'player-2',
            currency: 'BRL',
            balance,
            version: 5,
            createdAt: now,
            updatedAt: now,
        });

        expect(wallet.id).toBe('wallet-2');
        expect(wallet.playerId).toBe('player-2');
        expect(wallet.currency).toBe('BRL');
        expect(wallet.balance.toJSON().amount).toBe('250.00');
        expect(wallet.version).toBe(5);
        expect(wallet.createdAt).toBe(now);
        expect(wallet.updatedAt).toBe(now);
    });

    it('deve realizar débito com sucesso, incrementar versão e atualizar updatedAt', () => {
        const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance,
        });
        
        const debitAmount = Money.from({ amount: '40.00', currency: 'BRL' });
        wallet.debit(debitAmount);

        expect(wallet.balance.toJSON().amount).toBe('60.00');
        expect(wallet.version).toBe(2);
    });

    it('deve lançar erro ao tentar debitar mais do que o saldo disponível', () => {
        const initialBalance = Money.from({ amount: '50.00', currency: 'BRL' });
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance,
        });

        const excessiveDebit = Money.from({ amount: '60.00', currency: 'BRL' });

        expect(() => wallet.debit(excessiveDebit)).toThrow('Saldo insuficiente.');
        expect(wallet.balance.toJSON().amount).toBe('50.00');
        expect(wallet.version).toBe(1);
    });

    it('deve realizar crédito com sucesso e incrementar versão', () => {
        const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance,
        });
    
        const creditAmount = Money.from({ amount: '50.00', currency: 'BRL' });
        wallet.credit(creditAmount);

        expect(wallet.balance.toJSON().amount).toBe('150.00');
        expect(wallet.version).toBe(2);
    });

    it('deve rejeitar operações com moeda diferente da wallet', () => {
        const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance,
        });

        const usdMoney = Money.from({ amount: '10.00', currency: 'USD' });

        expect(() => wallet.debit(usdMoney)).toThrow('Moedas diferentes: a carteira é em BRL e a operação em USD.');
        expect(() => wallet.credit(usdMoney)).toThrow(`Moedas diferentes: a carteira é em ${wallet.currency} e a operação em ${usdMoney.currency}.`);
    });

    it('deve rejeitar abertura de carteira com saldo inicial negativo', () => {
        const negative = Money.from({ amount: '100.00', currency: 'BRL' }).negate();

        expect(() => Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance: negative,
        })).toThrow('O saldo inicial da carteira não pode ser negativo.');
    });

    it('deve rejeitar débito com valor zero', () => {
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        });

        expect(() => wallet.debit(Money.zero('BRL'))).toThrow('O valor do débito deve ser positivo.');
    });

    it('deve rejeitar crédito com valor zero', () => {
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        });

        expect(() => wallet.credit(Money.zero('BRL'))).toThrow('O valor do crédito deve ser positivo.');
    });
});