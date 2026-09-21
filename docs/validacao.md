# Validação da entrega

Validação executada em 21/09/2026, com MySQL, Redis e RabbitMQ do Compose.
Na máquina ARM foi usado um override temporário para executar somente o MySQL
em `linux/amd64`, mantendo as imagens do repositório.

## Antes da implementação

O roteiro original de `api.http` criou parceiro, cliente, evento e seção,
publicou os lugares e comprou o único lugar. O spot retornou `reserved: true`;
`PartnerCreated` apareceu em `stored_event` e `PartnerCreatedIntegrationEvent`
foi consumido no app de e-mails.

## Testes e build

- Regressão: **16 suítes aprovadas, 2 suítes skipped; 28 testes aprovados,
  2 skipped**, preservando os skips de controllers do projeto.
- Os 14 novos casos cobrem domínio sem conexão com banco, persistência MySQL,
  mensagens de erro e o fluxo em processo com os dois handlers registrados.
- `npm run build`: compilação concluída.
- `npx nest start emails`: compilação e inicialização do novo subscriber concluídas.

## Roteiro HTTP com banco limpo

Depois dos testes, `npx mikro-orm schema:fresh --run` recriou todas as tabelas.
As chamadas do roteiro atualizado criaram A/B, compraram o único lugar com A,
inseriram B na fila e cancelaram o pedido com um único POST.

| Verificação | Resultado observado |
| --- | --- |
| Resposta do cancelamento | `status: "CANCELLED"` |
| GET de spots | `reserved: false`, `is_published: true` |
| GET da fila antes/depois | Mesma entrada: `PENDING` → `NOTIFIED`, posição 1 |
| `SELECT COUNT(*) FROM spot_reservation` | `0` |
| App de e-mails | Log `ConsumerService.handleWaitingCustomer` com os quatro IDs |
| `SELECT type_name FROM stored_event` | `PartnerCreated`, `CustomerJoinedWaitingList`, `OrderCancelled`, `EventSpotReleased`, `SpotOfferedToWaitingCustomer` |

Exemplo do log efetivamente recebido pelo consumidor RabbitMQ:

```text
ConsumerService.handleWaitingCustomer {
  event_name: 'SpotOfferedToWaitingCustomerIntegrationEvent',
  customer_id: '96f80411-cfef-40b1-94f5-4177bcec2fa1',
  event_id: 'cbd013f6-342e-4d94-bf20-5335da684caf',
  section_id: '0a1df13e-7c6e-473b-b3e8-ce68d777c664',
  spot_id: 'b3f9f95e-f7e0-4447-a155-4b8bc2cdf008'
}
```

O SELECT acima não implica ordem de publicação: a tabela não foi consultada com
`ORDER BY`. Os testes verificam a ocorrência dos eventos e seus efeitos.
