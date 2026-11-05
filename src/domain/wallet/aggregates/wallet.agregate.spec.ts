import {describe, expect, it} from 'bun:test';
import {Money} from '../value-objects/money.value-object';
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

    it('deve realizar debito com sucesso, incrementar versão e atualizar updatedAt', () => {
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

    it('deve realizar crédito com sucesso e incrementr versão', () => {
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
});