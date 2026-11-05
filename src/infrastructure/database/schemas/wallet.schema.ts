import { EntitySchema } from '@mikro-orm/core';
import { Wallet } from '../../../domain/wallet/aggregates/wallet.aggregate';
import { MoneySchema } from './money.schema';

export const WalletSchema = new EntitySchema<any>({
    class: Wallet as any,
    tableName: 'wallets',
    properties: {
        id: { 
            type: 'uuid', 
            primary: true 
        },
        playerId: { 
            type: 'string' 
        },
        currency: { 
            type: 'string', 
            length: 3 
        },
        _balance: {
            kind: 'embedded',
            entity: () => MoneySchema.class,
            prefix: 'balance_',
        },
        _version: { 
            type: 'integer',
            version: true 
        },
        createdAt: { 
            type: 'datetime' 
        },
        _updatedAt: { 
            type: 'datetime',
            onUpdate: () => new Date()
        },
    },
    uniques: [
        { properties: ['playerId', 'currency'] }
    ],
    checks: [
        { name: 'wallets_balance_non_negative', expression: 'balance_amount >= 0' }
    ]
});