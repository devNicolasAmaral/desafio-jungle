import { EntitySchema } from "@mikro-orm/core";
import { InboxMessage } from "../../../domain/wallet/entities/inbox-message.entity";

export const InboxMessageSchema = new EntitySchema<any>({
    class: InboxMessage as any,
    tableName: 'inbox_messages',
    properties: {
        messageId: {
            type: 'string',
            primary: true
        },
        consumerName: {
            type: 'string',
            primary: true
        },
        payloadHash: {
            type: 'string'
        },
        receivedAt: {
            type: 'datetime'
        },
        _processedAt: {
            type: 'datetime',
            nullable: true,
            fieldName: 'processed_at'
        },
    }
});