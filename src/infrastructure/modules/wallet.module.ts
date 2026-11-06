import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { WalletRepository } from '../../domain/wallet/repositories/wallet.repository';
import { MikroOrmWalletRepository } from '../database/repositories/wallet.repository';

@Module({
    providers: [
        {
            provide: 'WalletRepository',
            useClass: MikroOrmWalletRepository,
        },
        CreateWalletUseCase,
    ],
    exports: [
        CreateWalletUseCase,
    ],
})
export class WalletModule {}