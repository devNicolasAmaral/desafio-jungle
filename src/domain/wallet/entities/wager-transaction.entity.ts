import { Money } from '../value-objects/money.value-object';
import { LedgerDirection } from './wallet-ledger-entry.entity';

export enum WagerTransactionKind {
    Opening = 'OPENING',
    Bet = 'BET',
    Win = 'WIN',
    Loss = 'LOSS',
    Refund = 'REFUND',
    Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
    Pending = 'PENDING',
    PendingReference = 'PENDING_REFERENCE',
    Processed = 'PROCESSED',
    Rejected = 'REJECTED',
    Failed = 'FAILED',
}

export type FailureCode = 
| 'INSUFFICIENT_FUNDS'
| 'REFERENCE_NOT_FOUND'
| 'INVALID_REFERENCE_TYPE'
| 'REFERENCE_ALREADY_REVERTED'
| 'REVERSAL_INSUFFICIENT_FUNDS'
| 'CURRENCY_MISMATCH'
| 'AMOUNT_MISMATCH'
| 'INVALID_PAYLOAD'
| 'INTERNAL_ERROR';

export interface CreateWagerTransactionProps {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
}

export interface WagerTransactionState {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    createdAt: Date;
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: FailureCode;
    processedAt?: Date;
}

export class WagerTransaction {
    private constructor(
        public readonly id: string,
        public readonly providerId: string,
        public readonly externalTransactionId: string,
        public readonly idempotencyKey: string,
        public readonly payloadHash: string,
        public readonly walletId: string,
        public readonly playerId: string,
        public readonly roundId: string,
        public readonly gameId: string,
        public readonly kind: WagerTransactionKind,
        public readonly money: Money,
        public readonly referenceExternalTransactionId: string | undefined,
        public readonly createdAt: Date,
        private _status: WagerTransactionStatus,
        private _referenceTransactionId?: string,
        private _failureCode?: FailureCode,
        private _processedAt?: Date,
    ) {}

    public static create(props: CreateWagerTransactionProps): WagerTransaction {
        const isReferenceRequired =
            props.kind === WagerTransactionKind.Refund ||
            props.kind === WagerTransactionKind.Rollback;
        
        if (isReferenceRequired && !props.referenceExternalTransactionId) {
            throw new Error (`A operação do tipo ${props.kind} exige uma transação de referência.`);
        }

        return new WagerTransaction(
            props.id,
            props.providerId,
            props.externalTransactionId,
            props.idempotencyKey,
            props.payloadHash,
            props.walletId,
            props.playerId,
            props.roundId,
            props.gameId,
            props.kind,
            props.money,
            props.referenceExternalTransactionId,
            new Date(),
            WagerTransactionStatus.Pending,
        );
    }

    public static rehydrate(state: WagerTransactionState): WagerTransaction {
        return new WagerTransaction(
            state.id,
            state.providerId,
            state.externalTransactionId,
            state.idempotencyKey,
            state.payloadHash,
            state.walletId,
            state.playerId,
            state.roundId,
            state.gameId,
            state.kind,
            state.money,
            state.referenceExternalTransactionId,
            state.createdAt,
            state.status,
            state.referenceTransactionId,
            state.failureCode,
            state.processedAt,
        );
    }


    get status(): WagerTransactionStatus {
        return this._status;
    }

    get referenceTransactionId(): string | undefined {
        return this._referenceTransactionId;
    }

    get failureCode(): FailureCode | undefined {
        return this._failureCode;
    }   

    get processedAt(): Date | undefined {
        return this._processedAt;
    }

    public isTerminal(): boolean {
        return (
            this._status === WagerTransactionStatus.Processed ||
            this._status === WagerTransactionStatus.Rejected ||
            this._status === WagerTransactionStatus.Failed
        );
    }

    public affectsBalance(): boolean {
        return this.kind !== WagerTransactionKind.Loss;
    }

    public requiresReference(): boolean {
        return (
            this.kind === WagerTransactionKind.Refund ||
            this.kind === WagerTransactionKind.Rollback
        );
    }

    public matchesPayload(payloadHash: string): boolean {
        return this.payloadHash === payloadHash;
    }

    public ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
        if (this.kind === WagerTransactionKind.Loss) {
            throw new Error('LOSS não afeta o saldo e não gera lançamento no ledger.');
        }
        if (this.kind === WagerTransactionKind.Bet) return LedgerDirection.Debit;
        if (this.kind === WagerTransactionKind.Win) return LedgerDirection.Credit;
        if (this.kind === WagerTransactionKind.Refund) return LedgerDirection.Credit;
        if (this.kind === WagerTransactionKind.Opening) return LedgerDirection.Credit;
        
        if (this.kind === WagerTransactionKind.Rollback && reference) {
            if (reference.kind === WagerTransactionKind.Bet) return LedgerDirection.Credit;
            if (reference.kind === WagerTransactionKind.Win) return LedgerDirection.Debit;
            if (reference.kind === WagerTransactionKind.Refund) return LedgerDirection.Debit;
        }

        throw new Error('Não foi possível determinar a direção do ledger para esta transação.');
    }

    public markProcessed(referenceTransactionId?: string, at: Date = new Date()): void {
        this.assertNotTerminal();
        this._status = WagerTransactionStatus.Processed;
        this._referenceTransactionId = referenceTransactionId;
        this._processedAt = at;
    }

    public markPendingReference(): void {
        this.assertNotTerminal();
        this._status = WagerTransactionStatus.PendingReference;
    }

    public reject(code: FailureCode): void {
        this.assertNotTerminal();
        this._status = WagerTransactionStatus.Rejected;
        this._failureCode = code;
        this._processedAt = new Date();
    }

    public fail(code: FailureCode): void {
        this.assertNotTerminal();
        this._status = WagerTransactionStatus.Failed;
        this._failureCode = code;
        this._processedAt = new Date();
    }

    private assertNotTerminal(): void {
        if (this.isTerminal()) {
            throw new Error(`Transação ${this.id} já está em estado terminal (${this._status}) e não pode ser alterada.`);
        }
    }
}