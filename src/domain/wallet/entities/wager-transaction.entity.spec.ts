import { describe, expect, it} from 'bun:test';
import { Money} from '../value-objects/money.value-object';
import {
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from './wager-transaction.entity';
import { t } from '@mikro-orm/core';

describe('WagerTransaction Entity', () => {
    const baseProps = {
        id: 'txn-1',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walledId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
    };

    it('deve criar uma transação de aposta inicial em estado PENDING', () => {
        const txn = WagerTransaction.create({
            ...baseProps,
            kind: WagerTransactionKind.Bet,
        });

        expect(txn.id).toBe('txn-1');
        expect(txn.status).toBe(WagerTransactionStatus.Pending);
        expect(txn.isTerminal()).toBe(false);
        expect(txn.affectsBalance()).toBe(true)
        expect(txn.requiresReference()).toBe(false);
    });

    it('deve exigir referenceExternalTransactionId ao criar REFUND ou ROLLBACK', () =>{
        expect(() =>
        WagerTransaction.create({
            ...baseProps,
            kind: WagerTransactionKind.Refund,
        }),
    ).toThrow('exige uma transação de referência');

    const refundTxn = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'ext-bet-1',
    });

    expect(refundTxn.status).toBe(WagerTransactionStatus.Pending);
    expect(refundTxn.requiresReference()).toBe(true);
    });

    it('não deve afetar o saldo em caso de LOSS', () => {
        const lossTxn = WagerTransaction.create({
            ...baseProps,
            kind: WagerTransactionKind.Loss,
        });

        expect (lossTxn.affectsBalance()).toBe(false);
    });

    it('deve transicionar para PROCESSED corretamente', () => {
        const txn = WagerTransaction.create({
            ...baseProps,
            kind: WagerTransactionKind.Bet,
        });

        txn.markProcessed();
        expect(txn.status).toBe(WagerTransactionStatus.Processed);
        expect(txn.isTerminal()).toBe(true);
        expect(txn.processedAt).toBeDefined();
    });

    it('deve transicionar para PENDING_REFERENCE e depois permitir falha ou sucesso', () => {
        const txn = WagerTransaction.create({
            ...baseProps,
            kind: WagerTransactionKind.Refund,
            referenceExternalTransactionId: 'missing-bet-1',
        });

        txn.markPendingReference();
        expect(txn.status).toBe(WagerTransactionStatus.PendingReference);
        expect(txn.isTerminal()).toBe(false);

        //Permite transição pois PENDING_REFERENCE não é terminal
        txn.reject('REFERENCE_NOT_FOUND');
        expect(txn.status).toBe(WagerTransactionStatus.Rejected);
        expect(txn.failureCode).toBe('REFERENCE_NOT_FOUND');
    });

    it('deve lancar erro ao tentar alterar o estado de uma transacao que ja esta em estado terminal', () => {
    const txn = WagerTransaction.create({
      ...baseProps,
      kind: WagerTransactionKind.Bet,
    });

    txn.fail('INTERNAL_ERROR');
    expect(txn.status).toBe(WagerTransactionStatus.Failed);
    expect(txn.isTerminal()).toBe(true);

    // Tentar processar depois de falhar deve lançar erro
    expect(() => txn.markProcessed()).toThrow('já está em estado terminal');
    // Tentar rejeitar depois de falhar também deve lançar erro
    expect(() => txn.reject('INSUFFICIENT_FUNDS')).toThrow('já está em estado terminal');
  });

  it('deve identificar validacao de payload match', () => {
    const txn = WagerTransaction.create({
      ...baseProps,
      kind: WagerTransactionKind.Bet,
    });

    expect(txn.matchesPayload('hash-abc')).toBe(true);
    expect(txn.matchesPayload('hash-diferente')).toBe(false);
  });
});