import { ICommandBus } from './ICommandBus';
import { ICommandHandler } from './ICommandHandler';

export class CommandBus implements ICommandBus {
  private handlers = new Map<string, ICommandHandler<any>>();

  async send<TCommand>(command: TCommand): Promise<void> {
    const commandType = (command as any).constructor.name;
    const handler = this.handlers.get(commandType);

    if (!handler) {
      throw new Error(`No handler registered for command: ${commandType}`);
    }

    await handler.handle(command);
  }

  registerHandler<TCommand>(
    commandType: new (...args: any[]) => TCommand,
    handler: ICommandHandler<TCommand>
  ): void {
    const commandName = commandType.name;
    this.handlers.set(commandName, handler);
  }
}