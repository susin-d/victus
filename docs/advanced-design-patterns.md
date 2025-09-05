# Advanced Design Patterns Implementation Guide

## 🎯 Domain-Driven Design (DDD) Implementation

### Bounded Contexts Definition

```typescript
// Produce Management Bounded Context
export namespace ProduceManagement {
  export class ProduceAggregate {
    private events: DomainEvent[] = [];

    constructor(
      private id: ProduceId,
      private farmerId: FarmerId,
      private origin: Location,
      private quality: QualityGrade,
      private initialPrice: Price
    ) {}

    static register(
      id: ProduceId,
      farmerId: FarmerId,
      origin: Location,
      quality: QualityGrade,
      initialPrice: Price
    ): ProduceAggregate {
      const produce = new ProduceAggregate(id, farmerId, origin, quality, initialPrice);
      produce.addEvent(new ProduceRegisteredEvent(id, farmerId, origin, quality, initialPrice));
      return produce;
    }

    updateQuality(newQuality: QualityGrade, updaterId: UserId): void {
      this.ensureCanUpdate(updaterId);
      this.quality = newQuality;
      this.addEvent(new ProduceQualityUpdatedEvent(this.id, newQuality, updaterId));
    }

    private ensureCanUpdate(updaterId: UserId): void {
      if (this.farmerId !== updaterId) {
        throw new UnauthorizedProduceUpdateError(this.id, updaterId);
      }
    }

    private addEvent(event: DomainEvent): void {
      this.events.push(event);
    }

    getUncommittedEvents(): DomainEvent[] {
      return [...this.events];
    }

    markEventsAsCommitted(): void {
      this.events = [];
    }
  }
}
```

### Value Objects Implementation

```typescript
// Value Objects for type safety and business rules
export class Price {
  constructor(private readonly value: number, private readonly currency: string = 'ETH') {
    this.validate();
  }

  private validate(): void {
    if (this.value < 0) {
      throw new InvalidPriceError('Price cannot be negative');
    }
    if (this.value > 1000000) {
      throw new InvalidPriceError('Price exceeds maximum allowed value');
    }
  }

  add(other: Price): Price {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
    return new Price(this.value + other.value, this.currency);
  }

  multiply(factor: number): Price {
    return new Price(this.value * factor, this.currency);
  }

  toString(): string {
    return `${this.value} ${this.currency}`;
  }
}

export class Location {
  constructor(
    private readonly latitude: number,
    private readonly longitude: number,
    private readonly address: string
  ) {
    this.validateCoordinates();
  }

  private validateCoordinates(): void {
    if (this.latitude < -90 || this.latitude > 90) {
      throw new InvalidLocationError('Invalid latitude');
    }
    if (this.longitude < -180 || this.longitude > 180) {
      throw new InvalidLocationError('Invalid longitude');
    }
  }

  distanceTo(other: Location): number {
    // Haversine formula implementation
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(other.latitude - this.latitude);
    const dLon = this.toRadians(other.longitude - this.longitude);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRadians(this.latitude)) * Math.cos(this.toRadians(other.latitude)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
```

## 🔄 CQRS Implementation

### Command Handlers

```typescript
// Command definitions
export abstract class Command {
  readonly commandId: string;
  readonly timestamp: Date;

  constructor() {
    this.commandId = uuidv4();
    this.timestamp = new Date();
  }
}

export class RegisterProduceCommand extends Command {
  constructor(
    readonly produceId: ProduceId,
    readonly farmerId: FarmerId,
    readonly origin: Location,
    readonly quality: QualityGrade,
    readonly initialPrice: Price
  ) {
    super();
  }
}

export class UpdateProduceQualityCommand extends Command {
  constructor(
    readonly produceId: ProduceId,
    readonly newQuality: QualityGrade,
    readonly updaterId: UserId
  ) {
    super();
  }
}

// Command Handlers
export interface ICommandHandler<T extends Command> {
  handle(command: T): Promise<void>;
}

@Injectable()
export class RegisterProduceCommandHandler implements ICommandHandler<RegisterProduceCommand> {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly produceRepository: IProduceRepository
  ) {}

  async handle(command: RegisterProduceCommand): Promise<void> {
    // Validate command
    await this.validateCommand(command);

    // Create aggregate
    const produce = ProduceAggregate.register(
      command.produceId,
      command.farmerId,
      command.origin,
      command.quality,
      command.initialPrice
    );

    // Save events
    await this.eventStore.saveEvents(command.produceId, produce.getUncommittedEvents());

    // Publish events
    await this.publishEvents(produce.getUncommittedEvents());

    produce.markEventsAsCommitted();
  }

  private async validateCommand(command: RegisterProduceCommand): Promise<void> {
    // Business rule validations
    const existingProduce = await this.produceRepository.findById(command.produceId);
    if (existingProduce) {
      throw new ProduceAlreadyExistsError(command.produceId);
    }

    // Additional validations...
  }

  private async publishEvents(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }
}
```

