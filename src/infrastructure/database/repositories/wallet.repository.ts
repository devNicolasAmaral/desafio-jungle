import { EntityManager } from '@mikro-orm/postgresql';
import { Wallet } from '../../../domain/wallet/aggregates/wallet.aggregate';
import { WalletRepository } from '../../../domain/wallet/repositories/wallet.repository';
import { WalletLedgerEntry } from '../../../domain/wallet/entities/wallet-ledger-entry.entity';

export class MikroOrmWalletRepository implements WalletRepository {
    constructor(private readonly em: EntityManager) {}

    async findById(id: string): Promise<Wallet | null> {
        const wallet = await this.em.findOne(Wallet as any, { id }) as Wallet | null;
        
        if (!wallet) {
            return null;
        }

        return Wallet.rehydrate({
            id: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            balance: wallet.balance,
            version: wallet.version,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
        });
    }

    async findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
        const wallet = await this.em.findOne(Wallet as any, { playerId, currency }) as Wallet | null;
        
        if (!wallet) {
            return null;
        }

        return Wallet.rehydrate({
            id: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            balance: wallet.balance,
            version: wallet.version,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
        });
    }

    async save(wallet: Wallet): Promise<void> {
        this.em.persist(wallet as any);
        await this.em.flush();
    }

        async findLedgerByWalletId(walletId: string, limit: number, offset: number): Promise<WalletLedgerEntry[]> {
        return this.em.find(WalletLedgerEntry as any, { walletId }, { limit, offset, orderBy: { createdAt: 'DESC' } }) as Promise<WalletLedgerEntry[]>;
    }
}