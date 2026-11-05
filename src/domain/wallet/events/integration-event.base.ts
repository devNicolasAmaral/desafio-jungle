export interface IntegrationEventProps<T> {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
    data: T;
}

export abstract class IntegrationEvent<T> {
    abstract readonly eventType: string;
    abstract readonly version: number;

    public readonly eventId: string;
    public readonly aggregateId: string;
    public readonly correlationId: string;
    public readonly causationId?: string;
    public readonly occurredAt: Date;
    public readonly data: Readonly<T>;

    protected constructor(props: IntegrationEventProps<T>) {
        this.eventId = props.eventId;
        this.aggregateId = props.aggregateId;
        this.correlationId = props.correlationId;
        this.causationId = props.causationId;
        this.occurredAt = props.occurredAt;
        this.data = props.data;
    }

    public toJSON() {
        return {
            eventId: this.eventId,
            EventType: this.eventType,
            aggregateId: this.aggregateId,
            correlationId: this.correlationId,
            causationId: this.causationId,
            occurredAt: this.occurredAt,
            version: this.version,
            data: this.data,
        };
    }
}
