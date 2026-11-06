import { Money } from '../value-objects/money.value-object';

export enum LedgerDirection {
    Debit = 'DEBIT',
    Credit = 'CREDIT',
}

export interface CreateLedgerEntryProps {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
}

export interface LedgerEntryState {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
}

export class WalletLedgerEntry {
    private constructor(
        public readonly id: string,
        public readonly walletId: string,
        public readonly transactionId: string,
        public readonly direction: LedgerDirection,
        public readonly money: Money,
        public readonly balanceBefore: Money,
        public readonly balanceAfter: Money,
        public readonly createdAt: Date,
    ) {}

    public static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
        const entry = new WalletLedgerEntry(
            props.id,
            props.walletId,
            props.transactionId,
            props.direction,
            props.money,
            props.balanceBefore,
            props.balanceAfter,
            new Date(),
        );

        if (!entry.isBalanced()) {
            throw new Error('Inconsistência no ledger: o saldo antes e depois não bate com o valor da operação');
        }

        return entry;
    }

    public static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
        return new WalletLedgerEntry(
            state.id,
            state.walletId,
            state.transactionId,
            state.direction,
            state.money,
            state.balanceBefore,
            state.balanceAfter,
            state.createdAt,
        );
    }

    public isBalanced(): boolean {
        if (this.direction === LedgerDirection.Credit) {
            return this.balanceBefore.add(this.money).equals(this.balanceAfter);
        }
        return this.balanceBefore.subtract(this.money).equals(this.balanceAfter);
    }
}