import { MikroORM, MySqlDriver, EntityManager } from '@mikro-orm/mysql';
import * as schemas from '../schemas';
import { StoredEventSchema } from '../../../../stored-events/infra/db/schemas';
import { Partner } from '../../../domain/entities/partner.entity';
import { Customer } from '../../../domain/entities/customer.entity';
import { EventMysqlRepository } from '../repositories/event-mysql.repository';
import { CustomerMysqlRepository } from '../repositories/customer-mysql.repository';
import { WaitingListMysqlRepository } from '../repositories/waiting-list-mysql.repository';
import { OrderMysqlRepository } from '../repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../repositories/spot-reservation-mysql.repository';
import { UnitOfWorkMikroOrm } from '../../../../common/infra/unit-of-work-mikro-orm';

export async function initWaitingListOrm() {
  return MikroORM.init<MySqlDriver>({
    entities: [...Object.values(schemas), StoredEventSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
}

export async function seedWaitingList(em: EntityManager) {
  const partner = Partner.create({ name: 'Partner' });
  const customers = [
    Customer.create({ name: 'A', cpf: '59211087074' }),
    Customer.create({ name: 'B', cpf: '70375887091' }),
    Customer.create({ name: 'C', cpf: '99346413050' }),
  ];
  const event = partner.initEvent({
    name: 'Event',
    date: new Date(),
    description: 'Waiting list',
  });
  event.addSection({ name: 'Section', total_spots: 1, price: 200 });
  event.publishAll();
  const section = event.sections.values()[0];
  const spot = section.spots.values()[0];
  em.persist([partner, ...customers, event]);
  await em.flush();
  em.clear();
  return { event, section, spot, customers };
}

export function repositories(em: EntityManager) {
  return {
    eventRepo: new EventMysqlRepository(em),
    customerRepo: new CustomerMysqlRepository(em),
    waitingListRepo: new WaitingListMysqlRepository(em),
    orderRepo: new OrderMysqlRepository(em),
    reservationRepo: new SpotReservationMysqlRepository(em),
    uow: new UnitOfWorkMikroOrm(em),
  };
}
