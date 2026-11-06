import { Wallet } from '../aggregates/wallet.aggregate';
import { WalletLedgerEntry } from '../entities/wallet-ledger-entry.entity';
import { WagerTransaction } from '../entities/wager-transaction.entity';

export interface WalletRepository {
    findById(id: string): Promise<Wallet | null>;
    findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;
    save(wallet: Wallet): Promise<void>;
    findLedgerByWalletId(walletId: string, limit: number, offset: number): Promise<WalletLedgerEntry[]>;
    findAllLedgerByWalletId(walletId: string): Promise<WalletLedgerEntry[]>;
    findTransactionById(transactionId: string): Promise<WagerTransaction | null>;
    findTransactionByExternalId(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null>;
}