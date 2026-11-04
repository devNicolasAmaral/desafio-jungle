import Decimal from "decimal.js";

export interface MoneyProps {
    amount: string;
    currency: string;
}

export class Money {
    private constructor(
        private readonly value: Decimal,
        public readonly currency: string
    ) {}

    public static from(props: MoneyProps): Money {
        const currency = props.currency?.trim().toUpperCase();
        if (!currency || currency.length !== 3) {
            throw new Error('Moeda inválida. Deve seguir o padrão ISO-4217 de 3 letras.');
        }

        const amountStr = props.amount;
        if (typeof amountStr !== 'string' || amountStr.trim() === '') {
            throw new Error('O valor (amount) deve ser uma string decimal válida.');
        }

        if (!/^\d+(\.\d{1,2})?$/.test(amountStr.trim())) {
            throw new Error('O valor (amount) deve ser um número decimal não negativo com no máximo 2 casas decimais.');
        }

        const decimalValue = new Decimal(amountStr.trim());

        if (!decimalValue.isFinite() || decimalValue.isNaN()) {
            throw new Error('O valor (amount) é um número inválido.');
        }

        return new Money(decimalValue, currency);
    }

    public static zero(currency: string): Money {
        return Money.from({ amount: '0.00', currency });
    }

    public add(other: Money): Money {
        this.assertSameCurrency(other);
        const result = this.value.plus(other.value);
        return new Money(result, this.currency);
    }

    public subtract(other:Money): Money {
        this.assertSameCurrency(other);
        const result = this.value.minus(other.value);
        return new Money(result, this.currency);
    }

    public negate(): Money {
        return new Money(this.value.negated(), this.currency);
    }

    private assertSameCurrency(other: Money): void {
        if (this.currency !== other.currency) {
            throw new Error(`Moedas diferentes: ${this.currency} e ${other.currency}`);
        }
    }

    public isZero(): boolean {
        return this.value.isZero();
    }

    public isPositive(): boolean {
        return this.value.isPositive() && !this.isZero();
    }

    public isNegative(): boolean {
        return this.value.isNegative();
    }

    public isLessThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.value.lessThan(other.value);
    }

    public equals(other: Money): boolean {
        return this.currency === other.currency && this.value.equals(other.value);
    }

    public toJSON(): MoneyProps {
        return {
            amount: this.value.toFixed(2),
            currency: this.currency,
        };
    }

    public toString(): string {
        return `${this.value.toFixed(2)} ${this.currency}`;
    }
}