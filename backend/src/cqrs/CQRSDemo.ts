import { CommandBus } from './commands/CommandBus';
import { RegisterProduceCommand } from './commands/RegisterProduceCommand';
import { UpdateProduceQualityCommand } from './commands/UpdateProduceQualityCommand';
import { InMemoryEventStore } from '../infrastructure/InMemoryEventStore';
import { InMemoryReadModelStore } from '../infrastructure/InMemoryReadModelStore';

// Simple command handlers
class RegisterProduceHandler {
  constructor(
    private eventStore: InMemoryEventStore,
    private readModelStore: InMemoryReadModelStore
  ) {}

  async handle(command: RegisterProduceCommand): Promise<void> {
    console.log('Handling RegisterProduceCommand:', command);

    // In a real implementation, this would:
    // 1. Load or create the aggregate
    // 2. Execute business logic
    // 3. Save events
    // 4. Update read model

    // For demo, just save to read model
    await this.readModelStore.save('produces', command.produceId, {
      id: command.produceId,
      farmerId: command.farmerId,
      origin: command.origin,
      quality: command.quality,
      currentPrice: command.initialPrice,
      status: 'REGISTERED',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Produce registered successfully');
  }
}

class UpdateProduceQualityHandler {
  constructor(private readModelStore: InMemoryReadModelStore) {}

  async handle(command: UpdateProduceQualityCommand): Promise<void> {
    console.log('Handling UpdateProduceQualityCommand:', command);

    // Get current produce
    const produce = await this.readModelStore.get('produces', command.produceId) as any;
    if (!produce) {
      throw new Error('Produce not found');
    }

    // Update quality
    produce.quality = command.newQuality;
    produce.updatedAt = new Date();

    // Save updated produce
    await this.readModelStore.save('produces', command.produceId, produce);

    console.log('Produce quality updated successfully');
  }
}

// Demo class
export class CQRSDemo {
  private commandBus: CommandBus;
  private eventStore: InMemoryEventStore;
  private readModelStore: InMemoryReadModelStore;

  constructor() {
    this.eventStore = new InMemoryEventStore();
    this.readModelStore = new InMemoryReadModelStore();
    this.commandBus = new CommandBus();

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register command handlers
    this.commandBus.registerHandler(
      RegisterProduceCommand,
      new RegisterProduceHandler(this.eventStore, this.readModelStore)
    );

    this.commandBus.registerHandler(
      UpdateProduceQualityCommand,
      new UpdateProduceQualityHandler(this.readModelStore)
    );
  }

  async demonstrateCQRS(): Promise<void> {
    console.log('🚀 Starting CQRS Demonstration\n');

    try {
      // 1. Register a new produce (Command)
      console.log('1. Registering new produce...');
      const registerCommand = new RegisterProduceCommand(
        'produce-001',
        'farmer-123',
        'California Farm',
        'Premium Grade A',
        150
      );

      await this.commandBus.send(registerCommand);
      console.log('✅ Produce registered\n');

      // 2. Query the produce (Query)
      console.log('2. Querying produce details...');
      const produce = await this.readModelStore.get('produces', 'produce-001');
      console.log('📋 Produce details:', produce);
      console.log();

      // 3. Update produce quality (Command)
      console.log('3. Updating produce quality...');
      const updateCommand = new UpdateProduceQualityCommand(
        'produce-001',
        'Organic Premium Grade A',
        'inspector-456'
      );

      await this.commandBus.send(updateCommand);
      console.log('✅ Produce quality updated\n');

      // 4. Query updated produce (Query)
      console.log('4. Querying updated produce details...');
      const updatedProduce = await this.readModelStore.get('produces', 'produce-001');
      console.log('📋 Updated produce details:', updatedProduce);
      console.log();

      // 5. Query all produces by farmer (Query)
      console.log('5. Querying all produces by farmer...');
      const farmerProduces = await this.readModelStore.find('produces', { farmerId: 'farmer-123' });
      console.log('📋 Farmer produces:', farmerProduces);
      console.log();

      console.log('🎉 CQRS Demonstration completed successfully!');
      console.log('\nKey CQRS Concepts Demonstrated:');
      console.log('• Commands: RegisterProduceCommand, UpdateProduceQualityCommand');
      console.log('• Queries: Direct read model queries');
      console.log('• Separation of concerns: Write side vs Read side');
      console.log('• Eventual consistency between command and query sides');

    } catch (error) {
      console.error('❌ Error during CQRS demonstration:', error);
    }
  }

  // Public methods for external access
  async registerProduce(produceId: string, farmerId: string, origin: string, quality: string, price: number): Promise<void> {
    const command = new RegisterProduceCommand(produceId, farmerId, origin, quality, price);
    await this.commandBus.send(command);
  }

  async updateProduceQuality(produceId: string, newQuality: string, updaterId: string): Promise<void> {
    const command = new UpdateProduceQualityCommand(produceId, newQuality, updaterId);
    await this.commandBus.send(command);
  }

  async getProduce(produceId: string): Promise<any> {
    return await this.readModelStore.get('produces', produceId);
  }

  async getProducesByFarmer(farmerId: string): Promise<any[]> {
    return await this.readModelStore.find('produces', { farmerId });
  }
}