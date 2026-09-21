import { initOrm } from './helpers';
import { WaitingList, WaitingListId } from '../waiting-list.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry.entity';
import { CustomerId } from '../customer.entity';
import { EventId } from '../event.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';

const createList = () =>
  WaitingList.create({
    event_id: new EventId(),
    section_id: new EventSectionId(),
  });

describe('WaitingList', () => {
  initOrm();
  it('joins with typed IDs, ordered pending entries and domain events', () => {
    const list = createList();
    const customer = new CustomerId();
    const first = list.join(customer);
    const second = list.join(new CustomerId());
    expect(list.id).toBeInstanceOf(WaitingListId);
    expect(first.status).toBe(WaitingListEntryStatus.PENDING);
    expect(list.orderedEntries).toEqual([first, second]);
    expect(list.orderedEntries.map((entry) => entry.position)).toEqual([1, 2]);
    expect([...list.events][0]).toEqual(
      expect.objectContaining({
        aggregate_id: list.id,
        customer_id: customer,
        event_id: list.event_id,
        section_id: list.section_id,
      }),
    );
    expect([...list.events][0]).toBeInstanceOf(CustomerJoinedWaitingList);
  });

  it('rejects a duplicate pending customer without changing the queue', () => {
    const list = createList();
    const customer = new CustomerId();
    list.join(customer);
    expect(() => list.join(new CustomerId(customer.value))).toThrow(
      'Customer already in waiting list',
    );
    expect(list.entries.size).toBe(1);
    expect(list.events.size).toBe(1);
  });

  it('notifies in arrival order, skips notified entries and allows rejoining', () => {
    const list = createList();
    const customer = new CustomerId();
    const first = list.join(customer);
    const second = list.join(new CustomerId());
    list.clearEvents();
    const spot = new EventSpotId();
    expect(list.notifyNext(spot)).toBe(first);
    expect(first.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(second.status).toBe(WaitingListEntryStatus.PENDING);
    expect([...list.events]).toEqual([
      expect.objectContaining({
        aggregate_id: list.id,
        customer_id: customer,
        event_id: list.event_id,
        section_id: list.section_id,
        spot_id: spot,
      }),
    ]);
    expect([...list.events][0]).toBeInstanceOf(SpotOfferedToWaitingCustomer);
    expect(list.notifyNext(spot)).toBe(second);
    expect(list.notifyNext(spot)).toBeUndefined();
    expect(list.events.size).toBe(2);
    const third = list.join(customer);
    expect(third.position).toBe(3);
    expect(third.status).toBe(WaitingListEntryStatus.PENDING);
  });

  it('does nothing when there are no entries', () => {
    const list = createList();
    expect(list.notifyNext(new EventSpotId())).toBeUndefined();
    expect(list.events.size).toBe(0);
  });
});
