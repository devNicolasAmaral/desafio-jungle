import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Wallet } from '../../domain/wallet/aggregates/wallet.aggregate';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { WagerTransaction, WagerTransactionKind } from '../../domain/wallet/entities/wager-transaction.entity';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/wallet/entities/wallet-ledger-entry.entity';

export interface CreateWalletInput {
    playerId: string;
    initialBalance: Money;
}

@Injectable()
export class CreateWalletUseCase {
    constructor(private readonly em: EntityManager) {}

    async execute(input: CreateWalletInput): Promise<Wallet> {
        return this.em.transactional(async (em) => {
            const existingWallet = await em.findOne(Wallet as any, {
                playerId: input.playerId,
                currency: input.initialBalance.currency,
            });

            if (existingWallet) {
                throw new Error('Já existe uma carteira para este jogador com esta moeda.');
            }

            const walletId = crypto.randomUUID();
            const wallet = Wallet.open({
                id: walletId,
                playerId: input.playerId,
                initialBalance: input.initialBalance,
            });

            em.persist(wallet as any);

            if (input.initialBalance.isPositive()) {
                this.createOpeningRecords(em, wallet);
            }

            await em.flush();
            return wallet;
        });
    }

    private createOpeningRecords(em: EntityManager, wallet: Wallet): void {
        const transactionId = crypto.randomUUID();
        const zeroMoney = Money.zero(wallet.currency);

        const transaction = WagerTransaction.create({
            id: transactionId,
            providerId: 'internal',
            externalTransactionId: transactionId,
            idempotencyKey: `opening:${wallet.id}`,
            payloadHash: 'opening',
            walletId: wallet.id,
            playerId: wallet.playerId,
            roundId: 'opening',
            gameId: 'opening',
            kind: WagerTransactionKind.Opening,
            money: wallet.balance,
        });
        
        transaction.markProcessed(undefined, new Date());

        const ledgerEntry = WalletLedgerEntry.create({
            id: crypto.randomUUID(),
            walletId: wallet.id,
            transactionId: transactionId,
            direction: LedgerDirection.Credit,
            money: wallet.balance,
            balanceBefore: zeroMoney,
            balanceAfter: wallet.balance,
        });

        em.persist(transaction as any);
        em.persist(ledgerEntry as any);
    }
}