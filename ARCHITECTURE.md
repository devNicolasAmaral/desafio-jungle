# Decisões de Arquitetura

Este documento descreve as principais decisões técnicas tomadas durante o desenvolvimento do desafio, focando em garantir a consistência financeira, idempotência e concorrência.

## 1. Autenticação

**Decisão:** A autenticação foi **intencionalmente deixada de fora** do escopo desta implementação, conforme permitido pelo edital do desafio.

**Desenho proposto:** A arquitetura foi pensada para integrar um Identity Provider (IdP) externo, como Keycloak ou Zitadel. Para isso, seria adicionado um `AuthGuard` global no NestJS, protegendo todos os endpoints, exceto os de health check (`/health/live` e `/health/ready`), que devem permanecer abertos para monitoramento da infraestrutura. O token JWT (Bearer) seria validado contra as chaves públicas do IdP.

## 2. ORM e Mapeamento de Dados

**Decisão:** Foi utilizado o **MikroORM**.

**Justificativa:** O MikroORM foi escolhido por oferecer um Unit of Work explícito e um bom controle transacional (através de `em.transactional()`), que são cruciais para garantir a atomicidade entre a carteira, o ledger, o inbox e o outbox.

**Mapeamento do Money:** A classe `Money` é um Value Object no domínio e foi mapeada como `embeddable`. Isso significa que ela não gera uma tabela própria no banco. Em vez disso, suas propriedades (`amount` e `currency`) são mapeadas para colunas na tabela da entidade que a contém (ex: `balance_amount` e `balance_currency` na tabela `wallets`), garantindo tipagem forte no TypeScript e precisão no banco.

## 3. Concorrência

**Decisão:** Foi adotada a estratégia de **bloqueio pessimista** (`PESSIMISTIC_WRITE`) nas operações que alteram o saldo da carteira.

**Justificativa:** Como o sistema pode receber múltiplas requisições simultâneas para a mesma carteira, o bloqueio pessimista garante que apenas uma transação por vez possa ler e alterar o saldo daquela carteira específica. Isso evita o problema de lost update sem a complexidade de gerenciar retries de concorrência otimista, garantindo que o saldo nunca fique negativo e que o ledger seja sempre preciso.

## 4. Idempotência

**Decisão:** A idempotência é garantida no banco de dados através de uma constraint de unicidade (`UNIQUE`) na coluna `idempotency_key` da tabela `wager_transactions`.

**Como funciona:** O header `Idempotency-Key` é obrigatório. A API calcula um hash (SHA-256) de um JSON canônico do payload da requisição (com as chaves ordenadas alfabeticamente). Se a chave já existir no banco:
- Se o hash for o mesmo, a API retorna a resposta original (replay).
- Se o hash for diferente, a API retorna um erro de conflito (HTTP 409), impedindo que a mesma chave seja usada para operações diferentes.

## 5. Processamento Assíncrono e Referências (TTL)

**Decisão:** O `PendingReferenceWorker` varre o banco a cada 30 segundos em busca de transações com status `PENDING_REFERENCE`. 

**TTL de 5 minutos:** O worker aguarda até 5 minutos antes de rejeitar uma transação por falta de referência. Esse tempo foi escolhido como um equilíbrio: é longo o suficiente para absorver atrasos normais de rede ou processamento entre provedores, mas curto o suficiente para não deixar fundos travados indefinidamente caso o provedor tenha enviado uma referência que nunca vai existir.

Se o TTL expirar, a transação é rejeitada com o `failureCode` `REFERENCE_NOT_FOUND` e um evento de rejeição é publicado no Outbox.

## 6. Failure Codes

Para que os provedores saibam exatamente o motivo de uma rejeição, foram definidos os seguintes `failureCode`s:
- `INSUFFICIENT_FUNDS`: Tentativa de aposta sem saldo suficiente.
- `REFERENCE_NOT_FOUND`: A transação de referência não foi encontrada dentro do TTL.
- `INVALID_REFERENCE_TYPE`: Tentativa de estornar o tipo errado (ex: REFUND em uma WIN).
- `REFERENCE_ALREADY_REVERTED`: Tentativa de estornar uma transação que já foi revertida.
- `REVERSAL_INSUFFICIENT_FUNDS`: Tentativa de reverter um ganho (WIN) que já foi gasto.
- `CURRENCY_MISMATCH` / `AMOUNT_MISMATCH`: Divergência entre a transação de reversão e a original.

## 7. Trade-offs e Limitações

Para priorizar a estabilidade do núcleo financeiro dentro do prazo, algumas features não foram implementadas:
- **Dead Letter Queue (DLQ) explícita:** O consumidor SQS não possui uma rotina de movimentação explícita para DLQ após X falhas.
- **Graceful Shutdown:** Os workers não aguardam o término das tarefas em andamento ao receber um sinal `SIGTERM`.
- **Logs Estruturados:** Os logs utilizam o `Logger` padrão do NestJS, sem formatação JSON.