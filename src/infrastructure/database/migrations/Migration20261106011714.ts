import { Migration } from '@mikro-orm/migrations';

export class Migration20261106011714 extends Migration {

  override name = 'Migration20261106011714';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("message_id", "consumer_name"));`);

    this.addSql(`create table "outbox_messages" ("id" uuid not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_published_at_next_attempt_at_index" on "outbox_messages" ("published_at", "next_attempt_at");`);

    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" uuid not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" varchar(255) not null, "amount" decimal(15,2) not null, "currency" varchar(3) not null, "reference_external_transaction_id" varchar(255) null, "created_at" timestamptz not null, "status" varchar(255) not null, "reference_transaction_id" uuid null, "failure_code" varchar(255) null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`);
    this.addSql(`create index "wager_transactions_wallet_id_index" on "wager_transactions" ("wallet_id");`);
    this.addSql(`create index "wager_transactions_provider_id_external_transaction_id_index" on "wager_transactions" ("provider_id", "external_transaction_id");`);

    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(3) not null, "balance_amount" decimal(15,2) not null, "balance_currency" varchar(3) not null, "_version" int not null default 1, "created_at" timestamptz not null, "_updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`);
    this.addSql(`alter table "wallets" add constraint "wallets_balance_non_negative" check (balance_amount >= 0);`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "direction" varchar(255) not null, "money_amount" decimal(15,2) not null, "money_currency" varchar(3) not null, "balance_before_amount" decimal(15,2) not null, "balance_before_currency" varchar(3) not null, "balance_after_amount" decimal(15,2) not null, "balance_after_currency" varchar(3) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wallet_ledger_entries_wallet_id_index" on "wallet_ledger_entries" ("wallet_id");`);
    this.addSql(`create index "wallet_ledger_entries_transaction_id_index" on "wallet_ledger_entries" ("transaction_id");`);
  
    this.addSql(`
      create or replace function prevent_ledger_modification()
      returns trigger as $$
      begin
          raise exception 'wallet_ledger_entries e imutavel: UPDATE e DELETE nao sao permitidos';
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger trg_prevent_ledger_update
      before update on "wallet_ledger_entries"
      for each row execute function prevent_ledger_modification();
    `);
    this.addSql(`
      create trigger trg_prevent_ledger_delete
      before delete on "wallet_ledger_entries"
      for each row execute function prevent_ledger_modification();
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop function if exists prevent_ledger_modification() cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
  }
}
