import { IDomainEvent } from '../../../../common/domain/domain-event';
import { EventId } from '../../entities/event.entity';
import { EventSectionId } from '../../entities/event-section';
import { EventSpotId } from '../../entities/event-spot';

export class EventSpotReleased implements IDomainEvent {
  readonly event_version = 1;
  readonly occurred_on = new Date();
  readonly event_id: EventId;

  constructor(
    readonly aggregate_id: EventId,
    readonly section_id: EventSectionId,
    readonly spot_id: EventSpotId,
  ) {
    this.event_id = aggregate_id;
  }
}
