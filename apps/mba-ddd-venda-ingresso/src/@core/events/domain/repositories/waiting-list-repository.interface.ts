import { IRepository } from '../../../common/domain/repository-interface';
import { WaitingList } from '../entities/waiting-list.entity';
import { EventId } from '../entities/event.entity';
import { EventSectionId } from '../entities/event-section';

export interface IWaitingListRepository extends IRepository<WaitingList> {
  findByEventAndSection(
    event_id: EventId,
    section_id: EventSectionId,
  ): Promise<WaitingList | null>;
}
