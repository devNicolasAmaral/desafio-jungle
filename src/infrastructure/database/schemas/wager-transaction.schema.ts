import { EntitySchema } from '@mikro-orm/core';
import { WagerTransaction } from '../../../domain/wallet/entities/wager-transaction.entity';
import { MoneySchema } from './money.schema';

export const WagerTransactionSchema = new EntitySchema<any>({
    class: WagerTransaction as any,
    tableName: 'wager_transactions',
    properties: {
        id: { 
            type: 'uuid', 
            primary: true 
        },
        providerId: { 
            type: 'string' 
        },
        externalTransactionId: { 
            type: 'string' 
        },
        idempotencyKey: { 
            type: 'string',
            unique: true 
        },
        payloadHash: { 
            type: 'string' 
        },
        walletId: { 
            type: 'uuid' 
        },
        playerId: { 
            type: 'string' 
        },
        roundId: { 
            type: 'string' 
        },
        gameId: { 
            type: 'string' 
        },
        kind: { 
            type: 'string' 
        },
        money: {
            kind: 'embedded',
            entity: () => MoneySchema.class,
            prefix: false,
        },
        referenceExternalTransactionId: { 
            type: 'string', 
            nullable: true 
        },
        createdAt: { 
            type: 'datetime' 
        },
        _status: { 
            type: 'string',
            fieldName: 'status'
        },
        _referenceTransactionId: { 
            type: 'uuid', 
            nullable: true,
            fieldName: 'reference_transaction_id'
        },
        _failureCode: { 
            type: 'string', 
            nullable: true,
            fieldName: 'failure_code'
        },
        _processedAt: { 
            type: 'datetime', 
            nullable: true,
            fieldName: 'processed_at'
        },
    },
    indexes: [
        { properties: ['walletId'] },
        { properties: ['providerId', 'externalTransactionId'] }
    ]
});