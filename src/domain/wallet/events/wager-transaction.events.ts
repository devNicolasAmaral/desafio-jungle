import { IntegrationEvent, IntegrationEventProps } from './integration-event.base';

export interface WagerTransactionEventData {
    transactionId: string;
    walletId: string;
    kind: string;
    status: string;
    money: { amount: string; currency: string };
    newBalance?: { amount: string; currency: string };
    failureCode?: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionEventData> {
    readonly eventType = 'WagerTransactionProcessed';
    readonly version = 1;

    constructor(props: IntegrationEventProps<WagerTransactionEventData>) {
        super(props);
    }
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionEventData> {
    readonly eventType = 'WagerTransactionPendingReference';
    readonly version = 1;

    constructor(props: IntegrationEventProps<WagerTransactionEventData>) {
        super(props);
    }
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionEventData> {
    readonly eventType = 'WagerTransactionRejected';
    readonly version = 1;

    constructor(props: IntegrationEventProps<WagerTransactionEventData>) {
        super(props);
    }
}