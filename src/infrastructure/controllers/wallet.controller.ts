import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { CreateWalletDto } from '../../application/dtos/create-wallet.dto';
import { Money } from '../../domain/wallet/value-objects/money.value-object';
import type { WalletRepository } from '../../domain/wallet/repositories/wallet.repository';

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
        @Query('limit') limit: string = '50',
        @Query('offset') offset: string = '0',
    ) {
        const entries = await this.walletRepository.findLedgerByWalletId(
            walletId, 
            parseInt(limit, 10), 
            parseInt(offset, 10)
        );
        
        return entries.map(entry => ({
            id: entry.id,
            direction: entry.direction,
            money: entry.money.toJSON(),
            balanceBefore: entry.balanceBefore.toJSON(),
            balanceAfter: entry.balanceAfter.toJSON(),
            createdAt: entry.createdAt,
        }));
    }
}