import {
  ModelsService,
  type ModelCapability,
  type ModelCatalogResponse,
  type ModelsPrincipal,
} from "./models.service.js";

export class ModelsController {
  constructor(private readonly models = new ModelsService()) {}

  list(
    principal: ModelsPrincipal,
    projectId: string,
    query: { capability?: ModelCapability } = {},
  ): ModelCatalogResponse {
    return this.models.list(principal, query.capability ? { projectId, capability: query.capability } : { projectId });
  }
}
