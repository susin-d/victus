export interface ICommandBus {
  send<TCommand>(command: TCommand): Promise<void>;
  registerHandler<TCommand>(commandType: new (...args: any[]) => TCommand, handler: any): void;
}