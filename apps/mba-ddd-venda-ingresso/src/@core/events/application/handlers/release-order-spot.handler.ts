import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { OrderCancelled } from '../../domain/events/domain-events/order-cancelled.event';
import { IEventRepository } from '../../domain/repositories/event-repository.interface';
import { ISpotReservationRepository } from '../../domain/repositories/spot-reservation-repository.interface';

export class ReleaseOrderSpotHandler implements IDomainEventHandler {
  constructor(
    private eventRepo: IEventRepository,
    private spotReservationRepo: ISpotReservationRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  static listensTo(): string[] {
    return [OrderCancelled.name];
  }

  async handle(cancelled: OrderCancelled): Promise<void> {
    const event = await this.eventRepo.findByEventSpotId(
      cancelled.event_spot_id,
    );

    if (!event) throw new Error('Event not found');

    event.markSpotAsAvailable(cancelled.event_spot_id);

    const reservation = await this.spotReservationRepo.findById(
      cancelled.event_spot_id,
    );

    if (reservation) await this.spotReservationRepo.delete(reservation);

    await this.eventRepo.add(event);

    await this.domainEventManager.publish(event);
  }
}
