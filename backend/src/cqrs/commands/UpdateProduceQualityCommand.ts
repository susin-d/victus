export class UpdateProduceQualityCommand {
  constructor(
    public readonly produceId: string,
    public readonly newQuality: string,
    public readonly updaterId: string
  ) {}
}