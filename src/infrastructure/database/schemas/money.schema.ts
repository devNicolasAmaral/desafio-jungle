import { EntitySchema } from '@mikro-orm/core';
import { Money } from '../../../domain/wallet/value-objects/money.value-object';
import { DecimalType } from '../types/decimal.type';

export const MoneySchema = new EntitySchema<any>({
    class: Money as any,
    embeddable: true,
    properties: {
        value: { type: DecimalType, fieldName: 'amount' },
        currency: { type: 'string', fieldName: 'currency', length: 3 },
    },
});