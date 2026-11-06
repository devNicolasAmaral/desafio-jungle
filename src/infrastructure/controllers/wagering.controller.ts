import { BadRequestException, Body, Controller, Headers, Post, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { ProcessWagerTransactionDto } from '../../application/dtos/process-wager-transaction.dto';
import { Money } from '../../domain/wallet/value-objects/money.value-object';

@Controller('wagering')
export class WageringController {
    constructor(private readonly processUseCase: ProcessWagerTransactionUseCase) {}

    @Post('transactions')
    async process(
        @Body() dto: ProcessWagerTransactionDto,
        @Headers('Idempotency-Key') idempotencyKey: string,
    ) {
        if (!idempotencyKey) {
            throw new BadRequestException('O header Idempotency-Key é obrigatório.');
        }

        const payloadHash = createHash('sha256')
            .update(JSON.stringify(dto))
            .digest('hex');

        try {
            const transaction = await this.processUseCase.execute({
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

            return {
                transactionId: transaction.id,
                status: transaction.status,
                idempotentReplay: false,
            };
        } catch (error: any) {
            throw new UnprocessableEntityException(error.message);
        }
    }
}