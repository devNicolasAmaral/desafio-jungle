# Decisões de Arquitetura 
Este documento descreve as principais decisões técnicas tomadas durante o desenvolvimento do serviço, focando no cumprimento estrito dos requisitos de consistência financeira, idempotência, concorrência e resiliência a falhas definidos pelo desafio da Jungle Gaming.

## 1. Autenticação

**Decisão:** A autenticação foi intencionalmente deixada fora do escopo de implementação, conforme permissão explícita no edital.
**Desenho Arquitetural Adotado:** A arquitetura foi preparada para integração com um Identity Provider (IdP) externo e compatível com OIDC (como Keycloak ou Zitadel). 
*   **Ponto de Extensão:** A aplicação prevê um `AuthGuard` global configurado no NestJS que interceptaria os tokens JWT (Bearer) validando-os contra as chaves públicas do IdP.
*   **Exceções:** Os endpoints de monitoramento (`/health/live` e `/health/ready`) são explicitamente isentos dessa validação para permitir o funcionamento correto de probes do Kubernetes ou do Docker Compose.

## 2. ORM e Mapeamento de Domínio

**Decisão:** Utilização do **MikroORM**.
**Justificativa:** O MikroORM foi adotado por prover um Unit of Work (UoW) e um Identity Map nativos. O controle transacional explícito (`em.transactional()`) foi fundamental para garantir que as mutações na `Wallet`, os registros no `WalletLedgerEntry` e as operações de `Inbox`/`Outbox` ocorram sob a mesma transação ACID no PostgreSQL.
**Mapeamento do Objeto de Valor (Money):** O `Money` é tratado estritamente como um *Value Object* no domínio e mapeado como `embeddable` no MikroORM. Ele não possui tabela própria; seus campos (`amount` como string decimal e `currency`) são embutidos nas entidades proprietárias. Isso blinda o núcleo financeiro de vazamentos de infraestrutura e evita problemas clássicos de precisão flutuante.

## 3. Concorrência e Consistência Financeira

**Decisão:** Estratégia de Bloqueio Pessimista (`PESSIMISTIC_WRITE`) ancorada na `walletId`.
**Justificativa:** O sistema precisa garantir corretude mesmo quando múltiplas instâncias processam transações simultâneas para a mesma carteira. O bloqueio pessimista a nível de banco de dados força a serialização das operações concorrentes para a mesma wallet. 
*   **Como funciona:** A primeira requisição adquire o lock na linha da tabela `wallets`. Requisições subsequentes para a mesma wallet aguardam a liberação do lock (commit/rollback).
*   **Por que não otimista?** Em cenários de alta disputa (hot wallets), o bloqueio otimista geraria um volume excessivo de *retries* de aplicação e falhas (`StaleObjectStateException`), degradando o throughput geral. O lock pessimista previne efetivamente o *lost update* de forma determinística e segura.

## 4. Idempotência Persistente

**Decisão:** Garantia de unicidade no banco de dados via constraint e validação de hash.
**Justificativa:** A idempotência em memória ou cache (ex: Redis) não é confiável em cenários de crash do sistema. A idempotência foi ancorada no PostgreSQL através da coluna `idempotency_key` na tabela de transações.
*   **Mecanismo:** A chave é recebida via header `Idempotency-Key`. A aplicação gera um `payloadHash` (SHA-256) baseado em um JSON canônico (chaves ordenadas alfabeticamente) contendo apenas os dados de negócio.
*   **Replay vs Conflito:** Se a chave já existe e o `payloadHash` coincide, o sistema devolve o estado previamente processado (Replay). Se a chave existe, mas o hash difere, caracteriza-se uma violação de contrato e um conflito HTTP 409 é retornado.

## 5. Mensageria, Resiliência e DLQ

