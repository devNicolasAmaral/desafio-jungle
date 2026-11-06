# Desafio Jungle Gaming

Serviço financeiro distribuído para processamento de apostas, desenvolvido com **NestJS, TypeScript, PostgreSQL e AWS SQS**, aplicando conceitos de **Domain-Driven Design (DDD)** e os padrões **Inbox/Outbox**.

O projeto tem como objetivo garantir a consistência financeira e o processamento correto de transações em um ambiente distribuído, lidando com idempotência, concorrência e falhas de infraestrutura.

## Tecnologias

| Tecnologia | Utilização |
|---|---|
| TypeScript | Linguagem principal |
| Bun | Runtime e gerenciamento de dependências |
| NestJS | Framework da aplicação |
| MikroORM | ORM e gerenciamento de persistência |
| PostgreSQL | Banco de dados relacional |
| AWS SQS | Mensageria (via LocalStack) |
| Docker | Containerização dos serviços |
| class-validator | Validação de dados |
| class-transformer | Transformação de objetos |

## Funcionalidades e Implementações

- **Domain-Driven Design (DDD):** modelagem de domínio com Aggregate Root (`Wallet`), Value Object (`Money`) e Entities (`WagerTransaction`, `WalletLedgerEntry`).
- **Controle de concorrência:** utilização de bloqueio pessimista (`PESSIMISTIC_WRITE`) no banco de dados.
- **Consistência financeira:** persistência atômica de transações e saldos, com ledger imutável protegido por triggers no banco.
- **Inbox Pattern:** deduplicação de mensagens recebidas.
- **Outbox Pattern:** publicação garantida de eventos.
- **Idempotência:** persistência e garantia de unicidade por meio de constraints no banco de dados.
- **Reprocessamento:** worker agendado para retomar transações pendentes de referência (`PENDING_REFERENCE`), utilizando TTL.
- **Processamento distribuído:** workers de publicação de Outbox e consumo de SQS preparados para múltiplas instâncias.
- **API REST:** criação de carteiras, processamento de apostas, consulta de saldo, extrato e health checks.
- **Testes:** testes unitários, de integração e de concorrência, utilizando PostgreSQL e LocalStack em containers.

## Pré-requisitos

Antes de executar o projeto, certifique-se de ter instalado:

- [Bun](https://bun.sh/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Como executar

### 1. Clonar o repositório

```bash
git clone https://github.com/devNicolasAmaral/desafio-jungle.git
cd desafio-jungle
```

### 2. Configurar as variáveis de ambiente

Crie o arquivo `.env` a partir do exemplo disponibilizado:

```powershell
Copy-Item .env.example .env
```

### 3. Instalar as dependências

```bash
bun install
```

### 4. Iniciar os serviços de infraestrutura

Com o Docker Desktop em execução, inicialize o PostgreSQL e o LocalStack (SQS):

```bash
docker compose up -d
```

### 5. Criar a fila SQS (opcional)

Para testar o fluxo real de mensageria com o LocalStack, crie a fila FIFO:

```bash
docker exec -it jungle_localstack awslocal sqs create-queue --queue-name wager-transactions.fifo --attributes FifoQueue=true
```

### 6. Executar as migrações

Crie ou atualize as tabelas do banco de dados:

```bash
bun run migration:up
```

### 7. Iniciar a aplicação

```bash
bun run start:dev
```

A API estará disponível em:

`http://localhost:3000`

## Testes

**Importante:** certifique-se de que os contêineres Docker estão em execução (Passo 4) antes de rodar os testes de integração e concorrência.

Para executar a suíte de testes:

```bash
bun test
```

Os testes contemplam cenários unitários, de integração, ponta a ponta e concorrência.

## Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/wallets` | Criação de carteira com saldo inicial |
| `GET` | `/wallets/:walletId` | Consulta de saldo |
| `GET` | `/wallets/:walletId/ledger` | Consulta do extrato (ledger) |
| `POST` | `/wallets/:walletId/reconciliation` | Reconciliação de saldo |
| `POST` | `/wagering/transactions` | Processamento de aposta |
| `GET` | `/wagering/transactions/:transactionId` | Consulta de transação |
| `GET` | `/health/live` | Verificação de disponibilidade |
| `GET` | `/health/ready` | Verificação de prontidão |

**Observação:** o endpoint de processamento de apostas requer o envio do header `Idempotency-Key`.

## Próximas etapas

- [ ] Implementar autenticação via Identity Provider externo (ex.: Keycloak).
- [ ] Configurar uma Dead Letter Queue (DLQ) explícita para falhas permanentes no SQS.
- [ ] Adicionar logs estruturados em JSON com propagação de `correlationId`.
- [ ] Implementar graceful shutdown dos workers (SIGTERM).