### Query Handlers

```typescript
// Query definitions
export abstract class Query {
  readonly queryId: string;
  readonly timestamp: Date;

  constructor() {
    this.queryId = uuidv4();
    this.timestamp = new Date();
  }
}

export class GetProduceDetailsQuery extends Query {
  constructor(readonly produceId: ProduceId) {
    super();
  }
}

export class GetFarmerProducesQuery extends Query {
  constructor(
    readonly farmerId: FarmerId,
    readonly page: number = 1,
    readonly limit: number = 20
  ) {
    super();
  }
}

// Query Handlers
export interface IQueryHandler<T extends Query, TResult> {
  handle(query: T): Promise<TResult>;
}

@Injectable()
export class GetProduceDetailsQueryHandler implements IQueryHandler<GetProduceDetailsQuery, ProduceDetailsDto> {
  constructor(
    private readonly produceReadModel: IProduceReadModel
  ) {}

  async handle(query: GetProduceDetailsQuery): Promise<ProduceDetailsDto> {
    const produce = await this.produceReadModel.findById(query.produceId);

    if (!produce) {
      throw new ProduceNotFoundError(query.produceId);
    }

    return this.mapToDto(produce);
  }

  private mapToDto(produce: ProduceReadModel): ProduceDetailsDto {
    return {
      id: produce.id,
      farmerId: produce.farmerId,
      origin: produce.origin,
      quality: produce.quality,
      currentPrice: produce.currentPrice,
      status: produce.status,
      createdAt: produce.createdAt,
      updatedAt: produce.updatedAt,
      transferHistory: produce.transferHistory,
      priceHistory: produce.priceHistory
    };
  }
}
```

## 🎭 Saga Pattern Implementation

### Saga Orchestrator

```typescript
export interface ISaga {
  readonly sagaId: string;
  readonly sagaType: string;
  getState(): SagaState;
  getSteps(): SagaStep[];
  getCurrentStep(): SagaStep | null;
}

export interface ISagaOrchestrator {
  start<TData>(sagaType: string, data: TData): Promise<string>;
  handleReply(sagaId: string, reply: SagaReply): Promise<void>;
  getSaga(sagaId: string): Promise<ISaga | null>;
}

export class ProduceTransferSaga implements ISaga {
  readonly sagaId: string;
  readonly sagaType = 'ProduceTransfer';

  private state: SagaState = 'NOT_STARTED';
  private currentStepIndex = -1;
  private readonly steps: SagaStep[] = [
    {
      name: 'ValidateOwnership',
      action: 'VALIDATE_OWNERSHIP',
      compensation: null
    },
    {
      name: 'CreateTransferRecord',
      action: 'CREATE_TRANSFER_RECORD',
      compensation: 'DELETE_TRANSFER_RECORD'
    },
    {
      name: 'UpdateBlockchain',
      action: 'UPDATE_BLOCKCHAIN',
      compensation: 'REVERT_BLOCKCHAIN_UPDATE'
    },
    {
      name: 'SendNotifications',
      action: 'SEND_NOTIFICATIONS',
      compensation: null
    },
    {
      name: 'UpdateSearchIndex',
      action: 'UPDATE_SEARCH_INDEX',
      compensation: 'REVERT_SEARCH_INDEX'
    }
  ];

  constructor(
    private readonly eventStore: IEventStore,
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus
  ) {
    this.sagaId = uuidv4();
  }

  async execute(data: ProduceTransferData): Promise<void> {
    this.state = 'IN_PROGRESS';

    try {
      for (const step of this.steps) {
        this.currentStepIndex++;
        await this.executeStep(step, data);
      }

      this.state = 'COMPLETED';
      await this.eventBus.publish(new SagaCompletedEvent(this.sagaId, this.sagaType));

    } catch (error) {
      this.state = 'FAILED';
      await this.compensate(data, error);
      await this.eventBus.publish(new SagaFailedEvent(this.sagaId, this.sagaType, error));
      throw error;
    }
  }

  private async executeStep(step: SagaStep, data: ProduceTransferData): Promise<void> {
    try {
      await this.commandBus.send(step.action, data);
      await this.eventStore.saveSagaStep(this.sagaId, step.name, 'COMPLETED');
    } catch (error) {
      await this.eventStore.saveSagaStep(this.sagaId, step.name, 'FAILED', error);
      throw error;
    }
  }

  private async compensate(data: ProduceTransferData, error: Error): Promise<void> {
    // Execute compensation actions in reverse order
    for (let i = this.currentStepIndex; i >= 0; i--) {
      const step = this.steps[i];
      if (step.compensation) {
        try {
          await this.commandBus.send(step.compensation, data);
          await this.eventStore.saveSagaStep(this.sagaId, `${step.name}_COMPENSATION`, 'COMPLETED');
        } catch (compensationError) {
          // Log compensation failure but continue with other compensations
          console.error(`Compensation failed for step ${step.name}:`, compensationError);
        }
      }
    }
  }

  getState(): SagaState {
    return this.state;
  }

  getSteps(): SagaStep[] {
    return [...this.steps];
  }

  getCurrentStep(): SagaStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }
}
```

