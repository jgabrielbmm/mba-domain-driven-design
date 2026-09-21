import { initOrm } from './helpers';
import { Order, OrderStatus } from '../order.entity';
import { CustomerId } from '../customer.entity';
import { Event } from '../event.entity';
import { EventSpotId } from '../event-spot';
import { PartnerId } from '../partner.entity';
import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';
import { EventSpotReleased } from '../../events/domain-events/event-spot-released.event';

describe('Order cancellation', () => {
  it.each([OrderStatus.PENDING, OrderStatus.PAID])(
    'cancels status %s and records the spot',
    (status) => {
      const order = Order.create({
        customer_id: new CustomerId(),
        event_spot_id: new EventSpotId(),
        amount: 100,
      });
      if (status === OrderStatus.PAID) order.pay();
      order.clearEvents();
      order.cancel();
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.toJSON().status).toBe('CANCELLED');
      expect([...order.events]).toEqual([
        expect.objectContaining({
          aggregate_id: order.id,
          status: OrderStatus.CANCELLED,
          event_spot_id: order.event_spot_id,
        }),
      ]);
      expect([...order.events][0]).toBeInstanceOf(OrderCancelled);
      expect(() => order.cancel()).toThrow('Order already cancelled');
      expect(order.events.size).toBe(1);
    },
  );
});

describe('Event spot release', () => {
  initOrm();
  it('finds the owning section, releases only the requested spot and emits its IDs', () => {
    const event = Event.create({
      name: 'Event',
      date: new Date(),
      partner_id: new PartnerId(),
    });
    event.addSection({ name: 'Other section', total_spots: 1, price: 50 });
    event.addSection({ name: 'Section', total_spots: 2, price: 100 });
    event.publishAll();
    const section = event.sections.values()[1];
    const [first, second] = section.spots.values();
    event.markSpotAsReserved({ section_id: section.id, spot_id: first.id });
    event.markSpotAsReserved({ section_id: section.id, spot_id: second.id });
    event.clearEvents();
    event.markSpotAsAvailable(first.id);
    expect(first.is_reserved).toBe(false);
    expect(second.is_reserved).toBe(true);
    expect(
      event.allowReserveSpot({ section_id: section.id, spot_id: first.id }),
    ).toBe(true);
    expect([...event.events]).toEqual([
      expect.objectContaining({
        aggregate_id: event.id,
        event_id: event.id,
        section_id: section.id,
        spot_id: first.id,
      }),
    ]);
    expect([...event.events][0]).toBeInstanceOf(EventSpotReleased);
    expect(() => event.markSpotAsAvailable(new EventSpotId())).toThrow(
      'Spot not found',
    );
    expect(() => section.markSpotAsAvailable(new EventSpotId())).toThrow(
      'Spot not found',
    );
    expect(event.events.size).toBe(1);
  });
});
