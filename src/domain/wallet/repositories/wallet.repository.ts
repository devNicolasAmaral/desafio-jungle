import { Wallet } from '../aggregates/wallet.aggregate';

export interface WalletRepository {
    findById(id: string): Promise<Wallet | null>;
    findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;
    save(wallet: Wallet): Promise<void>;
}