## 🔄 Event Sourcing Implementation

### Event Store

```typescript
export interface IEventStore {
  saveEvents(aggregateId: string, events: DomainEvent[], expectedVersion: number): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getEventStream(aggregateId: string): Promise<EventStream>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  getLatestSnapshot(aggregateId: string): Promise<Snapshot | null>;
}

export class PostgreSQLEventStore implements IEventStore {
  constructor(
    private readonly database: Database,
    private readonly eventSerializer: IEventSerializer
  ) {}

  async saveEvents(aggregateId: string, events: DomainEvent[], expectedVersion: number): Promise<void> {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');

      // Check for concurrency conflicts
      const currentVersion = await this.getCurrentVersion(aggregateId);
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyException(aggregateId, expectedVersion, currentVersion);
      }

      // Save events
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const serializedEvent = this.eventSerializer.serialize(event);

        await client.query(
          `INSERT INTO events (aggregate_id, event_type, event_data, version, timestamp)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            aggregateId,
            event.eventType,
            JSON.stringify(serializedEvent),
            expectedVersion + i + 1,
            event.timestamp
          ]
        );
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getEvents(aggregateId: string, fromVersion: number = 0): Promise<DomainEvent[]> {
    const result = await this.database.query(
      `SELECT * FROM events
       WHERE aggregate_id = $1 AND version > $2
       ORDER BY version ASC`,
      [aggregateId, fromVersion]
    );

    return result.rows.map(row => this.eventSerializer.deserialize(row.event_data, row.event_type));
  }

  async getEventStream(aggregateId: string): Promise<EventStream> {
    const events = await this.getEvents(aggregateId);
    const latestSnapshot = await this.getLatestSnapshot(aggregateId);

    return {
      aggregateId,
      events,
      snapshot: latestSnapshot,
      version: events.length > 0 ? events[events.length - 1].version : 0
    };
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.database.query(
      `INSERT INTO snapshots (aggregate_id, snapshot_data, version, timestamp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (aggregate_id)
       DO UPDATE SET snapshot_data = EXCLUDED.snapshot_data,
                     version = EXCLUDED.version,
                     timestamp = EXCLUDED.timestamp`,
      [
        snapshot.aggregateId,
        JSON.stringify(snapshot.data),
        snapshot.version,
        snapshot.timestamp
      ]
    );
  }

  async getLatestSnapshot(aggregateId: string): Promise<Snapshot | null> {
    const result = await this.database.query(
      `SELECT * FROM snapshots WHERE aggregate_id = $1 ORDER BY version DESC LIMIT 1`,
      [aggregateId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      aggregateId: row.aggregate_id,
      data: JSON.parse(row.snapshot_data),
      version: row.version,
      timestamp: row.timestamp
    };
  }

  private async getCurrentVersion(aggregateId: string): Promise<number> {
    const result = await this.database.query(
      `SELECT MAX(version) as current_version FROM events WHERE aggregate_id = $1`,
      [aggregateId]
    );

    return result.rows[0].current_version || 0;
  }
}
```

### Event Projections

```typescript
export interface IProjection {
  project(event: DomainEvent): Promise<void>;
  getView(viewId: string): Promise<any>;
  reset(): Promise<void>;
}

