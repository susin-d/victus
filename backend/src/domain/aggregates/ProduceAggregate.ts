import { DomainEvent, BaseDomainEvent } from '../events/DomainEvent';
import { ProduceRegisteredEvent, ProduceQualityUpdatedEvent } from '../events/ProduceEvents';
import { v4 as uuidv4 } from 'uuid';

export class ProduceAggregate {
  private events: DomainEvent[] = [];
  private _version: number = 0;

  constructor(
    private _id: string,
    private _farmerId: string,
    private _origin: string,
    private _quality: string,
    private _initialPrice: number,
    private _currentPrice: number,
    private _status: string = 'REGISTERED',
    private _createdAt: Date = new Date(),
    private _updatedAt: Date = new Date()
  ) {}

  static register(
    farmerId: string,
    origin: string,
    quality: string,
    initialPrice: number
  ): ProduceAggregate {
    const id = uuidv4();
    const produce = new ProduceAggregate(
      id,
      farmerId,
      origin,
      quality,
      initialPrice,
      initialPrice
    );

    produce.addEvent(new ProduceRegisteredEvent(
      id,
      farmerId,
      origin,
      quality,
      initialPrice
    ));

    return produce;
  }

  updateQuality(newQuality: string, updaterId: string): void {
    if (this._farmerId !== updaterId) {
      throw new Error('Only the farmer can update produce quality');
    }

    if (this._status !== 'REGISTERED' && this._status !== 'ACTIVE') {
      throw new Error('Cannot update quality of inactive produce');
    }

    const oldQuality = this._quality;
    this._quality = newQuality;
    this._updatedAt = new Date();

    this.addEvent(new ProduceQualityUpdatedEvent(
      this._id,
      oldQuality,
      newQuality,
      updaterId
    ));
  }

  updatePrice(newPrice: number, updaterId: string): void {
    if (newPrice <= 0) {
      throw new Error('Price must be positive');
    }

    this._currentPrice = newPrice;
    this._updatedAt = new Date();

    // Add price update event
    this.addEvent({
      eventId: uuidv4(),
      eventType: 'ProducePriceUpdated',
      aggregateId: this._id,
      eventData: {
        oldPrice: this._currentPrice,
        newPrice,
        updaterId
      },
      timestamp: new Date(),
      version: this._version + 1
    });
  }

  deactivate(): void {
    this._status = 'INACTIVE';
    this._updatedAt = new Date();

    this.addEvent({
      eventId: uuidv4(),
      eventType: 'ProduceDeactivated',
      aggregateId: this._id,
      eventData: {},
      timestamp: new Date(),
      version: this._version + 1
    });
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
    this._version++;
  }

  // Getters
  get id(): string { return this._id; }
  get farmerId(): string { return this._farmerId; }
  get origin(): string { return this._origin; }
  get quality(): string { return this._quality; }
  get initialPrice(): number { return this._initialPrice; }
  get currentPrice(): number { return this._currentPrice; }
  get status(): string { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get version(): number { return this._version; }

  // Event sourcing methods
  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  markEventsAsCommitted(): void {
    this.events = [];
  }

  // Rebuild from events (for event sourcing)
  static fromEvents(events: DomainEvent[]): ProduceAggregate {
    if (events.length === 0) {
      throw new Error('Cannot rebuild aggregate from empty events');
    }

    const firstEvent = events[0] as ProduceRegisteredEvent;
    const produce = new ProduceAggregate(
      firstEvent.aggregateId,
      firstEvent.eventData.farmerId,
      firstEvent.eventData.origin,
      firstEvent.eventData.quality,
      firstEvent.eventData.initialPrice,
      firstEvent.eventData.initialPrice
    );

    // Apply remaining events
    for (let i = 1; i < events.length; i++) {
      produce.applyEvent(events[i]);
    }

    return produce;
  }

  private applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'ProduceQualityUpdated':
        const qualityEvent = event as ProduceQualityUpdatedEvent;
        this._quality = qualityEvent.eventData.newQuality;
        break;
      case 'ProducePriceUpdated':
        this._currentPrice = event.eventData.newPrice;
        break;
      case 'ProduceDeactivated':
        this._status = 'INACTIVE';
        break;
    }
    this._updatedAt = event.timestamp;
    this._version = event.version;
  }
}