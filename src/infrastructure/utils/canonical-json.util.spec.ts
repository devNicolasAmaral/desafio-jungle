import { describe, expect, it } from 'bun:test';
import { canonicalJson } from './canonical-json.util';

describe('canonicalJson', () => {
    it('deve serializar primitivos diretamente', () => {
        expect(canonicalJson('abc')).toBe('"abc"');
        expect(canonicalJson(42)).toBe('42');
        expect(canonicalJson(true)).toBe('true');
        expect(canonicalJson(null)).toBe('null');
    });

    it('deve ordenar chaves de objetos alfabeticamente', () => {
        expect(canonicalJson({ b: 2, a: 1, c: 3 })).toBe('{"a":1,"b":2,"c":3}');
    });

    it('deve omitir chaves com valor undefined', () => {
        expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
    });

    it('deve preservar a ordem de arrays', () => {
        expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    });

    it('deve serializar objetos aninhados recursivamente com chaves ordenadas', () => {
        expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    });

    it('deve produzir a mesma string para payloads com ordem de chaves diferente', () => {
        const a = { providerId: 'p', amount: '10.00', currency: 'BRL' };
        const b = { currency: 'BRL', amount: '10.00', providerId: 'p' };
        expect(canonicalJson(a)).toBe(canonicalJson(b));
    });

    it('deve lançar erro ao receber undefined no nível raiz', () => {
        expect(() => canonicalJson(undefined)).toThrow();
    });
});