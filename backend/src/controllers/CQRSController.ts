import express from 'express';
import { CommandBus } from '../cqrs/commands/CommandBus';
import { RegisterProduceCommand } from '../cqrs/commands/RegisterProduceCommand';
import { UpdateProduceQualityCommand } from '../cqrs/commands/UpdateProduceQualityCommand';
import { InMemoryReadModelStore } from '../infrastructure/InMemoryReadModelStore';

export class CQRSController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly readModelStore: InMemoryReadModelStore
  ) {}

  async registerProduce(req: Request, res: Response): Promise<void> {
    try {
      const { farmerId, origin, quality, initialPrice } = req.body;

      // Validation
      if (!farmerId || !origin || !quality || !initialPrice) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (initialPrice <= 0) {
        return res.status(400).json({ error: 'Initial price must be positive' });
      }

      // Create command
      const command = new RegisterProduceCommand(
        `produce-${Date.now()}`,
        farmerId,
        origin,
        quality,
        initialPrice
      );

      // Send command
      await this.commandBus.send(command);

      res.status(201).json({
        message: 'Produce registered successfully',
        produceId: command.produceId
      });

    } catch (error) {
      console.error('Error registering produce:', error);
      res.status(500).json({ error: 'Failed to register produce' });
    }
  }

  async updateProduceQuality(req: Request, res: Response): Promise<void> {
    try {
      const { produceId } = req.params;
      const { quality } = req.body;
      const updaterId = req.user?.id || 'system'; // In real app, get from auth

      if (!quality) {
        return res.status(400).json({ error: 'Quality is required' });
      }

      // Create command
      const command = new UpdateProduceQualityCommand(
        produceId,
        quality,
        updaterId
      );

      // Send command
      await this.commandBus.send(command);

      res.json({ message: 'Produce quality updated successfully' });

    } catch (error) {
      console.error('Error updating produce quality:', error);
      res.status(500).json({ error: 'Failed to update produce quality' });
    }
  }

  async getProduce(req: Request, res: Response): Promise<void> {
    try {
      const { produceId } = req.params;

      // Query read model
      const produce = await this.readModelStore.get('produces', produceId);

      if (!produce) {
        return res.status(404).json({ error: 'Produce not found' });
      }

      res.json(produce);

    } catch (error) {
      console.error('Error fetching produce:', error);
      res.status(500).json({ error: 'Failed to fetch produce' });
    }
  }

  async getProducesByFarmer(req: Request, res: Response): Promise<void> {
    try {
      const { farmerId } = req.params;

      // Query read model
      const produces = await this.readModelStore.find('produces', { farmerId });

      res.json({
        farmerId,
        produces,
        count: produces.length
      });

    } catch (error) {
      console.error('Error fetching farmer produces:', error);
      res.status(500).json({ error: 'Failed to fetch farmer produces' });
    }
  }
}