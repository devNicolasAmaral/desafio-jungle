export interface ReceiveInboxProps {
    messageId: string;
    consumerName: string;
    payloadHash: string;
}

export class InboxMessage {
    private constructor(
        public readonly messageId: string,
        public readonly consumerName: string,
        public readonly payloadHash: string,
        public readonly receivedAt: Date,
        private _processedAt?: Date,
    ) {}


    public static receive(props: ReceiveInboxProps): InboxMessage {
        return new InboxMessage(
            props.messageId,
            props.consumerName,
            props.payloadHash,
            new Date(),
        );
    }

    get processedAt(): Date | undefined {
        return this._processedAt;
    }

    public isProcessed(): boolean {
        return this._processedAt !== undefined;
    }

    public markProcessed(at: Date = new Date()): void {
        if (this.isProcessed()) {
            throw new Error('Mensagem já foi processada.');
        }
        this._processedAt = at;
    }
}