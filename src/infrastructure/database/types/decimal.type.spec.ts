import { describe, expect, it } from 'bun:test';
import Decimal from 'decimal.js';
import { DecimalType } from './decimal.type';

describe('DecimalType', () => {
    const type = new DecimalType();
    const platform = {} as any;
    const prop = {} as any;

    describe('getColumnType', () => {
        it('deve retornar decimal(15,2)', () => {
            expect(type.getColumnType(prop, platform)).toBe('decimal(15,2)');
        });
    });

    describe('convertToDatabaseValue', () => {
        it('deve formatar Decimal com 2 casas decimais', () => {
            expect(type.convertToDatabaseValue(new Decimal('10.5'), platform)).toBe('10.50');
            expect(type.convertToDatabaseValue(new Decimal('10'), platform)).toBe('10.00');
        });

        it('deve arredondar valores com mais de 2 casas para o inteiro mais próximo', () => {
            expect(type.convertToDatabaseValue(new Decimal('10.999'), platform)).toBe('11.00');
            expect(type.convertToDatabaseValue(new Decimal('10.001'), platform)).toBe('10.00');
        });

        it('deve preservar zero com 2 casas', () => {
            expect(type.convertToDatabaseValue(new Decimal('0'), platform)).toBe('0.00');
        });

        it('deve preservar valores negativos', () => {
            expect(type.convertToDatabaseValue(new Decimal('-5.5'), platform)).toBe('-5.50');
        });

        it('deve preservar valores no limite do decimal(15,2)', () => {
            expect(type.convertToDatabaseValue(new Decimal('999999999999.99'), platform)).toBe('999999999999.99');
        });

        it('deve retornar string inalterada', () => {
            expect(type.convertToDatabaseValue('10.5', platform)).toBe('10.5');
            expect(type.convertToDatabaseValue('10.50', platform)).toBe('10.50');
        });
    });

    describe('convertToJSValue', () => {
        it('deve converter string para Decimal', () => {
            const result = type.convertToJSValue('10.50', platform);
            expect(result).toBeInstanceOf(Decimal);
            expect(result.toString()).toBe('10.5');
        });

        it('deve ser idempotente ao receber Decimal', () => {
            const value = new Decimal('10.50');
            const result = type.convertToJSValue(value, platform);
            expect(result).toBe(value);
        });

        it('deve converter zero corretamente', () => {
            const result = type.convertToJSValue('0.00', platform);
            expect(result.toString()).toBe('0');
        });
    });

    describe('round-trip', () => {
        it('deve preservar valor apos conversao de ida e volta', () => {
            const original = new Decimal('123.45');
            const database = type.convertToDatabaseValue(original, platform);
            const back = type.convertToJSValue(database, platform);
            expect(back.toString()).toBe(original.toString());
        });

        it('deve preservar zero no round-trip', () => {
            const original = new Decimal('0.00');
            const database = type.convertToDatabaseValue(original, platform);
            const back = type.convertToJSValue(database, platform);
            expect(back.toString()).toBe('0');
        });
    });
});