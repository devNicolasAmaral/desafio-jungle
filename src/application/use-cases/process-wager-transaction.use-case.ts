import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../domain/wallet/entities/wager-transaction.entity';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/wallet/entities/wallet-ledger-entry.entity';
import { OutboxMessage } from '../../domain/wallet/entities/outbox-message.entity';
import { WagerTransactionProcessed, WagerTransactionPendingReference, WagerTransactionRejected } from '../../domain/wallet/events/wager-transaction.events';
import { WalletBalanceChanged } from '../../domain/wallet/events/wallet-balance-changed.event';

export interface ProcessWagerTransactionInput {
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

export interface ProcessWagerTransactionOutput {
    transaction: WagerTransaction;
    idempotentReplay: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
    constructor(private readonly em: EntityManager) {}

    async execute(input: ProcessWagerTransactionInput, externalEm?: EntityManager): Promise<ProcessWagerTransactionOutput> {
        const manager = externalEm || this.em;
        return manager.transactional(async (em) => {
            const wallet = await em.findOne(Wallet as any, { id: input.walletId }, {
                lockMode: LockMode.PESSIMISTIC_WRITE
            }) as Wallet | null;

            if (!wallet) {
                throw new Error('Carteira não encontrada.');
            }

            const existingTx = await em.findOne(WagerTransaction as any, { 
                idempotencyKey: input.idempotencyKey 
            }) as WagerTransaction | null;

            if (existingTx) {
                if (!existingTx.matchesPayload(input.payloadHash)) {
                    throw new Error('Conflito de idempotência: a chave já foi usada com um payload diferente.');
                }

                if (existingTx.status === WagerTransactionStatus.PendingReference) {
                    return this.attemptProcessing(em, wallet, existingTx);
                }

                return { transaction: existingTx, idempotentReplay: true };
            }

            const transaction = WagerTransaction.create({
                id: crypto.randomUUID(),
                providerId: input.providerId,
                externalTransactionId: input.externalTransactionId,
                idempotencyKey: input.idempotencyKey,
                payloadHash: input.payloadHash,
                walletId: input.walletId,
                playerId: input.playerId,
                roundId: input.roundId,
                gameId: input.gameId,
                kind: input.kind,
                money: input.money,
                referenceExternalTransactionId: input.referenceExternalTransactionId,
            });

            em.persist(transaction as any);
            return this.attemptProcessing(em, wallet, transaction);
        });
    }

