# Desafio Jungle Gaming

Serviço financeiro distribuído para processamento de apostas (NestJS, Bun, PostgreSQL, SQS), implementando DDD e Inbox/Outbox pattern.

---

## Stack

| Componente | Tecnologia / Versão |
|---|---|
| Runtime e Package Manager | Bun 1.x |
| Linguagem | TypeScript (Strict Mode) |
| Framework Web | NestJS |
| Persistência Relacional | PostgreSQL |
| ORM / Data Mapper | MikroORM (Unit of Work, Identity Map, Pessimistic Locking) |
| Mensageria Assíncrona | AWS SQS (FIFO) via LocalStack |
| Orquestração de Containers | Docker Compose |
| Migrações | Versionadas e reversíveis via MikroORM CLI |

---

## Invariantes de Domínio e Restrições de Sistema

* **Precisão Monetária:** Manipulação monetária estritamente por meio do Value Object `Money`, serializado como string decimal com escala fixa de 2 casas (`"25.00"` BRL). Tipos primitivos IEEE 754 (`number`, `float`, `double`) são proibidos no cálculo de saldo.
* **Ledger Imutável:** O saldo da carteira é materializado e espelhado por registros imutáveis no ledger (`WalletLedgerEntry`). Toda alteração de saldo gera obrigatoriamente um registro contábil de `DEBIT` ou `CREDIT`. Lançamentos não são alterados ou excluídos.
* **Saldo Não-Negativo:** Impossibilidade estrita de saldo negativo, garantida tanto por verificação de domínio quanto por `CHECK constraint` no schema do banco de dados.
* **Unidade de Concorrência:** Isolamento de concorrência por `walletId` via bloqueio pessimista (`PESSIMISTIC_WRITE`) no banco de dados durante a transação SQL, impedindo *lost updates* em cenários com múltiplas instâncias concorrentes.
* **Idempotência Persistente:** O header `Idempotency-Key` é mandatório para submissões. O estado é persistido no banco de dados com hash canônico do payload (`payloadHash`). Replays idênticos retornam o resultado original; chaves reutilizadas com payloads divergentes geram conflito (`409 Conflict`).
* **Transactional Outbox & Inbox:** Publicação de eventos de integração e consumo de mensagens SQS utilizam Inbox/Outbox participando da mesma transação SQL da mutação de saldo, eliminando escrita dupla (*dual write*) e garantindo entrega *at-least-once*.
* **Resolução de Dependências Temporais:** Operações `REFUND` e `ROLLBACK` recebidas fora de ordem (antes da transação referenciada) são persistidas com status `PENDING_REFERENCE` e processadas posteriormente por worker com backoff exponencial.

---

## 3. Pré-requisitos

