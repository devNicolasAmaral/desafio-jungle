import { IntegrationEvent, IntegrationEventProps } from './integration-event.base';
import { Wallet } from '../aggregates/wallet.aggregate';
import { WalletLedgerEntry } from '../entities/wallet-ledger-entry.entity';

export interface WalletBalanceChangedData {
    walletId: string;
    transactionId: string;
    direction: string;
    money: { amount: string; currency: string };
    balanceBefore: { amount: string; currency: string };
    balanceAfter: { amount: string; currency: string };
    walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
    readonly eventType = 'WalletBalanceChanged';
    readonly version = 1;

    constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
        super(props);
    }

    public static from(
        wallet: Wallet,
        entry: WalletLedgerEntry,
        correlationId: string,
    ): WalletBalanceChanged {
        return new WalletBalanceChanged({
            eventId: crypto.randomUUID(),
            aggregateId: wallet.id,
            correlationId,
            occurredAt: new Date(),
            data: {
                walletId: wallet.id,
                transactionId: entry.transactionId,
                direction: entry.direction,
                money: entry.money.toJSON(),
                balanceBefore: entry.balanceBefore.toJSON(),
                balanceAfter: entry.balanceAfter.toJSON(),
                walletVersion: wallet.version,
            },
        });
    }
}