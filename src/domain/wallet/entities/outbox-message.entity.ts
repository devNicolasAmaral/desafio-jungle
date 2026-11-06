import { IntegrationEvent } from "../events/integration-event.base";

export interface OutboxMessageState {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    occurredAt: Date;
    attempts: number;
    nextAttemptAt?: Date;
    publishedAt?: Date;
}

export class OutboxMessage {
    private constructor(
        public readonly id: string,
        public readonly aggregateId: string,
        public readonly eventType: string,
        public readonly payload: Readonly<Record<string, unknown>>,
        public readonly occurredAt: Date,
        private _attempts: number,
        private _nextAttemptAt?: Date,
        private _publishedAt?: Date,
    ) {}

    public static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
        return new OutboxMessage(
            event.eventId,
            event.aggregateId,
            event.eventType,
            event.toJSON() as Record<string, unknown>,
            event.occurredAt,
            0,
            new Date(),
        );
    }

    public static rehydrate(state: OutboxMessageState): OutboxMessage {
        return new OutboxMessage(
            state.id,
            state.aggregateId,
            state.eventType,
            state.payload,
            state.occurredAt,
            state.attempts,
            state.nextAttemptAt,
            state.publishedAt,
        );
    }

    get attempts(): number {
        return this._attempts;
    }

    get nextAttemptAt(): Date | undefined {
        return this._nextAttemptAt;
    }

    get publishedAt(): Date | undefined {
        return this._publishedAt;
    }

    public isPending(): boolean {
        return this._publishedAt == undefined;
    }

    public isDue(now: Date = new Date()): boolean {
        return this.isPending() && this._nextAttemptAt !== undefined && this._nextAttemptAt <= now;
    }

    public markPublished(at: Date = new Date()): void {
        if (!this.isPending()) {
            throw new Error('Mensagem já foi publicada.');
        }
        this._publishedAt = at;
    }

    public scheduleRetry(now: Date = new Date()): void {
        this._attempts += 1;
        const backoffSeconds = Math.pow(2, this._attempts);
        const nextAttempt = new Date(now.getTime() + backoffSeconds * 1000);
        this._nextAttemptAt = nextAttempt;
    }
}