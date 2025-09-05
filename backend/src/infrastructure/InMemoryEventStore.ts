import { DomainEvent } from '../domain/events/DomainEvent';

export interface IEventStore {
  saveEvents(aggregateId: string, events: DomainEvent[]): Promise<void>;
  getEvents(aggregateId: string): Promise<DomainEvent[]>;
}

export class InMemoryEventStore implements IEventStore {
  private events = new Map<string, DomainEvent[]>();

  async saveEvents(aggregateId: string, events: DomainEvent[]): Promise<void> {
    if (!this.events.has(aggregateId)) {
      this.events.set(aggregateId, []);
    }

    const existingEvents = this.events.get(aggregateId)!;
    existingEvents.push(...events);
  }

  async getEvents(aggregateId: string): Promise<DomainEvent[]> {
    return this.events.get(aggregateId) || [];
  }
}