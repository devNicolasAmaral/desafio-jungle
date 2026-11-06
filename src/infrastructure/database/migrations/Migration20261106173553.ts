import { Migration } from '@mikro-orm/migrations';

export class Migration20261106173553 extends Migration {

  override name = 'Migration20261106173553';

  override up(): void | Promise<void> {
    this.addSql(`drop index "wallet_ledger_entries_transaction_id_index";`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_transaction_id_unique" unique ("transaction_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_entries_transaction_id_unique";`);
    this.addSql(`create index "wallet_ledger_entries_transaction_id_index" on "wallet_ledger_entries" ("transaction_id");`);
  }
}