# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

## Lista de espera de ingressos

A feature usa o mecanismo de eventos do curso. `CancelOrderService` cancela apenas o
`Order`, dentro de `ApplicationService.run`, e chama `orderRepo.add` para colocar
seus eventos no Unit of Work. `OrderCancelled` leva o ID do lugar.
`ReleaseOrderSpotHandler` encontra o `Event` pelo lugar, chama
`Event.markSpotAsAvailable`, remove a `SpotReservation`, persiste e publica o
`EventSpotReleased`. `NotifyWaitingCustomerHandler` encontra a lista da seção,
notifica o primeiro pendente e publica `SpotOfferedToWaitingCustomer` nos dois
canais do `DomainEventManager`. O mapeamento em `EventsModule` coloca
`SpotOfferedToWaitingCustomerIntegrationEvent` no Bull; o publisher existente leva
a mensagem ao RabbitMQ e `ConsumerService.handleWaitingCustomer` registra o aviso
no app de e-mails, usando a fila `emails.waiting-list`.

### Fronteira do agregado

`WaitingList` é separado de `Event` porque controla invariantes próprias: uma
entrada pendente por cliente e promoção pela ordem de chegada. Suas entradas
podem crescer independentemente das seções e lugares; incorporá-las ao Evento
obrigaria a carregar e persistir uma fila potencialmente grande nas operações de
venda. A raiz mantém as entradas como entidades filhas via `MyCollectionFactory`
e referencia evento, seção e clientes por IDs. Assim, cada alteração respeita a
fronteira do agregado, e a consistência entre Pedido, Evento e Lista é coordenada
por eventos e políticas, como discutido no curso para evitar agregados grandes.
A unicidade de evento + seção também é garantida no schema.

A posição de chegada é um inteiro crescente persistido; a consulta e a promoção
ordenam por essa posição. Uma entrada `NOTIFIED` não recebe novo aviso; o cliente
pode entrar novamente quando não tem entrada `PENDING` e a seção está esgotada.
O esgotamento usa a disponibilidade dos lugares e suas travas, não o contador
`total_spots_reserved`. O aviso **não reserva lugar, não concede prioridade e não
expira**. A compra continua pelo fluxo existente, sem reembolso no cancelamento.

### Executar e validar

```bash
docker-compose up -d
npm install
npx mikro-orm schema:fresh --run
npm run start:dev
# Em outro terminal:
npx nest start emails
```

O schema fresh recria as tabelas do banco local `events`. Em máquinas ARM, a
imagem MySQL herdada (`mysql:8.0.30-debian`) precisa de `platform: linux/amd64`
em um override local do Compose; Redis e RabbitMQ podem usar a plataforma nativa.

Execute as requisições de [api.http](api.http) em ordem usando REST Client:

1. Criar parceiro, clientes A/B, evento e seção de um lugar; publicar tudo.
2. Comprar com A; entrar e consultar a fila com B (`PENDING`).
3. Cancelar o pedido de A pelo único `POST .../orders/{order_id}/cancel`.
4. Consultar spots (`reserved: false`) e fila (`NOTIFIED`). O pedido retorna
   `status: "CANCELLED"`.
5. Observar `ConsumerService.handleWaitingCustomer` no terminal de e-mails, com
   `customer_id`, `event_id`, `section_id` e `spot_id`, e consultar o banco:

```sql
SELECT type_name, body FROM stored_event;
SELECT * FROM spot_reservation;
```

Devem aparecer `CustomerJoinedWaitingList`, `OrderCancelled`, `EventSpotReleased`
e `SpotOfferedToWaitingCustomer`; a trava do lugar cancelado deve desaparecer.
O `PartnerCreated` e seu consumo confirmam o cano de integração preexistente.

| Operação | Rota |
| --- | --- |
| Cancelar pedido por ID | `POST /events/:event_id/orders/:order_id/cancel` |
| Entrar na fila (`{ "customer_id": "..." }`) | `POST /events/:event_id/sections/:section_id/waiting-list` |
| Consultar entradas na ordem de chegada | `GET /events/:event_id/sections/:section_id/waiting-list` |

### Testes

```bash
# Domínio: sem conexão com banco (helper existente inicializa apenas metadados).
npx jest --runInBand cancellation.spec waiting-list.entity.spec
# Persistência e cadeia completa: MySQL real, schema recriado por teste.
npx jest --runInBand waiting-list-mysql.repository.spec waiting-list-flow.spec
# Regressão completa:
npm test
npm run build
# Obrigatório antes de retomar a API depois dos testes:
npx mikro-orm schema:fresh --run
```

Os specs antigos de infraestrutura recriam somente os schemas que conhecem e
podem remover `stored_event` e as tabelas da lista. Por isso a última recriação
usa a configuração completa da CLI. Os novos testes registram todos os schemas,
inclusive `StoredEventSchema`. O teste `waiting-list-flow.spec.ts` registra os
dois handlers no gerenciador real, usa os repositórios MySQL e dispara o caso de
uso; verifica também publicação única dos eventos, FIFO, recompra, fila ausente,
fila sem pendentes e mensagens de erro. O teste de repositório limpa o identity
map e verifica IDs tipados, status, ordenação e unicidade após recarga.

### Limitações do mecanismo didático

O `DomainEventManager` executa os listeners em processo e os aguarda: as reações
ocorrem durante a publicação, embora o comando não conheça os próximos agregados.
Não é uma política executada diretamente pelo comando nem um worker de domínio.
O handler da política publica a integração antes do commit final, conforme o
padrão solicitado. Uma falha pode, portanto, deixar uma mensagem publicada sem a
persistência correspondente; não há outbox, garantias entre banco e broker ou
tratamento de corridas. `ApplicationService` também não limpa os eventos dos
agregados; testes com vários comandos simulam requisições separadas limpando o
identity map. Esses mecanismos e o fluxo de compra original foram preservados.
`MyCollectionFactory` já adapta coleções MikroORM no código base; as novas
entidades continuam sem imports/decorators de framework e usam essa abstração.

### Design estratégico

- [Event storming editável](docs/event-storming.excalidraw): abrir no Excalidraw;
  usa as cores do desenho do curso e mostra comandos, agregados, eventos,
  políticas e a fronteira com E-mails.
- [Glossário de linguagem ubíqua](docs/linguagem-ubiqua.md).

- [Evidências de validação](docs/validacao.md): regressão e roteiro HTTP com RabbitMQ real.