    private async attemptProcessing(
        em: EntityManager,
        wallet: Wallet,
        transaction: WagerTransaction,
    ): Promise<ProcessWagerTransactionOutput> {
        let referenceTx: WagerTransaction | null = null;

        if (transaction.requiresReference()) {
            referenceTx = await em.findOne(WagerTransaction as any, {
                providerId: transaction.providerId,
                externalTransactionId: transaction.referenceExternalTransactionId,
            }) as WagerTransaction | null;

            if (!referenceTx) {
                if (transaction.status !== WagerTransactionStatus.PendingReference) {
                    transaction.markPendingReference();
                    
                    const pendingEvent = new WagerTransactionPendingReference({
                        eventId: crypto.randomUUID(),
                        aggregateId: wallet.id,
                        correlationId: transaction.id,
                        occurredAt: new Date(),
                        data: {
                            transactionId: transaction.id,
                            walletId: wallet.id,
                            kind: transaction.kind,
                            status: transaction.status,
                            money: transaction.money.toJSON(),
                        }
                    });
                    
                    em.persist(OutboxMessage.enqueue(pendingEvent) as any);
                }
                await em.flush();
                return { transaction, idempotentReplay: false };
            }

            if (referenceTx.walletId !== wallet.id 
                || referenceTx.playerId !== transaction.playerId
                || referenceTx.roundId !== transaction.roundId
                || !referenceTx.money.equals(transaction.money)) {
                throw new Error('A referência não pertence a este jogador, carteira ou rodada, ou o valor é divergente.');
            }

            if (transaction.kind === WagerTransactionKind.Refund && referenceTx.kind !== WagerTransactionKind.Bet) {
                throw new Error('REFUND só pode referenciar uma BET.');
            }
            
            if (transaction.kind === WagerTransactionKind.Rollback && 
               ![WagerTransactionKind.Bet, WagerTransactionKind.Win, WagerTransactionKind.Refund].includes(referenceTx.kind)) {
                throw new Error('ROLLBACK só pode referenciar BET, WIN ou REFUND.');
            }

            const existingReversal = await em.findOne(WagerTransaction as any, {
                _referenceTransactionId: referenceTx.id,
                kind: transaction.kind,
                _status: WagerTransactionStatus.Processed,
            } as any) as WagerTransaction | null;

            if (existingReversal) {
                transaction.reject('REFERENCE_ALREADY_REVERTED');

                const rejectedEvent = new WagerTransactionRejected({
                    eventId: crypto.randomUUID(),
                    aggregateId: wallet.id,
                    correlationId: transaction.id,
                    occurredAt: new Date(),
                    data: {
                        transactionId: transaction.id,
                        walletId: wallet.id,
                        kind: transaction.kind,
                        status: transaction.status,
                        money: transaction.money.toJSON(),
                        failureCode: 'REFERENCE_ALREADY_REVERTED',
                    }
                });
                em.persist(OutboxMessage.enqueue(rejectedEvent) as any);
                await em.flush();
                return { transaction, idempotentReplay: false };
            }
        }

        const balanceBefore = wallet.balance;
        let rejectionCode: 'INSUFFICIENT_FUNDS' | 'REVERSAL_INSUFFICIENT_FUNDS' | null = null;

        try {
            if (transaction.kind === WagerTransactionKind.Bet) {
                wallet.debit(transaction.money);
            } else if (transaction.kind === WagerTransactionKind.Win) {
                wallet.credit(transaction.money);
            } else if (transaction.kind === WagerTransactionKind.Refund) {
                wallet.credit(transaction.money);
            } else if (transaction.kind === WagerTransactionKind.Rollback && referenceTx) {
                if (referenceTx.kind === WagerTransactionKind.Bet) {
                    wallet.credit(transaction.money);
                } else if (referenceTx.kind === WagerTransactionKind.Win) {
                    wallet.debit(transaction.money);
                } else if (referenceTx.kind === WagerTransactionKind.Refund) {
                    wallet.debit(transaction.money);
                }
            }
        } catch (error: any) {
            if (error.message === 'Saldo insuficiente.') {
                rejectionCode = transaction.kind === WagerTransactionKind.Bet
                    ? 'INSUFFICIENT_FUNDS'
                    : 'REVERSAL_INSUFFICIENT_FUNDS';
            } else {
                throw error;
            }
        }

        if (rejectionCode) {
            transaction.reject(rejectionCode);

            const rejectedEvent = new WagerTransactionRejected({
                eventId: crypto.randomUUID(),
                aggregateId: wallet.id,
                correlationId: transaction.id,
                occurredAt: new Date(),
                data: {
                    transactionId: transaction.id,
                    walletId: wallet.id,
                    kind: transaction.kind,
                    status: transaction.status,
                    money: transaction.money.toJSON(),
                    failureCode: rejectionCode,
                }
            });
            em.persist(OutboxMessage.enqueue(rejectedEvent) as any);
            await em.flush();
            return { transaction, idempotentReplay: false };
        }

        transaction.markProcessed(referenceTx?.id, new Date());

        em.persist(wallet as any);

        let ledgerEntry: WalletLedgerEntry | null = null;

        if (transaction.affectsBalance()) {
            const direction = wallet.balance.isLessThan(balanceBefore) ? LedgerDirection.Debit : LedgerDirection.Credit;
            
            ledgerEntry = WalletLedgerEntry.create({
                id: crypto.randomUUID(),
                walletId: wallet.id,
                transactionId: transaction.id,
                direction: direction,
                money: transaction.money,
                balanceBefore: balanceBefore,
                balanceAfter: wallet.balance,
            });

            em.persist(ledgerEntry as any);
        }

        const processedEvent = new WagerTransactionProcessed({
            eventId: crypto.randomUUID(),
            aggregateId: wallet.id,
            correlationId: transaction.id,
            occurredAt: new Date(),
            data: {
                transactionId: transaction.id,
                walletId: wallet.id,
                kind: transaction.kind,
                status: transaction.status,
                money: transaction.money.toJSON(),
                newBalance: wallet.balance.toJSON(),
            }
        });
        em.persist(OutboxMessage.enqueue(processedEvent) as any);

        if (ledgerEntry) {
            const balanceEvent = WalletBalanceChanged.from(wallet, ledgerEntry, transaction.id);
            em.persist(OutboxMessage.enqueue(balanceEvent) as any);
        }

        await em.flush();
        return { transaction, idempotentReplay: false };
    }
}