import { CalendarProvider } from '../providers/Provider';
import { CalendarInfo } from '../types';

export class ProviderRegistry {
  private providers = new Map<string, CalendarProvider<any>>();
  private sources: CalendarInfo[] = [];

  public updateSources(newSources: CalendarInfo[]): void {
    this.sources = newSources;
  }

  public getSource(id: string): CalendarInfo | undefined {
    return this.sources.find(s => (s as any).id === id);
  }

  public getAllSources(): CalendarInfo[] {
    return this.sources;
  }

  public getConfig(id: string): any | undefined {
    const source = this.getSource(id);
    return source ? (source as any).config : undefined;
  }

  register(provider: CalendarProvider<any>): void {
    if (this.providers.has(provider.type)) {
      console.warn(`Provider with type "${provider.type}" is already registered. Overwriting.`);
    }
    this.providers.set(provider.type, provider);
  }

  getProvider(type: string): CalendarProvider<any> | undefined {
    return this.providers.get(type);
  }

  getProviders(): CalendarProvider<any>[] {
    return Array.from(this.providers.values());
  }
}
