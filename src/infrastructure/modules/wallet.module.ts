import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { MikroOrmWalletRepository } from '../database/repositories/wallet.repository';
import { WalletController } from '../controllers/wallet.controller';
import { WageringController } from '../controllers/wagering.controller';
import { HealthController } from '../controllers/health.controller';
import { SqsPublisherService } from '../messaging/sqs-publisher.service';
import { OutboxPublisherWorker } from '../workers/outbox-publisher.worker';
import { SqsConsumerWorker } from '../workers/sqs-consumer.worker';
import { PendingReferenceWorker } from '../workers/pending-reference.worker';

@Module({
    controllers: [WalletController, WageringController, HealthController],
    providers: [
        { provide: 'WalletRepository', useClass: MikroOrmWalletRepository },
        CreateWalletUseCase,
        ProcessWagerTransactionUseCase,
        SqsPublisherService,
        OutboxPublisherWorker,
        SqsConsumerWorker,
        PendingReferenceWorker,
    ],
})
export class WalletModule {}