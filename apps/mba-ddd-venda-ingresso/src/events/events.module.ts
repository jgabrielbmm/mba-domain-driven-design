import { CancelOrderService } from '../@core/events/application/cancel-order.service';
import { WaitingListService } from '../@core/events/application/waiting-list.service';
import { WaitingListMysqlRepository } from '../@core/events/infra/db/repositories/waiting-list-mysql.repository';
import { WaitingListController } from './events/waiting-list.controller';
import { ReleaseOrderSpotHandler } from '../@core/events/application/handlers/release-order-spot.handler';
import { NotifyWaitingCustomerHandler } from '../@core/events/application/handlers/notify-waiting-customer.handler';
import { SpotOfferedToWaitingCustomer } from '../@core/events/domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../@core/events/domain/events/integration-events/spot-offered-to-waiting-customer.int-events';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module, OnModuleInit } from '@nestjs/common';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListSchema,
  WaitingListEntrySchema,
} from '../@core/events/infra/db/schemas';
import { PartnerMysqlRepository } from '../@core/events/infra/db/repositories/partner-mysql.repository';
import { EntityManager } from '@mikro-orm/mysql';
import { CustomerMysqlRepository } from '../@core/events/infra/db/repositories/customer-mysql.repository';
import { EventMysqlRepository } from '../@core/events/infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../@core/events/infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../@core/events/infra/db/repositories/spot-reservation-mysql.repository';
import { PartnerService } from '../@core/events/application/partner.service';
import { CustomerService } from '../@core/events/application/customer.service';
import { EventService } from '../@core/events/application/event.service';
import { OrderService } from '../@core/events/application/order.service';
import { PaymentGateway } from '../@core/events/application/payment.gateway';
import { IPartnerRepository } from '../@core/events/domain/repositories/partner-repository.interface';
import { PartnersController } from './partners/partners.controller';
import { CustomersController } from './customers/customers.controller';
import { EventsController } from './events/events.controller';
import { EventSectionsController } from './events/event-sections.controller';
import { EventSpotsController } from './events/event-spots.controller';
import { OrdersController } from './orders/orders.controller';
import { ApplicationModule } from '../application/application.module';
import { ApplicationService } from '../@core/common/application/application.service';
import { DomainEventManager } from '../@core/common/domain/domain-event-manager';
import { PartnerCreated } from '../@core/events/domain/events/domain-events/partner-created.event';
import { MyHandlerHandler } from '../@core/events/application/handlers/my-handler.handler';
import { ModuleRef } from '@nestjs/core';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { IIntegrationEvent } from '../@core/common/domain/integration-event';
import { PartnerCreatedIntegrationEvent } from '../@core/events/domain/events/integration-events/partner-created.int-events';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
      WaitingListSchema,
      WaitingListEntrySchema,
    ]),
    ApplicationModule,
    BullModule.registerQueue({
      name: 'integration-events',
    }),
  ],
  providers: [
    {
      provide: 'IWaitingListRepository',
      useFactory: (em: EntityManager) => new WaitingListMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: CancelOrderService,
      useFactory: (orderRepo, appService) =>
        new CancelOrderService(orderRepo, appService),
      inject: ['IOrderRepository', ApplicationService],
    },
    {
      provide: WaitingListService,
      useFactory: (
        waitingListRepo,
        customerRepo,
        eventRepo,
        appService,
        reservationRepo,
      ) =>
        new WaitingListService(
          waitingListRepo,
          customerRepo,
          eventRepo,
          appService,
          reservationRepo,
        ),
      inject: [
        'IWaitingListRepository',
        'ICustomerRepository',
        'IEventRepository',
        ApplicationService,
        'ISpotReservationRepository',
      ],
    },
    {
      provide: ReleaseOrderSpotHandler,
      useFactory: (eventRepo, reservationRepo, manager) =>
        new ReleaseOrderSpotHandler(eventRepo, reservationRepo, manager),
      inject: [
        'IEventRepository',
        'ISpotReservationRepository',
        DomainEventManager,
      ],
    },
    {
      provide: NotifyWaitingCustomerHandler,
      useFactory: (waitingListRepo, manager) =>
        new NotifyWaitingCustomerHandler(waitingListRepo, manager),
      inject: ['IWaitingListRepository', DomainEventManager],
    },
    {
      provide: 'IPartnerRepository',
      useFactory: (em: EntityManager) => new PartnerMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: 'ICustomerRepository',
      useFactory: (em: EntityManager) => new CustomerMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: 'IEventRepository',
      useFactory: (em: EntityManager) => new EventMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: 'IOrderRepository',
      useFactory: (em: EntityManager) => new OrderMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: 'ISpotReservationRepository',
      useFactory: (em: EntityManager) => new SpotReservationMysqlRepository(em),
      inject: [EntityManager],
    },
    {
      provide: PartnerService,
      useFactory: (
        partnerRepo: IPartnerRepository,
        appService: ApplicationService,
      ) => new PartnerService(partnerRepo, appService),
      inject: ['IPartnerRepository', ApplicationService],
    },
    {
      provide: CustomerService,
      useFactory: (customerRepo, uow) => new CustomerService(customerRepo, uow),
      inject: ['ICustomerRepository', 'IUnitOfWork'],
    },
    {
      provide: EventService,
      useFactory: (eventRepo, partnerRepo, uow) =>
        new EventService(eventRepo, partnerRepo, uow),
      inject: ['IEventRepository', 'IPartnerRepository', 'IUnitOfWork'],
    },
    PaymentGateway,
    {
      provide: OrderService,
      useFactory: (
        orderRepo,
        customerRepo,
        eventRepo,
        spotReservationRepo,
        uow,
        paymentGateway,
      ) =>
        new OrderService(
          orderRepo,
          customerRepo,
          eventRepo,
          spotReservationRepo,
          uow,
          paymentGateway,
        ),
      inject: [
        'IOrderRepository',
        'ICustomerRepository',
        'IEventRepository',
        'ISpotReservationRepository',
        'IUnitOfWork',
        PaymentGateway,
      ],
    },
    {
      provide: MyHandlerHandler,
      useFactory: (
        partnerRepo: IPartnerRepository,
        domainEventManager: DomainEventManager,
      ) => new MyHandlerHandler(partnerRepo, domainEventManager),
      inject: ['IPartnerRepository', DomainEventManager],
    },
  ],
  controllers: [
    WaitingListController,
    PartnersController,
    CustomersController,
    EventsController,
    EventSectionsController,
    EventSpotsController,
    OrdersController,
  ],
})
export class EventsModule implements OnModuleInit {
  constructor(
    private readonly domainEventManager: DomainEventManager,
    private moduleRef: ModuleRef,
    @InjectQueue('integration-events')
    private integrationEventsQueue: Queue<IIntegrationEvent>,
  ) {}

