export interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  eventData: any;
  timestamp: Date;
  version: number;
}

export abstract class BaseDomainEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly timestamp: Date;
  public readonly version: number;

  constructor(
    public readonly eventType: string,
    public readonly aggregateId: string,
    public readonly eventData: any,
    version: number
  ) {
    this.eventId = this.generateEventId();
    this.timestamp = new Date();
    this.version = version;
  }

  private generateEventId(): string {
    return `${this.eventType}-${this.aggregateId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}