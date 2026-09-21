import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  initWaitingListOrm,
  seedWaitingList,
  repositories,
} from '../infra/db/testing/waiting-list.fixture';
import { DomainEventManager } from '../../common/domain/domain-event-manager';
import { ApplicationService } from '../../common/application/application.service';
import { ReleaseOrderSpotHandler } from './handlers/release-order-spot.handler';
import { NotifyWaitingCustomerHandler } from './handlers/notify-waiting-customer.handler';
import { CancelOrderService } from './cancel-order.service';
import { WaitingListService } from './waiting-list.service';
import { OrderService } from './order.service';
import { PaymentGateway } from './payment.gateway';
import { SpotOfferedToWaitingCustomer } from '../domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../domain/events/integration-events/spot-offered-to-waiting-customer.int-events';
import { StoredEventMysqlRepository } from '../../stored-events/infra/db/repositories/stored-event-mysql.repository';
import { StoredEvent } from '../../stored-events/domain/entities/stored-event.entity';
import { Order, OrderId, OrderStatus } from '../domain/entities/order.entity';
import { CustomerId } from '../domain/entities/customer.entity';
import { EventId } from '../domain/entities/event.entity';
import { EventSectionId } from '../domain/entities/event-section';
import { SpotReservation } from '../domain/entities/spot-reservation.entity';

