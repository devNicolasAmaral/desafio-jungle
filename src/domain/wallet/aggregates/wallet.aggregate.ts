import { Money } from '../value-objects/money.value-objects';

export interface WalletProps {
    id: string;
    playerID: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerID: string,
        public readonly currency: string,
        public  _balance: Money,
        public  _version: number,
        public readonly createdAt: Date,
        public  _updatedAt: Date
    ) {}

    public static open(props: { id: string; playerID: string; initialBalance: Money }) : Wallet {
        const now = new Date();
        return new Wallet(
            props.id,
            props.playerID,
            props.initialBalance.currency,
            props.initialBalance,
            1,
            now,
            now,
        );
    }

    get balance(): Money {
        return this._balance;
    }

    get version(): number {
        return this._version;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    public debit(amount: Money): void {
        this.assertSameCurrency(amount);

        if (this._balance.isLessThan(amount)) {
            throw new Error('Saldo insuficiente.');
        }

        this._balance = this._balance.subtract(amount);
        this._version += 1;
        this._updatedAt = new Date();
    }

    private assertSameCurrency(money: Money): void {
        if (this.currency !== money.currency) {
            throw new Error(`Moedas diferentes: a carteira é em ${this.currency} e a operação em ${money.currency}.`);
        }
    }

    public credit(amount: Money): void {
        this.assertSameCurrency(amount);

        this._balance = this._balance.add(amount);
        this._version += 1;
        this._updatedAt = new Date();
    }
}