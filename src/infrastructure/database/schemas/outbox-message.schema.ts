import { EntitySchema } from '@mikro-orm/core';
import { OutboxMessage } from '../../../domain/wallet/entities/outbox-message.entity';

export const OutboxMessageSchema = new EntitySchema<any>({
    class: OutboxMessage as any,
    tableName: 'outbox_messages',
    properties: {
        id: {
            type: 'uuid',
            primary: true
        },
        aggregateId: {
            type: 'string'
        },
        eventType: {
            type: 'string'
        },
        payload: {
            type: 'jsonb'
        },
        occurredAt: {
            type: 'datetime'
        },
        _attempts: {
            type: 'integer',
            fieldName: 'attempts'
        },
        _nextAttemptAt: {
            type: 'datetime',
            nullable: true,
            fieldName: 'next_attempt_at'
        },
        _publishedAt: {
            type: 'datetime',
            nullable: true,
            fieldName: 'published_at'
        },
    },
    indexes: [
        { properties: ['_publishedAt', '_nextAttemptAt'] }
    ]
});