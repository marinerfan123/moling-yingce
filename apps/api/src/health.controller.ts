export class HealthController {
  constructor(
    private readonly version = process.env["RELEASE_SHA"] ?? "test",
    private readonly readiness: () => "ready" | "not_ready" = () => "ready",
  ) {}

  getHealth() {
    return { status: "ok" as const, service: "api", version: this.version, readiness: this.readiness() };
  }
}

export function createApiHealthHandler(controller = new HealthController()) {
  return () => controller.getHealth();
}
