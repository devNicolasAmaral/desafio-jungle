import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { CreateWalletDto } from '../../application/dtos/create-wallet.dto';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import { LedgerDirection } from '../../domain/wallet/entities/wallet-ledger-entry.entity';
import type { WalletRepository } from '../../domain/wallet/repositories/wallet.repository';

function encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ o: offset })).toString('base64');
}

function decodeCursor(cursor: string | undefined): number {
    if (!cursor) return 0;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        return Number(parsed.o) || 0;
    } catch {
        throw new BadRequestException('Cursor inválido.');
    }
}

@Controller('wallets')
export class WalletController {
    constructor(
        private readonly createWalletUseCase: CreateWalletUseCase,
        @Inject('WalletRepository')
        private readonly walletRepository: WalletRepository,
    ) {}

    @Post()
    async create(@Body() dto: CreateWalletDto) {
        const wallet = await this.createWalletUseCase.execute({
            playerId: dto.playerId,
            initialBalance: Money.from({
                amount: dto.initialBalance.amount,
                currency: dto.initialBalance.currency,
            }),
        });

        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.balance.toJSON(),
            version: wallet.version,
        };
    }

    @Get(':walletId')
    async findOne(@Param('walletId') walletId: string) {
        const wallet = await this.walletRepository.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Carteira não encontrada.');
        }

        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.balance.toJSON(),
            version: wallet.version,
        };
    }

    @Get(':walletId/ledger')
    async getLedger(
        @Param('walletId') walletId: string,
        @Query('cursor') cursor?: string,
        @Query('limit') limit: string = '50',
    ) {
        
        const wallet = await this.walletRepository.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Carteira não encontrada.');
        }

        const offset = decodeCursor(cursor);
        const limitNum = Math.min(parseInt(limit, 10) || 50, 100);

        const entries = await this.walletRepository.findLedgerByWalletId(walletId, limitNum, offset);

        return {
            data: entries.map(entry => ({
                id: entry.id,
                direction: entry.direction,
                money: entry.money.toJSON(),
                balanceBefore: entry.balanceBefore.toJSON(),
                balanceAfter: entry.balanceAfter.toJSON(),
                createdAt: entry.createdAt,
            })),
            nextCursor: entries.length === limitNum ? encodeCursor(offset + limitNum) : null,
        };
    }

    @Post(':walletId/reconciliation')
    async reconcile(@Param('walletId') walletId: string) {
        const wallet = await this.walletRepository.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Carteira não encontrada.');
        }

        const entries = await this.walletRepository.findAllLedgerByWalletId(walletId);

        let calculatedBalance = Money.zero(wallet.currency);
        for (const entry of entries) {
            if (entry.direction === LedgerDirection.Credit) {
                calculatedBalance = calculatedBalance.add(entry.money);
            } else {
                calculatedBalance = calculatedBalance.subtract(entry.money);
            }
        }

        const difference = wallet.balance.subtract(calculatedBalance);

        return {
            walletId: wallet.id,
            storedBalance: wallet.balance.toJSON(),
            calculatedBalance: calculatedBalance.toJSON(),
            difference: difference.toJSON(),
            consistent: difference.isZero(),
            checkedEntries: entries.length,
        };
    }
}
