import { describe, expect, it } from 'bun:test';
import { Money } from '../value-objects/money.value-object';
import { Wallet } from '../aggregates/wallet.aggregate';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry.entity';
import { WalletBalanceChanged } from '../events/wallet-balance-changed.event';
import { OutboxMessage } from './outbox-message.entity';

describe('OutboxMessage Entity', () => {
    const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL'}),
    });

    const entry = WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: wallet.id,
        transactionId: 'txn-1',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
    });

    const event = WalletBalanceChanged.from(wallet, entry, 'correlation-123');

    it('deve criar uma mensagem na outbox pronta para envio imediato', () => {
        const outbox = OutboxMessage.enqueue(event);

        expect(outbox.id).toBe(event.eventId);
        expect(outbox.aggregateId).toBe('wallet-1');
        expect(outbox.eventType).toBe('WalletBalanceChanged');
        expect(outbox.attempts).toBe(0);
        expect(outbox.isPending()).toBe(true);
        expect(outbox.publishedAt).toBeUndefined();
        expect(outbox.isDue(new Date())).toBe(true);
    });

    it('deve marcar a mensagem como publicada com sucesso', () => {
        const outbox = OutboxMessage.enqueue(event);
        outbox.markPublished();

        expect(outbox.isPending()).toBe(false);
        expect(outbox.publishedAt).toBeDefined();
        expect(outbox.isDue(new Date())).toBe(false);
    });

    it('deve agendar retry com backoff exponencial se o envio falhar', () => {
        const outbox = OutboxMessage.enqueue(event);
        const now = new Date('2026-01-01T10:00:00.000Z');

        // Backoff = 2^1 = 2 segundos
        outbox.scheduleRetry(now);
        expect(outbox.attempts).toBe(1);
        expect(outbox.nextAttemptAt?.toISOString()).toBe('2026-01-01T10:00:02.000Z');

        // Backoff = 2^2 = 4 segundos
        const secondAttempt = new Date('2026-01-01T10:00:02.000Z');
        outbox.scheduleRetry(secondAttempt);
        expect(outbox.attempts).toBe(2);
        expect(outbox.nextAttemptAt?.toISOString()).toBe('2026-01-01T10:00:06.000Z');
    });

    it('deve lançar erro ao tentar publicar uma mensagem já publicada', () => {
        const outbox = OutboxMessage.enqueue(event);
        outbox.markPublished();

        expect(() => outbox.markPublished()).toThrow('Mensagem já foi publicada.');
    });
});