import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../../../mikro-orm.config';

describe('Schema - wallets e wallet_ledger_entries', () => {
    let orm: MikroORM;
    let sql: string;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
        await orm.schema.refresh();
        sql = await orm.schema.getCreateSchemaSQL();
    });

    afterAll(async () => {
        await orm.close(true);
    });

    beforeEach(async () => {
        await orm.schema.clear();
    });

    describe('Money como embeddable', () => {
        it('não deve criar tabela separada para Money', () => {
            expect(sql).not.toContain('create table "money"');
        });

        it('deve gerar colunas de Money com prefixo balance_ em wallets', () => {
            expect(sql).toContain('"balance_amount" decimal(15,2)');
            expect(sql).toContain('"balance_currency" varchar(3)');
        });

        it('deve gerar colunas de Money com prefixos corretos em wallet_ledger_entries', () => {
            expect(sql).toContain('"money_amount" decimal(15,2)');
            expect(sql).toContain('"money_currency" varchar(3)');
            expect(sql).toContain('"balance_before_amount" decimal(15,2)');
            expect(sql).toContain('"balance_before_currency" varchar(3)');
            expect(sql).toContain('"balance_after_amount" decimal(15,2)');
            expect(sql).toContain('"balance_after_currency" varchar(3)');
        });
    });

    describe('tipos e nulabilidade', () => {
        it('wallet_id e transaction_id no ledger devem ser uuid', () => {
            expect(sql).toContain('"wallet_id" uuid');
            expect(sql).toContain('"transaction_id" uuid');
        });

        it('_version deve ter default 1', () => {
            expect(sql).toContain('"_version" int not null default 1');
        });
    });

    describe('constraints', () => {
        it('deve gerar a constraint de não-negatividade no saldo', () => {
            expect(sql).toContain('wallets_balance_non_negative');
            expect(sql).toContain('balance_amount >= 0');
        });

        it('deve rejeitar wallet com saldo negativo no INSERT', async () => {
            const conn = orm.em.getConnection();
            await expect(
                conn.execute(`
                    insert into wallets (id, player_id, currency, balance_amount, balance_currency, _version, created_at, _updated_at)
                    values (gen_random_uuid(), 'player-neg', 'BRL', '-1.00', 'BRL', 1, now(), now())
                `)
            ).rejects.toThrow();
        });

        it('deve rejeitar wallet com saldo negativo no UPDATE', async () => {
            const conn = orm.em.getConnection();
            await conn.execute(`
                insert into wallets (id, player_id, currency, balance_amount, balance_currency, _version, created_at, _updated_at)
                values (gen_random_uuid(), 'player-neg-upd', 'BRL', '10.00', 'BRL', 1, now(), now())
            `);
            await expect(
                conn.execute(`
                    update wallets set balance_amount = '-5.00' where player_id = 'player-neg-upd'
                `)
            ).rejects.toThrow();
        });

        it('deve rejeitar wallet duplicada para o mesmo player e moeda', async () => {
            const conn = orm.em.getConnection();
            const insert = `
                insert into wallets (id, player_id, currency, balance_amount, balance_currency, _version, created_at, _updated_at)
                values (gen_random_uuid(), 'player-dup', 'BRL', '10.00', 'BRL', 1, now(), now())
            `;
            await conn.execute(insert);
            await expect(conn.execute(insert)).rejects.toThrow();
        });
    });
});