describe('Waiting list: command → domain reactions → integration event', () => {
  let orm: MikroORM<MySqlDriver>;
  beforeAll(async () => {
    orm = await initWaitingListOrm();
  });
  beforeEach(async () => {
    await orm.schema.refreshDatabase();
  });
  afterAll(async () => {
    await orm?.close();
  });

  async function setup() {
    const em = orm.em.fork();
    const data = await seedWaitingList(em);
    const repos = repositories(em);
    const manager = new DomainEventManager();
    const app = new ApplicationService(repos.uow, manager);
    const release = new ReleaseOrderSpotHandler(
      repos.eventRepo,
      repos.reservationRepo,
      manager,
    );
    const notify = new NotifyWaitingCustomerHandler(
      repos.waitingListRepo,
      manager,
    );
    ReleaseOrderSpotHandler.listensTo().forEach((name) =>
      manager.register(name, (event) => release.handle(event)),
    );
    NotifyWaitingCustomerHandler.listensTo().forEach((name) =>
      manager.register(name, (event) => notify.handle(event)),
    );
    const storedEvents = new StoredEventMysqlRepository(em);
    manager.register('*', (event) => {
      storedEvents.add(event);
    });
    const integrations: SpotOfferedToWaitingCustomerIntegrationEvent[] = [];
    manager.registerForIntegrationEvent(
      SpotOfferedToWaitingCustomer.name,
      (event) => {
        integrations.push(
          new SpotOfferedToWaitingCustomerIntegrationEvent(event),
        );
      },
    );
    const waiting = new WaitingListService(
      repos.waitingListRepo,
      repos.customerRepo,
      repos.eventRepo,
      app,
      repos.reservationRepo,
    );
    const cancel = new CancelOrderService(repos.orderRepo, app);
    const purchase = new OrderService(
      repos.orderRepo,
      repos.customerRepo,
      repos.eventRepo,
      repos.reservationRepo,
      repos.uow,
      new PaymentGateway(),
    );
    const input = {
      event_id: data.event.id.value,
      section_id: data.section.id.value,
      customer_id: data.customers[1].id.value,
    };
    async function buy() {
      const order = await purchase.create({
        ...input,
        customer_id: data.customers[0].id.value,
        spot_id: data.spot.id.value,
        card_token: 'tok_visa',
      });
      em.clear(); // Each HTTP request has its own identity map.
      return order;
    }
    return { ...data, ...repos, em, waiting, cancel, buy, input, integrations };
  }

  it('cancels a purchase, releases the spot and lock, promotes only the first pending customer and publishes all events', async () => {
    const f = await setup();
    const order = await f.buy();
    await f.waiting.join(f.input);
    f.em.clear();
    await f.waiting.join({ ...f.input, customer_id: f.customers[2].id.value });
    f.em.clear();
    expect(
      (await f.waiting.list(f.input.event_id, f.input.section_id)).map(
        (entry) => entry.status,
      ),
    ).toEqual(['PENDING', 'PENDING']);
    f.em.clear();
    expect((await f.cancel.cancel(order.id.value)).status).toBe(
      OrderStatus.CANCELLED,
    );
    f.em.clear();
    const event = await f.eventRepo.findById(f.event.id);
    expect(
      event.allowReserveSpot({ section_id: f.section.id, spot_id: f.spot.id }),
    ).toBe(true);
    expect(event.sections.values()[0].spots.values()[0].is_reserved).toBe(
      false,
    );
    expect(await f.reservationRepo.findById(f.spot.id)).toBeNull();
    const list = await f.waitingListRepo.findByEventAndSection(
      f.event.id,
      f.section.id,
    );
    expect(list.orderedEntries.map((entry) => entry.status)).toEqual([
      'NOTIFIED',
      'PENDING',
    ]);
    expect(list.orderedEntries[0].customer_id.equals(f.customers[1].id)).toBe(
      true,
    );
    expect(f.integrations).toHaveLength(1);
    expect(f.integrations[0]).toMatchObject({
      event_name: 'SpotOfferedToWaitingCustomerIntegrationEvent',
      event_version: 1,
      payload: { ...f.input, spot_id: f.spot.id.value },
    });
    const names = (await f.em.find(StoredEvent, {})).map(
      (event) => event.type_name,
    );
    expect(
      names.filter((name) => name === 'CustomerJoinedWaitingList'),
    ).toHaveLength(2);
    for (const name of [
      'OrderCancelled',
      'EventSpotReleased',
      'SpotOfferedToWaitingCustomer',
    ]) {
      expect(names.filter((item) => item === name)).toHaveLength(1);
    }
    await expect(f.cancel.cancel(order.id.value)).rejects.toThrow(
      'Order already cancelled',
    );
    expect(f.integrations).toHaveLength(1);
    f.em.clear();
    // A normal purchase is still allowed; notification gave no reservation or priority.
    const nextOrder = await f.buy();
    await f.cancel.cancel(nextOrder.id.value);
    f.em.clear();
    expect(
      (await f.waiting.list(f.input.event_id, f.input.section_id)).map(
        (entry) => entry.status,
      ),
    ).toEqual(['NOTIFIED', 'NOTIFIED']);
    expect(f.integrations).toHaveLength(2);
    const thirdOrder = await f.buy();
    await f.cancel.cancel(thirdOrder.id.value);
    expect(f.integrations).toHaveLength(2);
  });

  it('cancels without a waiting list and accepts pending orders without a reservation lock', async () => {
    const f = await setup();
    const order = await f.buy();
    await f.cancel.cancel(order.id.value);
    f.em.clear();
    expect(await f.reservationRepo.findById(f.spot.id)).toBeNull();
    expect(f.integrations).toHaveLength(0);
    const pending = Order.create({
      customer_id: f.customers[0].id,
      event_spot_id: f.spot.id,
      amount: 200,
    });
    await f.orderRepo.add(pending);
    await f.em.flush();
    f.em.clear();
    expect((await f.cancel.cancel(pending.id.value)).status).toBe(
      OrderStatus.CANCELLED,
    );
    expect(await f.waiting.list(f.input.event_id, f.input.section_id)).toEqual(
      [],
    );
  });

  it('validates missing order, customer, event, section and available spots', async () => {
    const f = await setup();
    await expect(f.cancel.cancel(new OrderId().value)).rejects.toThrow(
      'Order not found',
    );
    await expect(
      f.waiting.join({ ...f.input, customer_id: new CustomerId().value }),
    ).rejects.toThrow('Customer not found');
    await expect(
      f.waiting.join({ ...f.input, event_id: new EventId().value }),
    ).rejects.toThrow('Event not found');
    await expect(
      f.waiting.join({ ...f.input, section_id: new EventSectionId().value }),
    ).rejects.toThrow('Section not found');
    // A stale reserved counter cannot make an available section sold out.
    const event = await f.eventRepo.findById(f.event.id);
    event.sections.values()[0].total_spots_reserved = 1;
    await expect(f.waiting.join(f.input)).rejects.toThrow(
      'Section is not sold out',
    );
    expect(await f.waitingListRepo.findAll()).toEqual([]);
    await f.buy();
    await f.waiting.join(f.input);
    f.em.clear();
    await expect(f.waiting.join(f.input)).rejects.toThrow(
      'Customer already in waiting list',
    );
    expect(
      await f.waiting.list(f.input.event_id, f.input.section_id),
    ).toHaveLength(1);
  });

  it('considers a reservation lock when checking availability', async () => {
    const f = await setup();
    await f.reservationRepo.add(
      SpotReservation.create({
        spot_id: f.spot.id,
        customer_id: f.customers[0].id,
      }),
    );
    await f.em.flush();
    f.em.clear();
    expect((await f.waiting.join(f.input)).status).toBe('PENDING');
  });
});
