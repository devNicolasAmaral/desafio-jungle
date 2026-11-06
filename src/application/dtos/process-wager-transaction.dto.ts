import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WagerTransactionKind } from '../../domain/wallet/entities/wager-transaction.entity';

class MoneyDto {
    @IsString()
    @IsNotEmpty()
    amount: string;

    @IsString()
    @IsNotEmpty()
    currency: string;
}

export class ProcessWagerTransactionDto {
    @IsString()
    @IsNotEmpty()
    providerId: string;

    @IsString()
    @IsNotEmpty()
    externalTransactionId: string;

    @IsString()
    @IsNotEmpty()
    playerId: string;

    @IsString()
    @IsNotEmpty()
    walletId: string;

    @IsString()
    @IsNotEmpty()
    roundId: string;

    @IsString()
    @IsNotEmpty()
    gameId: string;

    @IsIn([
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Loss,
        WagerTransactionKind.Refund,
        WagerTransactionKind.Rollback,
    ])
    kind: WagerTransactionKind;

    @ValidateNested()
    @Type(() => MoneyDto)
    money: MoneyDto;

    @IsString()
    @IsOptional()
    referenceExternalTransactionId?: string;
}