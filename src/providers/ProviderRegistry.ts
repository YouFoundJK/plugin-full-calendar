import { CalendarProvider } from '../providers/Provider';

export class ProviderRegistry {
  private providers = new Map<string, CalendarProvider<any>>();

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
