import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import config from '../../../../mikro-orm.config';

describe('Migration', () => {
    let orm: MikroORM;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
        await orm.em.getConnection().execute(`
            drop schema public cascade;
            create schema public;
        `);
        await orm.migrator.up();
        await orm.migrator.up();
    });

    afterAll(async () => {
        await orm.migrator.down();
        await orm.migrator.down();
        await orm.close(true);
    });

    it('deve rejeitar UPDATE em wallet_ledger_entries', async () => {
        const conn = orm.em.getConnection();
        await conn.execute(`
            insert into wallet_ledger_entries (id, wallet_id, transaction_id, direction, money_amount, money_currency, balance_before_amount, balance_before_currency, balance_after_amount, balance_after_currency, created_at)
            values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'CREDIT', '10.00', 'BRL', '0.00', 'BRL', '10.00', 'BRL', now())
        `);
        await expect(
            conn.execute(`update wallet_ledger_entries set direction = 'DEBIT'`)
        ).rejects.toThrow();
    });

    it('deve rejeitar DELETE em wallet_ledger_entries', async () => {
        const conn = orm.em.getConnection();
        await expect(
            conn.execute(`delete from wallet_ledger_entries`)
        ).rejects.toThrow();
    });

    it('deve aplicar a constraint CHECK de não-negatividade no banco', async () => {
        const conn = orm.em.getConnection();
        await expect(
            conn.execute(`
                insert into wallets (id, player_id, currency, balance_amount, balance_currency, _version, created_at, _updated_at)
                values (gen_random_uuid(), 'player-neg', 'BRL', '-1.00', 'BRL', 1, now(), now())
            `)
        ).rejects.toThrow();
    });

    it('deve aplicar a constraint UNIQUE de player_id + currency', async () => {
        const conn = orm.em.getConnection();
        const insert = `
            insert into wallets (id, player_id, currency, balance_amount, balance_currency, _version, created_at, _updated_at)
            values (gen_random_uuid(), 'player-dup', 'BRL', '10.00', 'BRL', 1, now(), now())
        `;
        await conn.execute(insert);
        await expect(conn.execute(insert)).rejects.toThrow();
    });

    it('deve remover todas as tabelas ao executar down', async () => {
        await orm.migrator.down();
        await orm.migrator.down();
        
        const conn = orm.em.getConnection();
        const tables = await conn.execute(`
            select table_name from information_schema.tables 
            where table_schema = 'public' 
            and table_name in ('wallets', 'wallet_ledger_entries', 'wager_transactions', 'outbox_messages', 'inbox_messages')
        `);
        
        expect(tables.length).toBe(0);
        
        await orm.migrator.up();
        await orm.migrator.up();
    });
});