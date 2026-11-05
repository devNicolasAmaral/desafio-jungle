import { EntitySchema } from '@mikro-orm/core';
import { WalletLedgerEntry } from '../../../domain/wallet/entities/wallet-ledger-entry.entity';
import { MoneySchema } from './money.schema';

export const WalletLedgerEntrySchema = new EntitySchema<any>({
    class: WalletLedgerEntry as any,
    tableName: 'wallet_ledger_entries',
    properties: {
        id: {
            type: 'uuid',
            primary: true
        },
        walletId: {
            type: 'uuid'
        },
        transactionId: {
            type: 'uuid'
        },
        direction: {
            type: 'string'
        },
        money: {
            kind: 'embedded',
            entity: () => MoneySchema.class,
            prefix: 'money_',
        },
        balanceBefore: {
            kind: 'embedded',
            entity: () => MoneySchema.class,
            prefix: 'balance_before_',
        },
        balanceAfter: {
            kind: 'embedded',
            entity: () => MoneySchema.class,
            prefix: 'balance_after_',
        },
        createdAt: {
            type: 'datetime'
        },
    },
    indexes: [
        { properties: ['walletId'] },
        { properties: ['transactionId'] }
    ]
});