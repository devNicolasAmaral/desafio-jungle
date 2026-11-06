import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Get,
    Headers,
    Inject,
    NotFoundException,
    Param,
    Post,
    Res,
    UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { ProcessWagerTransactionDto } from '../../application/dtos/process-wager-transaction.dto';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { WagerTransactionStatus } from '../../domain/wallet/entities/wager-transaction.entity';
import type { WalletRepository } from '../../domain/wallet/repositories/wallet.repository';

@Controller()
export class WageringController {
    constructor(
        private readonly processUseCase: ProcessWagerTransactionUseCase,
        @Inject('WalletRepository')
        private readonly walletRepository: WalletRepository,
    ) {}

    @Post('wagering/transactions')
    async process(
        @Body() dto: ProcessWagerTransactionDto,
        @Headers('Idempotency-Key') idempotencyKey: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        if (!idempotencyKey) {
            throw new BadRequestException('O header Idempotency-Key é obrigatório.');
        }

        const payloadHash = createHash('sha256')
            .update(JSON.stringify(dto))
            .digest('hex');

        try {
            const result = await this.processUseCase.execute({
                providerId: dto.providerId,
                externalTransactionId: dto.externalTransactionId,
                idempotencyKey,
                payloadHash,
                walletId: dto.walletId,
                playerId: dto.playerId,
                roundId: dto.roundId,
                gameId: dto.gameId,
                kind: dto.kind,
                money: Money.from({
                    amount: dto.money.amount,
                    currency: dto.money.currency,
                }),
                referenceExternalTransactionId: dto.referenceExternalTransactionId,
            });

            if (result.transaction.status === WagerTransactionStatus.PendingReference) {
                res.status(202);
            } else if (result.idempotentReplay) {
                res.status(200);
            } else if (result.transaction.status === WagerTransactionStatus.Rejected) {
                res.status(422);
            } else {
                res.status(201);
            }

            return {
                transactionId: result.transaction.id,
                status: result.transaction.status,
                failureCode: result.transaction.failureCode ?? null,
                idempotentReplay: result.idempotentReplay,
            };
        } catch (error: any) {
            if (error.message.includes('não encontrada')) {
                throw new NotFoundException(error.message);
            }
            if (error.message.includes('Conflito de idempotência')) {
                throw new ConflictException(error.message);
            }
            throw new UnprocessableEntityException(error.message);
        }
    }

    @Get('wagering/transactions/:transactionId')
    async findTransaction(@Param('transactionId') transactionId: string) {
        const tx = await this.walletRepository.findTransactionById(transactionId);
        if (!tx) {
            throw new NotFoundException('Transação não encontrada.');
        }
        return {
            id: tx.id,
            status: tx.status,
            kind: tx.kind,
            money: tx.money.toJSON(),
            failureCode: tx.failureCode ?? null,
            createdAt: tx.createdAt,
        };
    }

    @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
    async findTransactionByExternal(
        @Param('providerId') providerId: string,
        @Param('externalTransactionId') externalTransactionId: string,
    ) {
        const tx = await this.walletRepository.findTransactionByExternalId(providerId, externalTransactionId);
        if (!tx) {
            throw new NotFoundException('Transação não encontrada.');
        }
        return {
            id: tx.id,
            status: tx.status,
            kind: tx.kind,
            money: tx.money.toJSON(),
            failureCode: tx.failureCode ?? null,
            createdAt: tx.createdAt,
        };
    }
}
