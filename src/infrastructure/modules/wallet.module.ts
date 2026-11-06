import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { MikroOrmWalletRepository } from '../database/repositories/wallet.repository';
import { WalletController } from '../controllers/wallet.controller';
import { WageringController } from '../controllers/wagering.controller';

@Module({
    controllers: [WalletController, WageringController],
    providers: [
        {
            provide: 'WalletRepository',
            useClass: MikroOrmWalletRepository,
        },
        CreateWalletUseCase,
        ProcessWagerTransactionUseCase,
    ],
    exports: [
        CreateWalletUseCase,
        
    ],
})
export class WalletModule {}