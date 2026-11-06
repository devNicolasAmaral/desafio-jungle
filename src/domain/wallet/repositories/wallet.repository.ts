import { Wallet } from '../aggregates/wallet.aggregate';
import { WalletLedgerEntry } from '../entities/wallet-ledger-entry.entity';


export interface WalletRepository {
    findById(id: string): Promise<Wallet | null>;
    findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;
    save(wallet: Wallet): Promise<void>;
    findLedgerByWalletId(walletId: string, limit: number, offset: number): Promise<WalletLedgerEntry[]>;
}