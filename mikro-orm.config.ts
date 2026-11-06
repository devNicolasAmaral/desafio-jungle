import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

export default defineConfig({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'jungle_user',
    password: process.env.DB_PASSWORD || 'jungle_password',
    dbName: process.env.DB_NAME || 'jungle_db',
    entities: ['./dist/infrastructure/database/schemas/*.schema.js'],
    entitiesTs: ['./src/infrastructure/database/schemas/*.schema.ts'],
    extensions: [Migrator],
    dynamicImportProvider: (id) => import(id),
    debug: process.env.NODE_ENV !== 'production',
    ignoreUndefinedInQuery: true,
    schemaGenerator: {
        ignoreTriggers: true,
        ignoreRoutines: true,
    },
    migrations: {
        path: './dist/infrastructure/database/migrations',
        pathTs: './src/infrastructure/database/migrations',
        glob: '!(*.spec).{js,ts}',
        disableForeignKeys: false,
        snapshotOnMigrate: false,
    },
});