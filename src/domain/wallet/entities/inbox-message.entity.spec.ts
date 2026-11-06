import { describe, expect, it } from 'bun:test';
import { InboxMessage } from './inbox-message.entity';

describe('InboxMessage Entity', () => {
    it('deve receber uma nova mensagem e inicializar como não processada', () => {
        const message = InboxMessage.receive({
            messageId: 'msg-123',
            consumerName: 'wager-processor',
            payloadHash:'hash-xyz',
        });

        expect(message.messageId).toBe('msg-123');
        expect(message.consumerName).toBe('wager-processor');
        expect(message.payloadHash).toBe('hash-xyz');
        expect(message.receivedAt).toBeDefined();
        expect(message.isProcessed()).toBe(false);
        expect(message.processedAt).toBeUndefined();
    });

    it('deve marcar a mensagem como processada e registrar a data', () => {
        const message = InboxMessage.receive({
            messageId: 'msg-123',
            consumerName: 'wager-processor',
            payloadHash:'hash-xyz',
        });

        message.markProcessed();

        expect(message.isProcessed()).toBe(true);
        expect(message.processedAt).toBeDefined();
    });

    it('deve lançar erro ao tentar processar uma mensagem já processada', () => {
        const message = InboxMessage.receive({
            messageId: 'msg-123',
            consumerName: 'wager-processor',
            payloadHash:'hash-xyz',
        });

        message.markProcessed(); // Primeiro processamento funciona

        // Segundo processamento deve falhar
        expect(() => message.markProcessed()).toThrow('Mensagem já foi processada.');
    });

    it('deve reidratar uma mensagem a partir do estado persistido', () => {
        const state = {
            messageId: 'msg-1',
            consumerName: 'consumer-1',
            payloadHash: 'hash-1',
            receivedAt: new Date('2026-01-01T10:00:00Z'),
            processedAt: new Date('2026-01-01T10:01:00Z'),
        };

        const message = InboxMessage.rehydrate(state);

        expect(message.messageId).toBe(state.messageId);
        expect(message.consumerName).toBe(state.consumerName);
        expect(message.payloadHash).toBe(state.payloadHash);
        expect(message.receivedAt).toEqual(state.receivedAt);
        expect(message.processedAt).toEqual(state.processedAt);
        expect(message.isProcessed()).toBe(true);
    });
});