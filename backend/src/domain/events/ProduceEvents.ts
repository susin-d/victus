import { BaseDomainEvent } from './DomainEvent';

export class ProduceRegisteredEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    farmerId: string,
    origin: string,
    quality: string,
    initialPrice: number
  ) {
    super('ProduceRegistered', aggregateId, {
      farmerId,
      origin,
      quality,
      initialPrice
    }, 1);
  }
}

export class ProduceQualityUpdatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    oldQuality: string,
    newQuality: string,
    updaterId: string
  ) {
    super('ProduceQualityUpdated', aggregateId, {
      oldQuality,
      newQuality,
      updaterId
    }, 0); // Version will be set by aggregate
  }
}

export class ProducePriceUpdatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    oldPrice: number,
    newPrice: number,
    updaterId: string
  ) {
    super('ProducePriceUpdated', aggregateId, {
      oldPrice,
      newPrice,
      updaterId
    }, 0); // Version will be set by aggregate
  }
}

export class ProduceDeactivatedEvent extends BaseDomainEvent {
  constructor(aggregateId: string) {
    super('ProduceDeactivated', aggregateId, {}, 0); // Version will be set by aggregate
  }
}