**Decisão:** Consumo resiliente com padrão Inbox/Outbox transacional.
**Justificativa:** Para mitigar falhas temporárias e garantir consistência distribuída:
*   **Inbox:** Deduplica mensagens SQS recebidas, participando da transação SQL de negócio. O `ack` da mensagem na fila do SQS só ocorre *após* o commit bem-sucedido no banco de dados.
*   **Outbox:** Eventos de integração são salvos no banco na mesma transação. Um worker assíncrono independente consome a tabela Outbox e publica para os brokers, garantindo entrega *at-least-once*.
*   **Dead Letter Queue (DLQ):** Configurada nativamente no SQS através de uma `RedrivePolicy`. Mensagens que causam falhas repetidas (erros transitórios de infraestrutura que excedem o `maxReceiveCount`) são movidas automaticamente para a fila `.dlq.fifo` sem comprometer o fluxo das mensagens saudáveis. Falhas de domínio (ex: saldo insuficiente) não vão para a DLQ, pois recebem um *ack* após serem marcadas como `REJECTED`.
*   **Graceful Shutdown:** Interceptores de ciclo de vida (`SIGTERM`/`SIGINT`) foram implementados. Workers em execução concluem suas rotinas transacionais ativas ou não efetuam o `ack` no SQS (devolvendo a visibilidade da mensagem) e drenam conexões de banco de dados de forma segura antes da terminação do contêiner.

## 6. Referências Fora de Ordem (Tempo Temporal)

**Decisão:** Enfileiramento interno com status `PENDING_REFERENCE` e repetição com Backoff.
**Justificativa:** Em sistemas distribuídos assíncronos (entrega *at-least-once*), operações dependentes (como `REFUND` ou `ROLLBACK`) podem chegar antes das originais (`BET` ou `WIN`). 
*   **Mecanismo:** Ao invés de falhar imediatamente, o sistema persiste a transação como `PENDING_REFERENCE`. Um worker temporizado inspeciona periodicamente essas transações, aplicando um *backoff* exponencial.
*   **TTL (Time to Live):** Estabeleceu-se um limite de 5 minutos para a resolução da referência. Considerou-se que atrasos acima dessa janela configuram anomalia definitiva (mensagem perdida pelo provider). Excedido o TTL, a transação recebe o status terminal `REJECTED` com um erro de referência.

## 7. Códigos de Falha (FailureCode)

Foi definida uma taxonomia clara para que clientes e provedores possam automatizar suas decisões:
*   `INSUFFICIENT_FUNDS`: Débito rejeitado por saldo insuficiente.
*   `REFERENCE_NOT_FOUND`: Rejeição definitiva após esgotamento do TTL (referência nunca chegou).
*   `INVALID_REFERENCE_TYPE`: Violação de regra (ex: tentar aplicar um `REFUND` sobre um `WIN`).
*   `REFERENCE_ALREADY_REVERTED`: Prevenção de reversão dupla.
*   `REVERSAL_INSUFFICIENT_FUNDS`: Distinção clara — a reversão de um crédito resultaria em saldo negativo. É semanticamente diferente de não ter fundos para apostar.

## 8. Observabilidade

**Decisão:** Logs estruturados em formato JSON e Health Checks explícitos.
*   **Logs:** Substituiu-se o logger textual padrão por logs JSON puros, inserindo campos de contexto vitais (`correlationId`, `walletId`, `transactionId`, `providerId`) exigidos para tracing em sistemas distribuídos, mascarando dados financeiros sensíveis.
*   **Health:** Endpoints nativos e segregados: `live` para saúde do processo, e `ready` para validação ativa de conexão com DB e Broker SQS.

## 9. Trade-offs Assumidos

1.  **Polling Interval do Worker de Outbox:** Para não sobrecarregar o PostgreSQL com consultas em excesso na tabela de Outbox, estabeleceu-se um intervalo de *polling*. O trade-off é a inserção de uma ligeira latência (milissegundos) na propagação dos eventos de integração, considerada aceitável frente ao ganho de estabilidade no BD.
2.  **Múltiplas Moedas:** Embora o domínio `Money` suporte validação cruzada para garantir a integridade entre diferentes moedas e isole seus comportamentos, o foco de validação e implantação atual assume um fluxo de operação majoritariamente centrado em `BRL` (Real) para reduzir a superfície dos testes unitários sobre conversões de câmbio que escapam do núcleo contábil exigido.