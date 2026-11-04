import {describe, expect, it } from 'bun:test';
import { Money } from './money.value-objects'; 

describe('Money Value Object', () => {
    it('deve criar uma instância válida de Money', () => {
        const money = Money.from({ amount: '25.00', currency: 'BRL' });
        expect(money.toString()).toBe('25.00 BRL');
        expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });

    it('deve formatar valores para sempre manterem 2 casas decimais', () => {
        const money = Money.from({ amount: '10.5', currency: 'BRL' });
        expect(money.toJSON()).toEqual({ amount: '10.50', currency: 'BRL' });
    });

    it('deve rejeitar entradas inválidas de amount', () => {
        expect(() => Money.from({ amount: 'invalid', currency: 'BRL' })).toThrow();
        expect(() => Money.from({ amount: '10.509', currency: 'BRL' })).toThrow();
        expect(() => Money.from({ amount: '-50.00', currency: 'BRL' })).toThrow();
        expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow();
    });

    it('deve realizar adição e subtração corretamente mantendo a imutabilidade', () => {
        const initial = Money.from({ amount: '100.00', currency: 'BRL' });
        const bet = Money.from({ amount: '30.00', currency: 'BRL' });
        
        const remaining = initial.subtract(bet);
        expect(remaining.toJSON().amount).toBe('70.00');
        expect(initial.toJSON().amount).toBe('100.00');

        const winner = remaining.add(Money.from({ amount: '50.00', currency: 'BRL' }));
        expect(winner.toJSON().amount).toBe('120.00');
    });

    it('deve lançar erro ao operar entre moedas diferentes', () => {
        const brl = Money.from({ amount: '100.00', currency: 'BRL' });
        const usd = Money.from({ amount: '50.00', currency: 'USD' });

        expect(() => brl.add(usd)).toThrow('Moedas diferentes');
        expect(() => brl.subtract(usd)).toThrow('Moedas diferentes');
    });

    it('deve comparar valores corretamente com equals e isLessThan', () => {
        const m1 = Money.from({ amount: '50.00', currency: 'BRL' });
        const m2 = Money.from({ amount: '100.00', currency: 'BRL' });
        const m3 = Money.from({ amount: '50.00', currency: 'BRL' });

        expect(m1.isLessThan(m2)).toBe(true);
        expect(m2.isLessThan(m1)).toBe(false);
        expect(m1.equals(m3)).toBe(true);
        expect(m1.equals(m2)).toBe(false);
    });
});