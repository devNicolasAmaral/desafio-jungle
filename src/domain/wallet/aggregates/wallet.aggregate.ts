import { Money } from '../value-objects/money.value-object';

export interface WalletProps {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerId: string,
        public readonly currency: string,
        public _balance: Money,
        public _version: number,
        public readonly createdAt: Date,
        public _updatedAt: Date,
    ) {}

    public static open(props: { id: string; playerId: string; initialBalance: Money }): Wallet {
        if (props.initialBalance.isNegative()) {
            throw new Error('O saldo inicial da carteira não pode ser negativo.');
        }

        const now = new Date();
        return new Wallet(
            props.id,
            props.playerId,
            props.initialBalance.currency,
            props.initialBalance,
            1,
            now,
            now,
        );
    }

    public static rehydrate(props: WalletProps): Wallet {
        return new Wallet(
            props.id,
            props.playerId,
            props.currency,
            props.balance,
            props.version,
            props.createdAt,
            props.updatedAt,
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

        if (!amount.isPositive()) {
            throw new Error('O valor do débito deve ser positivo.');
        }

        if (this._balance.isLessThan(amount)) {
            throw new Error('Saldo insuficiente.');
        }

        this._balance = this._balance.subtract(amount);
        this._version += 1;
        this._updatedAt = new Date();
    }

    public credit(amount: Money): void {
        this.assertSameCurrency(amount);

        if (!amount.isPositive()) {
            throw new Error('O valor do crédito deve ser positivo.');
        }

        this._balance = this._balance.add(amount);
        this._version += 1;
        this._updatedAt = new Date();
    }

    private assertSameCurrency(money: Money): void {
        if (this.currency !== money.currency) {
            throw new Error(`Moedas diferentes: a carteira é em ${this.currency} e a operação em ${money.currency}.`);
        }
    }
}