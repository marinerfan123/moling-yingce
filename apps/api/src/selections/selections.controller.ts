import { SelectionsService, type AppendSelectionInput, type SelectionsPrincipal } from "./selections.service.js";

export class SelectionsController {
  constructor(private readonly selections = new SelectionsService()) {}

  append(principal: SelectionsPrincipal, body: AppendSelectionInput) {
    return this.selections.append(principal, body);
  }

  current(principal: SelectionsPrincipal, projectId: string, shotNodeId: string) {
    return this.selections.current(principal, { projectId, shotNodeId });
  }
}
