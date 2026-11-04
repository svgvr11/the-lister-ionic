export interface RuntimeMode {
  production: boolean;
  mockMode?: boolean;
}

export function isMockMode(environment: RuntimeMode): boolean {
  return environment.mockMode === true;
}

export function assertValidRuntimeMode(environment: RuntimeMode): void {
  if (environment.production && isMockMode(environment)) {
    throw new Error('Configuración inválida: mockMode no puede activarse en producción.');
  }
}

export function assertRealSupabaseClientAllowed(environment: RuntimeMode): void {
  assertValidRuntimeMode(environment);
  if (isMockMode(environment)) {
    throw new Error('El cliente real de Supabase no puede utilizarse en modo mock.');
  }
}