* [Bun](https://bun.sh/) `>= 1.0.0`
* [Docker Desktop](https://www.docker.com/) ou Docker Engine com Docker Compose v2

---

## 4. Instruções de Instalação e Execução

### 4.1. Clonagem e Dependências

```bash
git clone https://github.com/devNicolasAmaral/desafio-jungle.git
cd desafio-jungle
bun install
```

### 4.2. Variáveis de Ambiente

Copie o arquivo de definição de ambiente:

```bash
# Linux / macOS / Bash
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

### 4.3. Infraestrutura Local (Docker Compose)

Inicialize os containers do PostgreSQL e do LocalStack:

```bash
docker compose up -d
```

### 4.4. Provisionamento das Filas SQS (FIFO)

O processamento assíncrono exige a fila de falhas permanentes (DLQ) e a fila operacional principal:

```bash
# Criação da Dead Letter Queue (FIFO)
docker exec -it jungle_localstack awslocal sqs create-queue --queue-name wager-transactions.fifo --attributes FifoQueue=true
```

### 4.5. Execução das Migrações

Aplique as migrações no banco de dados PostgreSQL:

```bash
bun run migration:up
```

### 4.6. Inicialização da Aplicação

```bash
bun run start:dev
```

A API estará acessível em `http://localhost:3000`.

---

## 5. Execução de Testes

A suíte cobre testes unitários, testes de integração contra containers reais (PostgreSQL e SQS) e testes de estresse de concorrência real.

```bash
bun test
```

> **Atenção sobre isolamento do banco nos testes:**
> Os testes de integração realizam limpeza determinística do schema para isolamento dos cenários. Caso a suíte seja executada paralelamente à aplicação em modo desenvolvimento (`bun run start:dev`), aplique as migrações novamente antes de reiniciar as operações da API:
> ```bash
> bun run migration:up
> ```

---

## 6. Especificação da API HTTP

### 6.1. Carteiras (`/wallets`)

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/wallets` | Abertura de carteira (`playerId`, `currency`, `initialBalance`). Gera transação interna `OPENING` no ledger. |
| `GET` | `/wallets/:walletId` | Consulta de saldo materializado e versão atual do agregado. |
| `GET` | `/wallets/:walletId/ledger` | Extrato contábil paginado (`cursor`, `limit`). Retorna histórico de `DEBIT` e `CREDIT`. |
| `POST` | `/wallets/:walletId/reconciliation` | Auditoria contábil: recalcula o saldo pela soma dos lançamentos do ledger e confronta com o saldo materializado. |

### 6.2. Transações de Aposta (`/wagering`)

| Método | Endpoint | Headers | Descrição |
|---|---|---|---|
| `POST` | `/wagering/transactions` | `Idempotency-Key: <string>` *(Obrigatório)* | Submete operação (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`). |
| `GET` | `/wagering/transactions/:transactionId` | — | Consulta status interno da transação (`PENDING`, `PROCESSED`, `REJECTED`, `FAILED`). |
| `GET` | `/providers/:providerId/wagering/transactions/:externalTransactionId` | — | Consulta transação pela chave externa do provedor. |

#### Matriz de Comportamento por Operação

| Operação | Efeito no Saldo | Efeito no Ledger | Pré-condições / Regras |
|---|---|---|---|
| `BET` | Débito | Entrada `DEBIT` | Rejeitada caso `balance < amount` (`INSUFFICIENT_FUNDS`). |
| `WIN` | Crédito | Entrada `CREDIT` | Pode associar `roundId` à aposta de origem. |
| `LOSS` | Nenhum | Nenhum registro | Registra evento de rodada sem alteração financeira. |
| `REFUND` | Crédito | Entrada `CREDIT` | Reverte estritamente uma `BET` `PROCESSED`. Exige `referenceExternalTransactionId`. |
| `ROLLBACK` | Inverso da ref. | Entrada invertida | Reverte `BET`, `WIN` ou `REFUND`. Rejeitado se a reversão gerar saldo negativo. |

### 6.3. Verificação de Saúde (`/health`)

Endpoints públicos sem autenticação:

| Método | Endpoint | Finalidade |
|---|---|---|
| `GET` | `/health/live` | Liveness probe (processo em execução). |
| `GET` | `/health/ready` | Readiness probe (valida conectividade de rede com PostgreSQL e AWS SQS). |

---

## 7. Mensageria SQS e Formato de Eventos

O consumidor de mensagens processa cargas no mesmo use case transacional da API HTTP.

* **Fila de Consumo:** `wager-transactions.fifo`
* **Dead Letter Queue:** `wager-transactions-dlq.fifo`
* **Esquema do Payload SQS:**

```json
{
  "messageId": "msg-123",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-07-29T15:00:00.000Z",
  "data": {
    "providerId": "provider-a",
    "externalTransactionId": "transaction-123",
    "idempotencyKey": "provider-a:transaction-123",
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }
}
```

O consumo implementa deduplicação persistente via tabela de `inbox`, confirmação (`ack`) executada somente após o commit da transação do banco de dados, e descarte/redirecionamento para a DLQ após esgotamento de retries.