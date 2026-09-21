import { IIntegrationEvent } from '../../../../common/domain/integration-event';
import { SpotOfferedToWaitingCustomer } from '../domain-events/spot-offered-to-waiting-customer.event';

export class SpotOfferedToWaitingCustomerIntegrationEvent
  implements IIntegrationEvent
{
  event_name = SpotOfferedToWaitingCustomerIntegrationEvent.name;
  event_version = 1;
  occurred_on: Date;
  payload: {
    customer_id: string;
    event_id: string;
    section_id: string;
    spot_id: string;
  };

  constructor(event: SpotOfferedToWaitingCustomer) {
    this.occurred_on = event.occurred_on;
    this.payload = {
      customer_id: event.customer_id.value,
      event_id: event.event_id.value,
      section_id: event.section_id.value,
      spot_id: event.spot_id.value,
    };
  }
}
