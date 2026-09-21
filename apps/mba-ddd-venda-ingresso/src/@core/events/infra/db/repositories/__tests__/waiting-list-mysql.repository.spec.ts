import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  initWaitingListOrm,
  seedWaitingList,
  repositories,
} from '../../testing/waiting-list.fixture';
import {
  WaitingList,
  WaitingListId,
} from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryId } from '../../../../domain/entities/waiting-list-entry.entity';
import { CustomerId } from '../../../../domain/entities/customer.entity';
import { EventId } from '../../../../domain/entities/event.entity';
import { EventSectionId } from '../../../../domain/entities/event-section';
import { EventSpotId } from '../../../../domain/entities/event-spot';

describe('WaitingListMysqlRepository', () => {
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

  it('persists and reloads typed IDs, statuses and arrival order, and queries by event + section', async () => {
    const em = orm.em.fork();
    const { event, section, spot, customers } = await seedWaitingList(em);
    const { waitingListRepo: repo } = repositories(em);
    const list = WaitingList.create({
      event_id: event.id,
      section_id: section.id,
    });
    list.join(customers[1].id);
    list.join(customers[2].id);
    list.notifyNext(spot.id);
    // Store the collection reversed to prove the database mapping restores FIFO order.
    const entries = list.orderedEntries;
    entries[0].position = 2;
    entries[1].position = 1;
    await repo.add(list);
    await em.flush();
    em.clear();
    const found = await repo.findById(list.id.value);
    expect(found.toJSON()).toEqual(list.toJSON());
    expect(found.id).toBeInstanceOf(WaitingListId);
    expect(found.event_id).toBeInstanceOf(EventId);
    expect(found.section_id).toBeInstanceOf(EventSectionId);
    expect(found.entries.values().map((entry) => entry.position)).toEqual([
      1, 2,
    ]);
    expect(found.orderedEntries[0].id).toBeInstanceOf(WaitingListEntryId);
    expect(found.orderedEntries[0].customer_id).toBeInstanceOf(CustomerId);
    expect(found.events.size).toBe(0);
    expect(await repo.findByEventAndSection(event.id, section.id)).toBe(found);
    expect(
      await repo.findByEventAndSection(event.id, new EventSectionId()),
    ).toBeNull();
    found.notifyNext(spot.id);
    await repo.add(found);
    await em.flush();
    em.clear();
    expect(
      (await repo.findById(list.id)).orderedEntries.map(
        (entry) => entry.status,
      ),
    ).toEqual(['NOTIFIED', 'NOTIFIED']);
    expect(await repo.findAll()).toHaveLength(1);
    await repo.delete(await repo.findById(list.id));
    await em.flush();
    em.clear();
    expect(await repo.findById(list.id)).toBeNull();
  });

  it('persists an empty queue and enforces one list per event + section', async () => {
    const em = orm.em.fork();
    const { event, section } = await seedWaitingList(em);
    const { waitingListRepo: repo } = repositories(em);
    const list = WaitingList.create({
      event_id: event.id,
      section_id: section.id,
    });
    await repo.add(list);
    await em.flush();
    em.clear();
    expect((await repo.findById(list.id)).orderedEntries).toEqual([]);
    await repo.add(
      WaitingList.create({ event_id: event.id, section_id: section.id }),
    );
    await expect(em.flush()).rejects.toThrow();
  });

  it('finds the complete Event by a child spot and returns null for an unknown spot', async () => {
    const em = orm.em.fork();
    const { event, spot } = await seedWaitingList(em);
    const { eventRepo } = repositories(em);
    const loaded = await eventRepo.findById(event.id);
    loaded.addSection({ name: 'Other', total_spots: 2, price: 100 });
    await eventRepo.add(loaded);
    await em.flush();
    em.clear();
    const found = await eventRepo.findByEventSpotId(spot.id);
    expect(found.id.equals(event.id)).toBe(true);
    expect(found.sections.size).toBe(2);
    expect(
      found.sections
        .values()
        .reduce((total, section) => total + section.spots.size, 0),
    ).toBe(3);
    expect(await eventRepo.findByEventSpotId(new EventSpotId())).toBeNull();
  });
});
