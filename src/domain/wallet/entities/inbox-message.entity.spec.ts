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
});