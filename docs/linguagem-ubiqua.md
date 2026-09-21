# Linguagem ubíqua — lista de espera

| Termo | Nome no código | Definição |
| --- | --- | --- |
| Pedido | `Order` | Compra de um cliente para um lugar, com status pendente, pago ou cancelado. |
| Cancelamento | `Order.cancel`, `OrderCancelled` | Transição de pedido pendente ou pago para cancelado; informa o lugar às reações. Não envolve reembolso. |
| Evento | `Event` | Agregado que controla seções e lugares; a liberação de um lugar parte desta raiz. |
| Seção | `EventSection` | Agrupamento de lugares de um evento ao qual corresponde uma lista de espera. |
| Lugar | `EventSpot` | Unidade comprável de uma seção; sua disponibilidade depende da publicação e da reserva. |
| Trava de reserva | `SpotReservation` | Registro identificado pelo lugar que impede outra reserva; removido na reação ao cancelamento. |
| Liberação de lugar | `EventSpotReleased` | Fato registrado pelo Evento quando devolve o lugar; identifica evento, seção e lugar. |
| Lista de espera | `WaitingList` | Agregado independente, único por evento e seção, que controla entradas e sua ordem de chegada. |
| Entrada | `WaitingListEntry` | Entidade filha com cliente, posição de chegada e status `PENDING` ou `NOTIFIED`. |
| Entrada na fila | `CustomerJoinedWaitingList` | Fato emitido quando um cliente entra na lista de uma seção sem lugar disponível para reserva. |
| Ordem de chegada | `position` | Sequência crescente persistida; a menor posição pendente recebe o próximo aviso. |
| Notificação | `SpotOfferedToWaitingCustomer` | Primeiro cliente pendente é marcado como notificado. O aviso não reserva lugar nem confere prioridade. |
| Política de notificação | `NotifyWaitingCustomerHandler` | Reação à liberação que solicita à lista a notificação do primeiro pendente; sem pendentes, não faz nada. |
| Evento de integração | `SpotOfferedToWaitingCustomerIntegrationEvent` | Mensagem com IDs de cliente, evento, seção e lugar que cruza Bull/RabbitMQ até o contexto de e-mails. |