  onModuleInit() {
    console.log('EventsModule initialized');
    ReleaseOrderSpotHandler.listensTo().forEach((name) => {
      this.domainEventManager.register(name, async (event) => {
        const handler = await this.moduleRef.resolve(ReleaseOrderSpotHandler);
        await handler.handle(event);
      });
    });
    NotifyWaitingCustomerHandler.listensTo().forEach((name) => {
      this.domainEventManager.register(name, async (event) => {
        const handler = await this.moduleRef.resolve(
          NotifyWaitingCustomerHandler,
        );
        await handler.handle(event);
      });
    });
    this.domainEventManager.registerForIntegrationEvent(
      SpotOfferedToWaitingCustomer.name,
      async (event: SpotOfferedToWaitingCustomer) => {
        await this.integrationEventsQueue.add(
          new SpotOfferedToWaitingCustomerIntegrationEvent(event),
        );
      },
    );
    MyHandlerHandler.listensTo().forEach((eventName: string) => {
      this.domainEventManager.register(eventName, async (event) => {
        const handler: MyHandlerHandler = await this.moduleRef.resolve(
          MyHandlerHandler,
        );
        await handler.handle(event);
      });
    });
    this.domainEventManager.registerForIntegrationEvent(
      PartnerCreated.name,
      async (event) => {
        console.log('integration events');
        const integrationEvent = new PartnerCreatedIntegrationEvent(event);
        await this.integrationEventsQueue.add(integrationEvent);
      },
    );
  }
}
