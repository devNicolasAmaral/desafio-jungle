import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../../../mikro-orm.config';

describe('Schema - wager_transactions', () => {
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

    describe('colunas e tipos', () => {
        it('deve gerar colunas de Money sem prefixo', () => {
            expect(sql).toContain('"amount" decimal(15,2)');
            expect(sql).toContain('"currency" varchar(3)');
        });

        it('campos opcionais devem ser nullable', () => {
            expect(sql).toContain('"reference_external_transaction_id" varchar(255) null');
            expect(sql).toContain('"reference_transaction_id" uuid null');
            expect(sql).toContain('"failure_code" varchar(255) null');
            expect(sql).toContain('"processed_at" timestamptz null');
        });
    });

    describe('constraints', () => {
        it('deve rejeitar wager transaction com idempotencyKey duplicada', async () => {
            const conn = orm.em.getConnection();
            const insert = `
                insert into wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, created_at, status)
                values (gen_random_uuid(), 'p', 'ext', 'key-1', 'hash', gen_random_uuid(), 'pl', 'r', 'g', 'BET', '10.00', 'BRL', now(), 'PENDING')
            `;
            await conn.execute(insert);
            await expect(conn.execute(insert)).rejects.toThrow();
        });
    });
});