export class ProduceReadModelProjection implements IProjection {
  constructor(
    private readonly readModelStore: IReadModelStore,
    private readonly eventBus: IEventBus
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    this.eventBus.subscribe('ProduceRegistered', this.handleProduceRegistered.bind(this));
    this.eventBus.subscribe('ProduceQualityUpdated', this.handleProduceQualityUpdated.bind(this));
    this.eventBus.subscribe('ProduceTransferred', this.handleProduceTransferred.bind(this));
    this.eventBus.subscribe('ProducePriceUpdated', this.handleProducePriceUpdated.bind(this));
  }

  async handleProduceRegistered(event: ProduceRegisteredEvent): Promise<void> {
    const produceView = {
      id: event.produceId,
      farmerId: event.farmerId,
      origin: event.origin,
      quality: event.quality,
      currentPrice: event.initialPrice,
      status: 'REGISTERED',
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      transferHistory: [],
      priceHistory: [{
        price: event.initialPrice,
        timestamp: event.timestamp,
        reason: 'Initial registration'
      }]
    };

    await this.readModelStore.save('produces', event.produceId, produceView);
  }

  async handleProduceQualityUpdated(event: ProduceQualityUpdatedEvent): Promise<void> {
    const produceView = await this.readModelStore.get('produces', event.produceId);
    if (produceView) {
      produceView.quality = event.newQuality;
      produceView.updatedAt = event.timestamp;
      await this.readModelStore.save('produces', event.produceId, produceView);
    }
  }

  async handleProduceTransferred(event: ProduceTransferredEvent): Promise<void> {
    const produceView = await this.readModelStore.get('produces', event.produceId);
    if (produceView) {
      produceView.transferHistory.push({
        from: event.from,
        to: event.to,
        timestamp: event.timestamp,
        logisticsInfo: event.logisticsInfo
      });
      produceView.updatedAt = event.timestamp;
      await this.readModelStore.save('produces', event.produceId, produceView);
    }
  }

  async handleProducePriceUpdated(event: ProducePriceUpdatedEvent): Promise<void> {
    const produceView = await this.readModelStore.get('produces', event.produceId);
    if (produceView) {
      produceView.currentPrice = event.newPrice;
      produceView.priceHistory.push({
        price: event.newPrice,
        timestamp: event.timestamp,
        reason: event.reason,
        updater: event.updaterId
      });
      produceView.updatedAt = event.timestamp;
      await this.readModelStore.save('produces', event.produceId, produceView);
    }
  }

  async getView(viewId: string): Promise<any> {
    return await this.readModelStore.get('produces', viewId);
  }

  async reset(): Promise<void> {
    await this.readModelStore.clear('produces');
  }
}
```

## 🔧 Circuit Breaker Pattern

### Circuit Breaker Implementation

```typescript
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ICircuitBreaker {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  getFailureCount(): number;
  reset(): void;
}

export class CircuitBreaker implements ICircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: CircuitState = 'CLOSED';
  private nextAttemptTime = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000, // 1 minute
    private readonly monitoringPeriod: number = 120000 // 2 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (!this.shouldAttemptReset()) {
        throw new CircuitBreakerError('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() >= this.nextAttemptTime;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttemptTime = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    }
  }

  getState(): CircuitState {
    // Auto-transition from HALF_OPEN to OPEN if monitoring period exceeded
    if (this.state === 'HALF_OPEN' && Date.now() > this.nextAttemptTime + this.monitoringPeriod) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    }

    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttemptTime = 0;
    this.lastFailureTime = 0;
  }
}
```

### Circuit Breaker Registry

```typescript
@Injectable()
export class CircuitBreakerRegistry {
  private readonly circuitBreakers = new Map<string, ICircuitBreaker>();

  getOrCreate(name: string, config?: CircuitBreakerConfig): ICircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(
        config?.failureThreshold,
        config?.recoveryTimeout,
        config?.monitoringPeriod
      ));
    }
    return this.circuitBreakers.get(name)!;
  }

  getAll(): Map<string, ICircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  resetAll(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  getStats(): CircuitBreakerStats[] {
    const stats: CircuitBreakerStats[] = [];
    for (const [name, breaker] of this.circuitBreakers) {
      stats.push({
        name,
        state: breaker.getState(),
        failureCount: breaker.getFailureCount()
      });
    }
    return stats;
  }
}
```

## 📊 Advanced Caching Strategy

### Multi-Level Cache Implementation

```typescript
export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
}

export class MultiLevelCache implements ICache {
  constructor(
    private readonly l1Cache: ICache, // Fast in-memory cache
    private readonly l2Cache: ICache, // Distributed cache
    private readonly l3Cache?: ICache  // Optional L3 cache (CDN, etc.)
  ) {}

