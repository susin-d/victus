export class RegisterProduceCommand {
  constructor(
    public readonly produceId: string,
    public readonly farmerId: string,
    public readonly origin: string,
    public readonly quality: string,
    public readonly initialPrice: number
  ) {}
}