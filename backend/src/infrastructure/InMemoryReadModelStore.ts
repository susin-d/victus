export interface IReadModelStore {
  save<T>(collection: string, id: string, data: T): Promise<void>;
  get<T>(collection: string, id: string): Promise<T | null>;
  find<T>(collection: string, query: any): Promise<T[]>;
}

export class InMemoryReadModelStore implements IReadModelStore {
  private data = new Map<string, Map<string, any>>();

  async save<T>(collection: string, id: string, data: T): Promise<void> {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }

    this.data.get(collection)!.set(id, { ...data, id });
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const collectionData = this.data.get(collection);
    if (!collectionData) {
      return null;
    }

    return collectionData.get(id) || null;
  }

  async find<T>(collection: string, query: any): Promise<T[]> {
    const collectionData = this.data.get(collection);
    if (!collectionData) {
      return [];
    }

    const results: T[] = [];
    for (const [id, item] of collectionData) {
      let matches = true;

      for (const [key, value] of Object.entries(query)) {
        if (item[key] !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        results.push(item);
      }
    }

    return results;
  }
}