  async get<T>(key: string): Promise<T | null> {
    // Try L1 cache first
    let data = await this.l1Cache.get<T>(key);
    if (data !== null) {
      return data;
    }

    // Try L2 cache
    data = await this.l2Cache.get<T>(key);
    if (data !== null) {
      // Populate L1 cache asynchronously
      this.l1Cache.set(key, data, 300).catch(err =>
        console.warn('Failed to populate L1 cache:', err)
      );
      return data;
    }

    // Try L3 cache if available
    if (this.l3Cache) {
      data = await this.l3Cache.get<T>(key);
      if (data !== null) {
        // Populate L1 and L2 caches asynchronously
        Promise.all([
          this.l1Cache.set(key, data, 300),
          this.l2Cache.set(key, data, 3600)
        ]).catch(err => console.warn('Failed to populate caches:', err));
        return data;
      }
    }

    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const operations = [
      this.l1Cache.set(key, value, ttl || 300),
      this.l2Cache.set(key, value, ttl || 3600)
    ];

    if (this.l3Cache) {
      operations.push(this.l3Cache.set(key, value, ttl || 7200));
    }

    await Promise.allSettled(operations);
  }

  async delete(key: string): Promise<void> {
    const operations = [
      this.l1Cache.delete(key),
      this.l2Cache.delete(key)
    ];

    if (this.l3Cache) {
      operations.push(this.l3Cache.delete(key));
    }

    await Promise.allSettled(operations);

    // Publish cache invalidation event
    await this.publishCacheInvalidationEvent(key);
  }

  async clear(): Promise<void> {
    const operations = [
      this.l1Cache.clear(),
      this.l2Cache.clear()
    ];

    if (this.l3Cache) {
      operations.push(this.l3Cache.clear());
    }

    await Promise.allSettled(operations);
  }

  async getStats(): Promise<CacheStats> {
    const [l1Stats, l2Stats, l3Stats] = await Promise.allSettled([
      this.l1Cache.getStats(),
      this.l2Cache.getStats(),
      this.l3Cache?.getStats()
    ]);

    return {
      l1: l1Stats.status === 'fulfilled' ? l1Stats.value : null,
      l2: l2Stats.status === 'fulfilled' ? l2Stats.value : null,
      l3: l3Stats.status === 'fulfilled' ? l3Stats.value : null
    };
  }

  private async publishCacheInvalidationEvent(key: string): Promise<void> {
    // Publish event to message bus for other services to invalidate their caches
    try {
      await this.eventBus.publish({
        eventType: 'CacheInvalidated',
        key,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn('Failed to publish cache invalidation event:', error);
    }
  }
}
```

### Cache Warming Strategy

```typescript
export class CacheWarmer {
  constructor(
    private readonly cache: ICache,
    private readonly dataSource: IDataSource,
    private readonly warmingStrategy: IWarmingStrategy
  ) {}

  async warmCache(): Promise<void> {
    const keysToWarm = await this.warmingStrategy.getKeysToWarm();

    console.log(`Starting cache warming for ${keysToWarm.length} keys`);

    const batchSize = 10;
    for (let i = 0; i < keysToWarm.length; i += batchSize) {
      const batch = keysToWarm.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (key) => {
          try {
            const data = await this.dataSource.getData(key);
            if (data) {
              await this.cache.set(key, data);
            }
          } catch (error) {
            console.warn(`Failed to warm cache for key ${key}:`, error);
          }
        })
      );
    }

    console.log('Cache warming completed');
  }

  async warmOnDemand(key: string): Promise<void> {
    try {
      const data = await this.dataSource.getData(key);
      if (data) {
        await this.cache.set(key, data);
        console.log(`Cache warmed for key: ${key}`);
      }
    } catch (error) {
      console.warn(`Failed to warm cache for key ${key}:`, error);
    }
  }
}

export interface IWarmingStrategy {
  getKeysToWarm(): Promise<string[]>;
}

export class PopularItemsWarmingStrategy implements IWarmingStrategy {
  constructor(
    private readonly analyticsService: IAnalyticsService,
    private readonly maxKeys: number = 1000
  ) {}

