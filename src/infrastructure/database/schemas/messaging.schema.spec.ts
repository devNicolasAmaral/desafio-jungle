import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import config from '../../../../mikro-orm.config';

describe('Schema - inbox_messages e outbox_messages', () => {
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

    describe('inbox_messages', () => {
        it('deve ter primary key composta (message_id, consumer_name)', () => {
            expect(sql).toContain('primary key ("message_id", "consumer_name")');
        });
    });

    describe('outbox_messages', () => {
        it('deve ter colunas do envelope de evento', () => {
            expect(sql).toContain('"aggregate_id" varchar(255) not null');
            expect(sql).toContain('"event_type" varchar(255) not null');
            expect(sql).toContain('"occurred_at" timestamptz not null');
        });

        it('deve armazenar payload como jsonb', () => {
            expect(sql).toContain('"payload" jsonb not null');
        });

        it('deve ter attempts como inteiro não nulo', () => {
            expect(sql).toContain('"attempts" int not null');
        });

        it('deve ter next_attempt_at e published_at nullable', () => {
            expect(sql).toContain('"next_attempt_at" timestamptz null');
            expect(sql).toContain('"published_at" timestamptz null');
        });

        it('deve ter índice em (published_at, next_attempt_at)', () => {
            expect(sql).toContain('outbox_messages_published_at_next_attempt_at_index');
        });
    });
});