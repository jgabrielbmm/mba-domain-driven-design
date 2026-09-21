import { IDomainEvent } from '../../../../common/domain/domain-event';
import { WaitingListId } from '../../entities/waiting-list.entity';
import { CustomerId } from '../../entities/customer.entity';
import { EventId } from '../../entities/event.entity';
import { EventSectionId } from '../../entities/event-section';

export class CustomerJoinedWaitingList implements IDomainEvent {
  readonly event_version = 1;
  readonly occurred_on = new Date();

  constructor(
    readonly aggregate_id: WaitingListId,
    readonly customer_id: CustomerId,
    readonly event_id: EventId,
    readonly section_id: EventSectionId,
  ) {}
}
