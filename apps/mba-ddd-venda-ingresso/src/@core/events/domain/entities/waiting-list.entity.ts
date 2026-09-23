import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';
import { EventId } from './event.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import {
  WaitingListEntry,
  WaitingListEntryStatus,
} from './waiting-list-entry.entity';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';

export class WaitingListId extends Uuid {}

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: {
    id?: WaitingListId | string;
    event_id: EventId | string;
    section_id: EventSectionId | string;
  }) {
    super();

    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();

    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);

    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);

    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(props: { event_id: EventId; section_id: EventSectionId }) {
    return new WaitingList(props);
  }

  join(customer_id: CustomerId): WaitingListEntry {
    if (
      this.entries.find(
        (entry) =>
          entry.customer_id.equals(customer_id) &&
          entry.status === WaitingListEntryStatus.PENDING,
      )
    ) {
      throw new Error('Customer already in waiting list');
    }

    const position =
      this.entries
        .map((entry) => entry.position)
        .reduce((max, n) => Math.max(max, n), 0) + 1;
    const entry = new WaitingListEntry({ customer_id, position });

    this.entries.add(entry);

    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        customer_id,
        this.event_id,
        this.section_id,
      ),
    );

    return entry;
  }

  notifyNext(spot_id: EventSpotId): WaitingListEntry | undefined {
    const entry = this.orderedEntries.find(
      (entry) => entry.status === WaitingListEntryStatus.PENDING,
    );

    if (!entry) return;

    entry.notify();

    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        entry.customer_id,
        this.event_id,
        this.section_id,
        spot_id,
      ),
    );

    return entry;
  }

  get orderedEntries(): WaitingListEntry[] {
    return this.entries
      .map((entry) => entry)
      .sort((a, b) => a.position - b.position);
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: this.orderedEntries.map((entry) => entry.toJSON()),
    };
  }
}
