import { Type, Platform, EntityProperty } from '@mikro-orm/core';
import Decimal from 'decimal.js';

export class DecimalType extends Type<Decimal, string> {
    public getColumnType(prop: EntityProperty, platform: Platform): string {
        return 'decimal(15,2)';
    }

    public convertToJSValue(value: string | Decimal, platform: Platform): Decimal {
        if (value instanceof Decimal) {
            return value;
        }

        return new Decimal(value);
    }

    public convertToDatabaseValue(value: Decimal | string, platform: Platform): string {
        if (value instanceof Decimal) {
            return value.toFixed(2);
        }

        return value;
    }
}