  async getKeysToWarm(): Promise<string[]> {
    // Get most accessed items from analytics
    const popularItems = await this.analyticsService.getMostAccessedItems(this.maxKeys);
    return popularItems.map(item => `produce:${item.id}`);
  }
}
```

## 🔐 Advanced Security Patterns

### Zero Trust Authentication

```typescript
export class ZeroTrustAuthenticator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly deviceRegistry: IDeviceRegistry,
    private readonly riskEngine: IRiskEngine,
    private readonly mfaService: IMFAService
  ) {}

  async authenticate(
    credentials: Credentials,
    deviceInfo: DeviceInfo,
    context: AuthenticationContext
  ): Promise<AuthenticationResult> {
    // Step 1: Validate credentials
    const user = await this.validateCredentials(credentials);
    if (!user) {
      await this.recordFailedAttempt(credentials.username, deviceInfo);
      throw new InvalidCredentialsError();
    }

    // Step 2: Validate device
    const deviceTrust = await this.deviceRegistry.evaluateDeviceTrust(deviceInfo);
    if (deviceTrust.score < 0.7) {
      throw new UntrustedDeviceError();
    }

    // Step 3: Risk assessment
    const riskScore = await this.riskEngine.assessRisk(user, deviceInfo, context);
    if (riskScore > 0.8) {
      // High risk - require additional verification
      const mfaResult = await this.mfaService.requestVerification(user.id);
      if (!mfaResult.verified) {
        throw new MFADeniedError();
      }
    }

    // Step 4: Generate session with continuous validation
    const session = await this.createContinuousValidationSession(user, deviceInfo);

    return {
      user,
      session,
      deviceTrust,
      riskScore
    };
  }

  private async createContinuousValidationSession(
    user: User,
    deviceInfo: DeviceInfo
  ): Promise<Session> {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: user.id,
      deviceFingerprint: this.generateDeviceFingerprint(deviceInfo),
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      continuousValidation: true
    };

    await this.sessionStore.save(session);
    return session;
  }

  private generateDeviceFingerprint(deviceInfo: DeviceInfo): string {
    const fingerprint = `${deviceInfo.userAgent}-${deviceInfo.ipAddress}-${deviceInfo.screenResolution}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }
}
```

### Homomorphic Encryption Service

```typescript
export class HomomorphicEncryptionService {
  constructor(
    private readonly encryptionScheme: IHomomorphicEncryptionScheme
  ) {}

  async encrypt(data: any): Promise<EncryptedData> {
    const serialized = JSON.stringify(data);
    const encrypted = await this.encryptionScheme.encrypt(serialized);
    return {
      encryptedData: encrypted,
      encryptionScheme: this.encryptionScheme.getName(),
      timestamp: new Date()
    };
  }

  async decrypt(encryptedData: EncryptedData): Promise<any> {
    const decrypted = await this.encryptionScheme.decrypt(encryptedData.encryptedData);
    return JSON.parse(decrypted);
  }

  async computeOnEncrypted(
    operation: string,
    encryptedOperands: EncryptedData[]
  ): Promise<EncryptedData> {
    switch (operation) {
      case 'ADD':
        return await this.encryptionScheme.homomorphicAdd(encryptedOperands[0], encryptedOperands[1]);
      case 'MULTIPLY':
        return await this.encryptionScheme.homomorphicMultiply(encryptedOperands[0], encryptedOperands[1]);
      case 'COMPARE':
        return await this.encryptionScheme.homomorphicCompare(encryptedOperands[0], encryptedOperands[1]);
      default:
        throw new UnsupportedOperationError(operation);
    }
  }

  // Example: Compute average price without decrypting individual prices
  async computeAveragePrice(encryptedPrices: EncryptedData[]): Promise<EncryptedData> {
    if (encryptedPrices.length === 0) {
      throw new EmptyDatasetError();
    }

    let sum = encryptedPrices[0];
    for (let i = 1; i < encryptedPrices.length; i++) {
      sum = await this.computeOnEncrypted('ADD', [sum, encryptedPrices[i]]);
    }

    // Divide by count (would need homomorphic division or pre-computed reciprocal)
    const count = await this.encrypt(encryptedPrices.length);
    return await this.computeOnEncrypted('MULTIPLY', [sum, await this.computeReciprocal(count)]);
  }

  private async computeReciprocal(encryptedNumber: EncryptedData): Promise<EncryptedData> {
    // Implementation would depend on the specific homomorphic encryption scheme
    // This is a simplified example
    return await this.encryptionScheme.computeReciprocal(encryptedNumber);
  }
}
```

This implementation guide provides concrete examples of advanced design patterns that can be applied to create a robust, scalable, and secure agricultural produce tracking system. Each pattern includes detailed TypeScript implementations with proper error handling, validation, and best practices.